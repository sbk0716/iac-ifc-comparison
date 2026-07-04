# terraform test: command = plan なので AWS へのデプロイは不要 (宣言値を静的に検証)。
# green: 全 run が pass。red: main.tf の非機能を 1 つ壊すと該当 run が fail する。
#
# 注: server_side_encryption_configuration の rule / cors の cors_rule は「set」なので
# [0] で添字参照できない。one() で単一要素を取り出す。

run "public_access_blocked" {
  command = plan

  assert {
    condition     = aws_s3_bucket_public_access_block.this.block_public_policy == true
    error_message = "S3 は block_public_policy=true で公開ポリシーを禁止すること"
  }
  assert {
    condition     = aws_s3_bucket_public_access_block.this.restrict_public_buckets == true
    error_message = "S3 は restrict_public_buckets=true にすること"
  }
}

run "encryption_is_kms" {
  command = plan

  assert {
    condition     = one(one(aws_s3_bucket_server_side_encryption_configuration.this.rule).apply_server_side_encryption_by_default).sse_algorithm == "aws:kms"
    error_message = "S3 は SSE-KMS (aws:kms / CMK) で暗号化すること"
  }
}

run "versioning_enabled" {
  command = plan

  assert {
    condition     = one(aws_s3_bucket_versioning.this.versioning_configuration).status == "Enabled"
    error_message = "S3 は Versioning を Enabled にすること"
  }
}

run "cors_no_wildcard_origin" {
  command = plan

  # CORS は組込みスキャナルールが無いので、ここで custom アサートする (ワイルドカード Origin 禁止)
  assert {
    condition     = !contains(one(aws_s3_bucket_cors_configuration.this.cors_rule).allowed_origins, "*")
    error_message = "CORS の allowed_origins にワイルドカード '*' を使わないこと"
  }
}
