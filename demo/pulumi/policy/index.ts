import * as aws from "@pulumi/aws";
import { PolicyPack, validateResourceOfType } from "@pulumi/policy";

// CrossGuard PolicyPack: pulumi preview / up 時に評価。
// enforcementLevel: "mandatory" なので違反があると up がブロックされる (deploy 前ゲート)。
new PolicyPack("secure-s3", {
  policies: [
    {
      name: "s3-public-access-blocked",
      description: "S3 は 4 つの public access block フラグを全て true にすること",
      enforcementLevel: "mandatory",
      validateResource: validateResourceOfType(
        aws.s3.BucketPublicAccessBlock,
        (pab, _args, reportViolation) => {
          if (!(pab.blockPublicAcls && pab.blockPublicPolicy && pab.ignorePublicAcls && pab.restrictPublicBuckets)) {
            reportViolation("public access block の 4 フラグを全て true にすること");
          }
        },
      ),
    },
    {
      name: "s3-sse-kms",
      description: "S3 は SSE-KMS (aws:kms) で暗号化すること",
      enforcementLevel: "mandatory",
      validateResource: validateResourceOfType(
        aws.s3.BucketServerSideEncryptionConfigurationV2,
        (sse, _args, reportViolation) => {
          const alg = sse.rules?.[0]?.applyServerSideEncryptionByDefault?.sseAlgorithm;
          if (alg !== "aws:kms") {
            reportViolation("bucket は aws:kms (CMK) で暗号化すること");
          }
        },
      ),
    },
    {
      name: "s3-cors-no-wildcard-origin",
      description: "CORS の allowedOrigins にワイルドカード '*' を使わないこと (組込みルールが無いため custom)",
      enforcementLevel: "mandatory",
      validateResource: validateResourceOfType(
        aws.s3.BucketCorsConfigurationV2,
        (cors, _args, reportViolation) => {
          for (const rule of cors.corsRules ?? []) {
            if ((rule.allowedOrigins ?? []).includes("*")) {
              reportViolation("CORS の allowedOrigins に '*' を使わないこと");
            }
          }
        },
      ),
    },
  ],
});
