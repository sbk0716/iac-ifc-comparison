# iac-ifc-comparison — S3 の非機能を deploy 前に検証するデモ

主要な IaC / IfC ツール（**AWS CDK / Terraform / Pulumi / AWS Blocks**）で **同じ S3 バケットの非機能要件**（Public 遮断・CMK 暗号化・Versioning・TLS 強制・アクセスログ・Object Lock ほか）を実装し、**AWS にデプロイせずに（synth / plan / compile の時点で）** 機械検証するデモです。

肝は「テストが **green** → 非機能を 1 つ壊すと **red**（失敗）」を見せる点。IaC と IfC はどれも最終的に宣言的なインフラ定義（CDK / AWS Blocks なら CloudFormation）へ落ちるので、その手前で非機能を fail-closed に検査できます。

## クイックスタート

```bash
bash run-tests.sh          # CDK / Terraform / Pulumi / AWS Blocks を一括 green 確認（deploy 不要）
bash run-tests.sh cdk      # 個別実行（cdk | terraform | pulumi | aws-blocks）
```

必要ツール（macOS / Homebrew）:

```bash
brew install terraform pulumi checkov cloudformation-guard
# CDK / Pulumi の JS 依存は各デモの初回実行時に自動で npm install されます
```

## 構成

```
demo/
├── cdk/         # AWS CDK ＋ cdk-nag（自作 NagPack）＋ assertions
├── terraform/   # Terraform ＋ terraform test（command = plan）＋ Checkov
├── pulumi/      # Pulumi ＋ CrossGuard（PolicyPack）＋ setMocks unit test
└── aws-blocks/  # AWS Blocks（IfC）の生成 CFN を cfn-guard で検査
run-tests.sh     # 4 デモ一括ランナー（green / red）
```

各デモの詳細は `demo/<tool>/README.md` を参照してください。

## 検証環境（動作確認済みの版）

`aws-cdk-lib 2.261.0` / `cdk-nag 2.38.2` / `Terraform 1.13.0` / `@pulumi/aws 6.83.4` / `pulumi CLI 3.250.0` / `@aws-blocks/blocks 0.2.0`（public preview）/ `Checkov 3.3.0` / `cfn-guard 3.2.0` / `Node.js 23`。

> IaC / IfC ツールは version・preview 状況が流動的です。採用時は使用 version で必ず再確認してください。
