import { Stack, StackProps, RemovalPolicy, Duration, Tags } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as kms from 'aws-cdk-lib/aws-kms';
import { NagSuppressions } from 'cdk-nag';

/**
 * セキュアな S3 バケットを 1 つ定義する。
 * AWS のベストプラクティス (cdk-nag / Well-Architected) に沿った非機能セットを、
 * デモ用に 1 バケットへ凝縮したもの。
 *
 * 実装する S3 非機能:
 *  - Public アクセス禁止 (BLOCK_ALL)
 *  - 暗号化: SSE-KMS (customer managed key) + bucket key
 *  - TLS 強制 (enforceSSL → aws:SecureTransport=false を deny する bucket policy を自動生成)
 *  - Versioning
 *  - Object Lock (WORM, governance 7 年)
 *  - サーバアクセスログ
 *  - CORS (許可 origin/method を明示)
 *  - ライフサイクル (非現行バージョン失効 + IA 遷移)
 *  - 所有権 BucketOwnerEnforced (ACL 無効化)
 *  - 必須タグ
 */
export class SecureBucketStack extends Stack {
  public readonly bucket: s3.Bucket;

  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // 暗号鍵: customer managed key + 年次自動ローテーション
    const key = new kms.Key(this, 'BucketCmk', {
      enableKeyRotation: true,
      alias: 'demo/secure-bucket',
      removalPolicy: RemovalPolicy.RETAIN,
    });

    // アクセスログ保管バケット (それ自体も public 遮断・暗号化・TLS 強制・versioning)
    // 注: サーバアクセスログの委譲は ACL (LogDeliveryWrite) を使うため、ログ保管先は
    // ACL を無効化する BUCKET_OWNER_ENFORCED ではなく OBJECT_WRITER にする必要がある。
    const logsBucket = new s3.Bucket(this, 'AccessLogsBucket', {
      bucketName: 'demo-access-logs',
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      versioned: true,
      objectOwnership: s3.ObjectOwnership.OBJECT_WRITER,
      removalPolicy: RemovalPolicy.RETAIN,
    });
    // ログ保管バケット自身にアクセスログは付けない (再帰回避)。cdk-nag S1 を明示 suppress。
    NagSuppressions.addResourceSuppressions(logsBucket, [
      {
        id: 'AwsSolutions-S1',
        reason: 'これはサーバアクセスログの保管先バケット自身。ログの再帰を避けるためアクセスログは付与しない。',
      },
    ]);

    // 保護対象のセキュアバケット。名前に "secure-data" を含めることで自作 NagPack の対象になる。
    this.bucket = new s3.Bucket(this, 'SecureData', {
      bucketName: 'secure-data-demo',
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.KMS,
      encryptionKey: key,
      bucketKeyEnabled: true,
      enforceSSL: true,
      versioned: true,
      objectLockEnabled: true,
      objectLockDefaultRetention: s3.ObjectLockRetention.governance(Duration.days(2555)),
      objectOwnership: s3.ObjectOwnership.BUCKET_OWNER_ENFORCED,
      serverAccessLogsBucket: logsBucket,
      serverAccessLogsPrefix: 'secure-data/',
      cors: [
        {
          allowedOrigins: ['https://app.example.com'],
          allowedMethods: [s3.HttpMethods.GET, s3.HttpMethods.PUT],
          allowedHeaders: ['*'],
          exposedHeaders: ['ETag'],
          maxAge: 3600,
        },
      ],
      lifecycleRules: [
        {
          noncurrentVersionExpiration: Duration.days(90),
          transitions: [
            {
              storageClass: s3.StorageClass.INFREQUENT_ACCESS,
              transitionAfter: Duration.days(30),
            },
          ],
        },
      ],
      removalPolicy: RemovalPolicy.RETAIN,
    });

    // 必須タグ (NFR: タグガバナンス / コスト配賦)
    Tags.of(this).add('Application', 'iac-ifc-demo');
    Tags.of(this).add('Environment', 'demo');
    Tags.of(this).add('OwnedBy', 'platform');
  }
}
