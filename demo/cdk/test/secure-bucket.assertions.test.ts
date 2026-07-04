import { App } from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { describe, it, beforeAll } from 'vitest';
import { SecureBucketStack } from '../lib/secure-bucket-stack';

// synth した CloudFormation に対して、S3 の各非機能が設定されているかを静的に検査する。
// AWS へのデプロイは不要 (数秒で完了、CI で即時 feedback)。
let template: Template;

beforeAll(() => {
  const app = new App();
  const stack = new SecureBucketStack(app, 'Test');
  template = Template.fromStack(stack);
});

describe('S3 非機能 (静的検証・deploy 不要)', () => {
  it('NFR: Public アクセスを完全にブロック', () => {
    template.hasResourceProperties('AWS::S3::Bucket', {
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        BlockPublicPolicy: true,
        IgnorePublicAcls: true,
        RestrictPublicBuckets: true,
      },
    });
  });

  it('NFR: SSE-KMS (CMK) 暗号化', () => {
    template.hasResourceProperties('AWS::S3::Bucket', {
      BucketEncryption: {
        ServerSideEncryptionConfiguration: [
          Match.objectLike({
            ServerSideEncryptionByDefault: { SSEAlgorithm: 'aws:kms' },
          }),
        ],
      },
    });
  });

  it('NFR: Versioning 有効', () => {
    template.hasResourceProperties('AWS::S3::Bucket', {
      VersioningConfiguration: { Status: 'Enabled' },
    });
  });

  it('NFR: Object Lock (WORM) 有効', () => {
    template.hasResourceProperties('AWS::S3::Bucket', {
      ObjectLockEnabled: true,
    });
  });

  it('NFR: CORS を明示設定', () => {
    template.hasResourceProperties('AWS::S3::Bucket', {
      CorsConfiguration: Match.objectLike({ CorsRules: Match.anyValue() }),
    });
  });

  it('NFR: サーバアクセスログ有効', () => {
    template.hasResourceProperties('AWS::S3::Bucket', {
      LoggingConfiguration: Match.anyValue(),
    });
  });

  it('NFR: TLS 強制 (aws:SecureTransport=false を deny する bucket policy)', () => {
    template.hasResourceProperties('AWS::S3::BucketPolicy', {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Effect: 'Deny',
            Condition: { Bool: { 'aws:SecureTransport': 'false' } },
          }),
        ]),
      },
    });
  });
});
