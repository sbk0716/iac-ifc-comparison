import * as aws from "@pulumi/aws";

/**
 * セキュアな S3 バケットと関連リソースを作成する。
 * ユニットテスト (setMocks) から検証できるよう、全リソースを返す。
 */
export interface SecureBucketResources {
  key: aws.kms.Key;
  bucket: aws.s3.BucketV2;
  pab: aws.s3.BucketPublicAccessBlock;
  sse: aws.s3.BucketServerSideEncryptionConfigurationV2;
  versioning: aws.s3.BucketVersioningV2;
  cors: aws.s3.BucketCorsConfigurationV2;
}

export function createSecureBucket(name: string): SecureBucketResources {
  // 暗号鍵: CMK + 年次ローテーション
  const key = new aws.kms.Key(`${name}-cmk`, {
    description: "CMK for secure S3 demo",
    enableKeyRotation: true,
  });

  const bucket = new aws.s3.BucketV2(name, {
    bucket: name,
    objectLockEnabled: true,
  });

  // NFR: Public アクセス禁止
  const pab = new aws.s3.BucketPublicAccessBlock(`${name}-pab`, {
    bucket: bucket.id,
    blockPublicAcls: true,
    blockPublicPolicy: true,
    ignorePublicAcls: true,
    restrictPublicBuckets: true,
  });

  // NFR: 暗号化 (SSE-KMS / CMK)
  const sse = new aws.s3.BucketServerSideEncryptionConfigurationV2(`${name}-sse`, {
    bucket: bucket.id,
    rules: [{
      applyServerSideEncryptionByDefault: {
        sseAlgorithm: "aws:kms",
        kmsMasterKeyId: key.arn,
      },
      bucketKeyEnabled: true,
    }],
  });

  // NFR: Versioning
  const versioning = new aws.s3.BucketVersioningV2(`${name}-ver`, {
    bucket: bucket.id,
    versioningConfiguration: { status: "Enabled" },
  });

  // NFR: CORS (ワイルドカード Origin を使わない)
  const cors = new aws.s3.BucketCorsConfigurationV2(`${name}-cors`, {
    bucket: bucket.id,
    corsRules: [{
      allowedMethods: ["GET", "PUT"],
      allowedOrigins: ["https://app.example.com"],
      allowedHeaders: ["*"],
      exposeHeaders: ["ETag"],
      maxAgeSeconds: 3600,
    }],
  });

  return { key, bucket, pab, sse, versioning, cors };
}
