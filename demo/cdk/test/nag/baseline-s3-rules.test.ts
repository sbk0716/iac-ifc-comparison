import { App, Aspects, Stack } from 'aws-cdk-lib';
import { Annotations, Match } from 'aws-cdk-lib/assertions';
import { CfnBucket } from 'aws-cdk-lib/aws-s3';
import { describe, it } from 'vitest';
import { BaselineS3Checks } from '../../lib/nag/baseline-s3-rules';
import { SecureBucketStack } from '../../lib/secure-bucket-stack';

// 自作 cdk-nag ルールが「非機能を満たすと green / 壊すと red」になることを synth 時に検査する。
describe('cdk-nag BaselineS3Checks (synth 時ゲート・deploy 不要)', () => {
  it('GREEN: secure-data バケットは Baseline ルールを全て満たす', () => {
    const app = new App();
    const stack = new SecureBucketStack(app, 'Green');
    Aspects.of(stack).add(new BaselineS3Checks());

    const annotations = Annotations.fromStack(stack);
    annotations.hasNoError('*', Match.stringLikeRegexp('Baseline-S3CmkEncryption'));
    annotations.hasNoError('*', Match.stringLikeRegexp('Baseline-S3ObjectLock'));
  });

  it('RED: CMK も Object Lock も無いバケットは Baseline ルールで fail する', () => {
    const app = new App();
    const stack = new Stack(app, 'Red');
    // わざと非機能を満たさないバケット (暗号化指定なし / Object Lock なし)
    new CfnBucket(stack, 'Weak', { bucketName: 'secure-data-weak' });
    Aspects.of(stack).add(new BaselineS3Checks());

    const annotations = Annotations.fromStack(stack);
    annotations.hasError('*', Match.stringLikeRegexp('Baseline-S3CmkEncryption'));
    annotations.hasError('*', Match.stringLikeRegexp('Baseline-S3ObjectLock'));
  });
});
