#!/usr/bin/env bash
#
# demo/ 各ツールの「S3 非機能を deploy 前に検証する」テストをまとめて実行するランナー。
# AWS へのデプロイは不要 (静的検証のみ)。
#
# 使い方:
#   bash run-tests.sh              # 全デモの green テストを実行
#   bash run-tests.sh cdk          # 特定デモのみ (cdk | terraform | pulumi)
#
# 必要ツール (無いものは自動 SKIP):
#   - CDK / Pulumi: node, npm      (初回は依存を自動 npm install)
#   - Terraform:    terraform      (初回は自動 terraform init)  + checkov (任意)
#
# ツールのインストール (macOS, Homebrew):
#   brew install pulumi checkov          # Terraform は brew install terraform
# アンインストール:
#   brew uninstall pulumi checkov
#
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET="${1:-all}"

# terraform plan/test は deploy 不要だが資格情報を要求するためダミーを注入 (未設定時のみ)
export AWS_ACCESS_KEY_ID="${AWS_ACCESS_KEY_ID:-test}"
export AWS_SECRET_ACCESS_KEY="${AWS_SECRET_ACCESS_KEY:-test}"
export AWS_DEFAULT_REGION="${AWS_DEFAULT_REGION:-ap-northeast-1}"

have() { command -v "$1" >/dev/null 2>&1; }
declare -a SUMMARY

section() { echo; echo "════════════════════════════════════════"; echo "  $1"; echo "════════════════════════════════════════"; }

run_cdk() {
  section "CDK — cdk-nag (自作 NagPack) + assertions"
  if ! have npm; then SUMMARY+=("CDK        SKIP  (npm 未インストール)"); return; fi
  ( cd "$ROOT/demo/cdk" \
      && { [ -d node_modules ] || { echo "[deps] npm install ..."; npm install >/dev/null 2>&1; }; } \
      && echo "[test] npm test" && npm test )
  local rc=$?
  [ $rc -eq 0 ] && SUMMARY+=("CDK        PASS  (assertions + cdk-nag green)") || SUMMARY+=("CDK        FAIL  (rc=$rc)")
}

run_terraform() {
  section "Terraform — terraform test (plan) + checkov"
  if ! have terraform; then SUMMARY+=("Terraform  SKIP  (terraform 未インストール)"); return; fi
  cd "$ROOT/demo/terraform" || return
  [ -d .terraform ] || { echo "[init] terraform init ..."; terraform init -no-color >/dev/null 2>&1; }
  echo "[test] terraform test"
  terraform test -no-color
  local rc_test=$?
  local rc_ck=0
  if have checkov; then
    echo "[scan] checkov -d . --skip-download"
    # --skip-download: 外部ガイドライン API (prismacloud) に取りに行かない (オフライン・トレース抑止)
    checkov -d . --compact --quiet --skip-download
    rc_ck=$?
  else
    echo "[scan] checkov 未インストール → SKIP"
  fi
  if [ $rc_test -eq 0 ] && [ $rc_ck -eq 0 ]; then
    SUMMARY+=("Terraform  PASS  (terraform test + checkov green)")
  else
    SUMMARY+=("Terraform  FAIL  (test rc=$rc_test / checkov rc=$rc_ck)")
  fi
}

run_pulumi() {
  section "Pulumi — setMocks unit test (CrossGuard は別途 pulumi CLI)"
  if ! have npm; then SUMMARY+=("Pulumi     SKIP  (npm 未インストール)"); return; fi
  ( cd "$ROOT/demo/pulumi" \
      && { [ -d node_modules ] || { echo "[deps] npm install ..."; npm install >/dev/null 2>&1; }; } \
      && echo "[test] npm test" && npm test )
  local rc=$?
  [ $rc -eq 0 ] && SUMMARY+=("Pulumi     PASS  (setMocks unit test green)") || SUMMARY+=("Pulumi     FAIL  (rc=$rc)")
}

run_awsblocks() {
  section "AWS Blocks (IfC, preview) — blocks.ts 型検証 + 生成 CFN を cfn-guard で機械検証"
  cd "$ROOT/demo/aws-blocks" || return
  # (1) 実コード blocks.ts を実 @aws-blocks/blocks API に対して型検証
  #     (node_modules があるときのみ。依存が重いため runner では自動 install しない)
  local rc_tc="skip"
  if [ -d node_modules ] && have npx; then
    echo "[typecheck] blocks.ts (実 @aws-blocks/blocks v0.2.0 API)"
    if npx tsc --noEmit >/dev/null 2>&1; then rc_tc=0; else rc_tc=1; fi
    echo "  blocks.ts typecheck rc=$rc_tc"
  else
    echo "[typecheck] blocks.ts skip (node_modules 無し → cd demo/aws-blocks && npm install)"
  fi
  # (2) 生成 CFN を cfn-guard で機械検証 (default=穴あり→FAIL / hardened=補完済→PASS)
  if ! have cfn-guard; then SUMMARY+=("AWS Blocks SKIP  (cfn-guard 未: brew install cloudformation-guard)"); return; fi
  echo "[guard] generated-default.json (穴あり) → FAIL を期待"
  cfn-guard validate --rules secure-s3.guard --data generated-default.json >/dev/null 2>&1; local rc_def=$?
  echo "[guard] generated-hardened.json (補完済) → PASS を期待"
  cfn-guard validate --rules secure-s3.guard --data generated-hardened.json >/dev/null 2>&1; local rc_hard=$?
  echo "  default rc=$rc_def (非0=FAIL) / hardened rc=$rc_hard (0=PASS)"
  if [ $rc_def -ne 0 ] && [ $rc_hard -eq 0 ] && [ "$rc_tc" != "1" ]; then
    SUMMARY+=("AWS Blocks PASS  (blocks.ts typecheck=$rc_tc / default=FAIL / hardened=PASS)")
  else
    SUMMARY+=("AWS Blocks FAIL  (typecheck=$rc_tc / default rc=$rc_def / hardened rc=$rc_hard)")
  fi
}

case "$TARGET" in
  cdk)         run_cdk ;;
  terraform)   run_terraform ;;
  pulumi)      run_pulumi ;;
  aws-blocks)  run_awsblocks ;;
  all)         run_cdk; run_terraform; run_pulumi; run_awsblocks ;;
  *) echo "usage: bash run-tests.sh [all|cdk|terraform|pulumi|aws-blocks]"; exit 2 ;;
esac

section "SUMMARY"
for line in "${SUMMARY[@]}"; do echo "  $line"; done
echo
echo "red を試すには: 各 demo の README『green → red』の手順で非機能を 1 つ壊し、再実行すると FAIL する。"

# 1 つでも FAIL があれば非 0 終了
for line in "${SUMMARY[@]}"; do [[ "$line" == *FAIL* ]] && exit 1; done
exit 0
