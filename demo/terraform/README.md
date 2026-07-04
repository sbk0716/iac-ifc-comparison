# demo/terraform — Terraform / OpenTofu で S3 非機能を書き、deploy 前に検証する

HCL（設定言語）で S3 の非機能を宣言し、**AWS にデプロイせずに** 2 系統で検証する:

- **`terraform test`**（`command = plan`）: 宣言値に直接アサート（[tests/secure_bucket.tftest.hcl](./tests/secure_bucket.tftest.hcl)）。
- **Checkov**（policy-as-code / 静的スキャン）: 組込みルール `CKV_AWS_*` で S3 の非機能を検査。

> `terraform` を `tofu`（OpenTofu）に置き換えても同じ手順で動く。

## 前提

- Terraform >= 1.6（`terraform test` GA）または OpenTofu >= 1.6
- Checkov（`pip install checkov`）※任意
- デモは deploy 不要。`main.tf` の provider は認証検証をスキップ済みだが、`terraform` はダミー資格情報を要求するので下記を export する。

## 実行

```bash
cd demo/terraform
export AWS_ACCESS_KEY_ID=test AWS_SECRET_ACCESS_KEY=test AWS_DEFAULT_REGION=ap-northeast-1

terraform init
terraform test        # green: public block / 暗号化 / versioning / CORS の run が全 pass

checkov -d . --skip-download   # green: CKV_AWS_* が pass (--skip-download で外部API取得を抑止) ※任意
```

## green → red（デモの肝）

`main.tf` の非機能を 1 つ壊すと、同じテストが **red** になる:

| 壊し方 | 失敗するもの |
|--------|--------------|
| `aws_s3_bucket_public_access_block.this` の `block_public_policy` を `false` に | `terraform test` の `public_access_blocked` ＋ Checkov `CKV_AWS_56` |
| `sse_algorithm` を `"AES256"`（S3 管理鍵）に、または暗号化リソースごと削除 | `terraform test` の `encryption_is_kms`（＋ Checkov の暗号化ルール） |
| `versioning` の `status` を `"Suspended"` に | `terraform test` の `versioning_enabled` ＋ Checkov `CKV_AWS_21` |
| CORS の `allowed_origins` に `"*"` を追加 | `terraform test` の `cors_no_wildcard_origin`（custom アサート） |

## メモ

- **CORS には組込みスキャナルールが無い**ため、`terraform test` の custom アサートで「ワイルドカード Origin 禁止」を検査している（[04-nfr-testing-s3.md](../../docs/04-nfr-testing-s3.md)）。
- 検証 ID（`CKV_AWS_*`）は Checkov の version で再編されるので、使用 version の Policy Index で確認すること。
- `command = plan` は宣言値の検証（S 層）。実挙動・drift は `command = apply`（D 層、実 AWS が必要）で別途。
