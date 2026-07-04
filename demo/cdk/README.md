# demo/cdk — AWS CDK で S3 非機能を実装し、deploy 前に検証する

AWS のベストプラクティス（cdk-nag / Well-Architected）に沿って、S3 の非機能実装と自作 cdk-nag ルールを最小の自己完結デモに落としたもの。

## 何を見せるか

1 つの「セキュアな S3 バケット」を CDK（TypeScript = 実言語）で定義し、**AWS にデプロイせずに** 非機能を 2 系統で検証する:

- **アサーション** (`aws-cdk-lib/assertions` の `Template.hasResourceProperties`) — synth した CloudFormation に対して、各 NFR（Public 禁止 / CMK 暗号化 / Versioning / CORS / TLS 強制 / Object Lock / アクセスログ）が設定されているかを 1 項目ずつ検査。
- **cdk-nag（自作 NagPack `Baseline`）** — `Baseline-S3CmkEncryption` / `Baseline-S3ObjectLock` を synth 時に **fail-closed** で強制。NFR 違反があると synth 自体が失敗する。

## 前提

- Node.js 20+ / npm

## 実行

```bash
cd demo/cdk
npm install

# 1) アサーション + cdk-nag のテスト（deploy 不要・数秒）
npm test

# 2) synth ゲート（自作 NagPack が違反時に synth を止める）
npm run synth        # green: セキュアなバケットなので成功
```

## green → red（デモの肝）

`lib/secure-bucket-stack.ts` の `SecureData` バケットから、例えば以下を 1 つ外す:

- `encryptionKey: key` を削除（CMK を外す）→ `Baseline-S3CmkEncryption` が **ERROR**
- `objectLockEnabled: true` と `objectLockDefaultRetention` を削除 → `Baseline-S3ObjectLock` が **ERROR**

すると `npm test`（RED ケース）と `npm run synth` の両方で **失敗** し、どの NFR が壊れたかがルール名で即座に分かる。これが「AI に書かせても、非機能は機械が fail-closed で守る」というレールの実演。

## ファイル

| ファイル | 役割 |
|----------|------|
| `bin/app.ts` | CDK app。自作 NagPack `BaselineS3Checks` を synth ゲートとして登録 |
| `lib/secure-bucket-stack.ts` | セキュアな S3（+ アクセスログ用バケット + CMK）を定義 |
| `lib/nag/baseline-s3-rules.ts` | 自作 cdk-nag ルール（CMK 暗号化 / Object Lock）。baseline `custom-rules.ts` の縮約 |
| `test/secure-bucket.assertions.test.ts` | 各 NFR を `hasResourceProperties` で検査 |
| `test/nag/baseline-s3-rules.test.ts` | 自作ルールの green（充足）/ red（違反で fail）を検査 |
