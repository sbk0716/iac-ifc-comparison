# demo/aws-blocks — AWS Blocks（IfC）で S3 を書き、生成 CFN を機械検証する

> ⚠️ **AWS Blocks は public preview（`@aws-blocks/blocks` v0.2.0、2026-06 発表・Apache-2.0）**。破壊的変更あり・SLA なし。本デモは「**IfC でも、生成物が CloudFormation なら cfn-guard で NFR を機械検証できる**」ことを示す。

## 実コード: [blocks.ts](./blocks.ts)（S3 を FileBucket で作る）

他ツール（CDK / Terraform / Pulumi）の「S3 を作るコード」と対になる、AWS Blocks の実コード。**インストールした `@aws-blocks/blocks` v0.2.0 の実 API に基づき、`tsc --noEmit` で型検証済み**（`bash run-tests.sh aws-blocks` に含む / `cd demo/aws-blocks && npm install && npm run typecheck`）。

```ts
import { FileBucket, type Scope } from "@aws-blocks/blocks/cdk";

export function defineUserUploads(scope: Scope): FileBucket {
  return new FileBucket(scope, "user-uploads", {
    versioned: true,                                                  // NFR: Versioning (既定 false → opt-in)
    corsRules: [{ allowedOrigins: ["https://app.example.com"],
                  allowedMethods: ["GET", "PUT"], maxAge: 3600 }],    // NFR: CORS
    lifecycleRules: [{ prefix: "tmp/", expirationDays: 90 }],         // NFR: lifecycle
    removalPolicy: "retain",
  });
}
```

FileBucket は「宣言するだけ」で内部が S3 + 周辺を生成する。ただし **Block API に無い非機能（SSE-KMS/CMK・TLS 強制・アクセスログ・Object Lock）** は生成 CFN 側で補完し、下記の cfn-guard で機械検証する。

## 生成 CFN の機械検証（cfn-guard で実際にテストできる）

AWS Blocks は「機能 Block を import するだけ」でインフラを生成する IfC だが、その正体は **CDK アプリ**で、内部で **CDK construct → CloudFormation** を生成する。よって **生成された CFN に cfn-guard を後段適用**すれば、IfC でも非機能を deploy 前に fail-closed で検証できる。

本デモには、FileBucket が生成する CloudFormation を代表する 2 つのテンプレートを置いてある:

| ファイル | 内容 | cfn-guard 結果 |
|----------|------|----------------|
| [generated-default.json](./generated-default.json) | FileBucket 既定相当（public 遮断＋SSE-S3、**Versioning 無効・CMK 無し**） | **FAIL（red）** — 穴を可視化 |
| [generated-hardened.json](./generated-hardened.json) | opt-in ＋ escape hatch で補完（Versioning 有効・SSE-KMS） | **PASS（green）** |

検証ルールは [secure-s3.guard](./secure-s3.guard)（cfn-guard 3.x）。

## 実行

```bash
# ランナー経由 (推奨: blocks.ts の型検証 + cfn-guard をまとめて実行)
bash ../../run-tests.sh aws-blocks

# 個別:
npm install && npm run typecheck                                           # blocks.ts を実 API で型検証
cfn-guard validate --rules secure-s3.guard --data generated-default.json   # → FAIL (exit 19)
cfn-guard validate --rules secure-s3.guard --data generated-hardened.json  # → PASS (exit 0)
```

`cfn-guard` は `brew install cloudformation-guard`（アンインストール: `brew uninstall cloudformation-guard`）。

## FileBucket の既定と"穴"（調査で確認）

AWS Blocks の `FileBucket`（S3）はソース上、**既定で public 遮断＋SSE-S3** と安全側だが、**以下が Block API から欠落**している:

- SSE-KMS / CMK（顧客管理鍵）を選ぶ typed option が**ない**（SSE-S3 固定）
- TLS 強制（`enforceSSL`）が FileBucket には**付かない**
- サーバアクセスログ / Object Lock も未露出
- Versioning は既定 **false**（opt-in）

→ だから `generated-default.json` に cfn-guard を当てると **Versioning 無効・CMK 無しで FAIL** する。これが「IfC は抽象化の裏で非機能を"触れない/保証しない"領域が残る → policy-as-code を人間側の安全網として必須化する」という本デモの教訓（[05-recommendation.md](../../docs/05-recommendation.md)）。

## 実 AWS Blocks を試す場合（preview・任意）

```bash
npx @aws-blocks/create-blocks-app my-app     # preview のスキャフォールド
# FileBucket を宣言 (versioned / corsRules / lifecycleRules は opt-in 可、SSE-KMS/enforceSSL は escape hatch)
cdk synth --conditions=cdk > template.json   # 生成 CFN を取得
cfn-guard validate --rules secure-s3.guard --data template.json
```

> `@aws-blocks/*` は preview で version により API・生成 CFN が変わる。上記 2 テンプレートは代表例で、**cfn-guard の機械検証部分は実 CFN でもそのまま使える**。本番採用は GA 待ち＋policy-as-code 必須化が推奨（[05-recommendation.md](../../docs/05-recommendation.md)）。

## 出典

AWS Blocks の実在・preview・FileBucket 既定値 → [references/sources/aws-blocks.md](../../references/sources/aws-blocks.md)
