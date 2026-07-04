# demo/ — S3 を題材にした「非機能を書いて、deploy 前にテストする」実演

各 IaC / IfC ツールで **同じ S3 バケットの非機能要件** を実装し、**AWS にデプロイせずに（synth / plan / compile 時に）** それらが満たされているかをテストする。デモの肝は「テストが **green** → わざと非機能を壊すと **red**（失敗）になる」ことを見せる点。

## 検証する S3 非機能（4 項目にこだわらず、静的に検証できるものを最大化）

| # | 非機能 | 実装 | 静的テスト手段の例 |
|---|--------|------|---------------------|
| 1 | **Public アクセス禁止** | BlockPublicAccess = BLOCK_ALL | assertion / policy-as-code |
| 2 | **暗号化（CMK）** | SSE-KMS + customer managed key | assertion / cdk-nag・Checkov |
| 3 | **Versioning** | versioning 有効 | assertion / policy-as-code |
| 4 | **CORS** | 許可 origin / method を明示 | assertion |
| 5 | **TLS 強制** | `aws:SecureTransport=false` を deny する bucket policy | assertion / cdk-nag S10・Checkov |
| 6 | **Object Lock（WORM）** | governance/compliance retention | assertion / 自作 policy rule |
| 7 | **アクセスログ** | server access logging 有効 | assertion / cdk-nag S1 |
| 8 | **ライフサイクル** | 非現行バージョン失効 + IA 遷移 | assertion |
| 9 | **必須タグ** | Application / Environment / OwnedBy | assertion / policy-as-code |
| 10 | **所有権** | BucketOwnerEnforced（ACL 無効化） | assertion |

> 「静的に検証できるもの」を厚めに拾う方針（非機能を S / S+D / D-only に分類する考え方）。実トラフィックや実際の暗号化挙動など **runtime でしか確認できないもの** は別途 deploy 後検証に回す。

## ツール別ステータス

| ツール | 分類 | ディレクトリ | 状態 |
|--------|------|--------------|------|
| **AWS CDK** | IaC（実言語 TS） | `demo/cdk/` | ✅ cdk-nag + assertions（テスト green 実機確認済） |
| **Terraform / OpenTofu** | IaC（HCL） | `demo/terraform/` | ✅ `terraform test`（plan）＋ Checkov（green 実機確認済） |
| **Pulumi** | IaC（実言語 TS） | `demo/pulumi/` | ✅ setMocks unit test ＋ CrossGuard PolicyPack（green 実機確認済） |
| **AWS Blocks** | IfC（CDK ベース・**preview**） | `demo/aws-blocks/` | ✅ 実コード `blocks.ts` を実 API で型検証 ＋ 生成 CFN を cfn-guard 検証（default=red / hardened=green） |

> Wing は開発元が 2025-04 に事業停止・更新停止のため、**動くデモ対象からは除外**（比較表には「IfC の反面教師」として掲載）。
>
> 一括実行: `bash ../run-tests.sh`（[../run-tests.sh](../run-tests.sh)）。

## 共通の見せ方（green → red）

1. `green`: 非機能を満たした実装 → テスト成功 / policy チェック pass。
2. `red`: 実装から 1 つ非機能を外す（例: CMK を外す・Object Lock を消す） → 同じテストが **失敗** し、どの NFR が壊れたか即座に分かる。

各ツールの実行手順は各ディレクトリの `README.md` を参照。
