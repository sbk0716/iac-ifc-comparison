/**
 * AWS Blocks (IfC) — S3 (FileBucket) を宣言する実コード。
 * `@aws-blocks/blocks` v0.2.0 (public preview) の実 API に基づく。
 * 他ツール (CDK / Terraform / Pulumi) の「S3 を作るコード」と対を成す。
 *
 * AWS Blocks は「機能 Block を宣言するだけ」で、内部が CDK → CloudFormation を生成する IfC。
 * FileBucket は既定で public 遮断 + SSE-S3。Versioning / CORS / lifecycle は opt-in。
 *
 * ⚠️ 非機能の"穴": SSE-KMS(CMK) / TLS 強制(enforceSSL) / アクセスログ / Object Lock は
 * FileBucket の Block API に無い。これらは生成 CFN への escape hatch (CDK layer) + policy-as-code で
 * 補完する前提。生成 CFN の機械検証は cfn-guard を使う (secure-s3.guard / generated-*.json)。
 */
import { FileBucket, type Scope } from "@aws-blocks/blocks/cdk";

/**
 * ユーザーアップロード用の FileBucket を宣言する。
 * scope には Blocks アプリの BlocksStack / Scope を渡す
 * (実アプリでは `npx @aws-blocks/create-blocks-app` が生成する app 内で呼ぶ)。
 */
export function defineUserUploads(scope: Scope): FileBucket {
  return new FileBucket(scope, "user-uploads", {
    // NFR: Versioning — FileBucket 既定は false のため明示 opt-in
    versioned: true,

    // NFR: CORS — ワイルドカード Origin を避け、許可 origin/method を明示
    corsRules: [
      {
        allowedOrigins: ["https://app.example.com"],
        allowedMethods: ["GET", "PUT"],
        allowedHeaders: ["*"],
        exposedHeaders: ["ETag"],
        maxAge: 3600,
      },
    ],

    // NFR: ライフサイクル — 一時領域を自動失効
    lifecycleRules: [{ prefix: "tmp/", expirationDays: 90 }],

    // 破棄挙動 (本番は retain。sandbox なら 'destroy')
    removalPolicy: "retain",
  });
}
