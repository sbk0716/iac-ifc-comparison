import { CfnResource, Stack } from 'aws-cdk-lib';
import { IConstruct } from 'constructs';
import { CfnBucket } from 'aws-cdk-lib/aws-s3';
import { NagPack, NagPackProps, NagMessageLevel, NagRuleCompliance } from 'cdk-nag';

/**
 * 自作 cdk-nag NagPack。cdk-nag の一般的な custom rule パターンに沿った、
 * S3 用の最小デモ (CMK 暗号化 / Object Lock)。
 *
 * baseline と同じく「バケット名の substring で保護対象を絞り、対象外は NOT_APPLICABLE、
 * 条件未達は NON_COMPLIANT、充足で COMPLIANT」というパターン。
 * ここでは対象を "secure-data" を名前に含むバケットに限定 (ログ保管バケット等は対象外)。
 */

const TARGET = 'secure-data';

function bucketName(node: CfnBucket): string | undefined {
  const resolved = Stack.of(node).resolve(node.bucketName);
  return typeof resolved === 'string' ? resolved : undefined;
}

/** SSE-KMS (CMK) 暗号化が設定されているか */
function s3CmkEncryption(node: CfnResource): NagRuleCompliance {
  if (!(node instanceof CfnBucket)) return NagRuleCompliance.NOT_APPLICABLE;
  const name = bucketName(node);
  if (!name || !name.includes(TARGET)) return NagRuleCompliance.NOT_APPLICABLE;

  const enc = Stack.of(node).resolve(node.bucketEncryption);
  const configs = enc?.serverSideEncryptionConfiguration;
  if (!Array.isArray(configs) || configs.length === 0) return NagRuleCompliance.NON_COMPLIANT;

  for (const c of configs) {
    const def = Stack.of(node).resolve(c)?.serverSideEncryptionByDefault;
    if (!def || def.sseAlgorithm !== 'aws:kms' || def.kmsMasterKeyId === undefined) {
      return NagRuleCompliance.NON_COMPLIANT;
    }
  }
  return NagRuleCompliance.COMPLIANT;
}

/** Object Lock (WORM) が有効かつ default retention が設定されているか */
function s3ObjectLock(node: CfnResource): NagRuleCompliance {
  if (!(node instanceof CfnBucket)) return NagRuleCompliance.NOT_APPLICABLE;
  const name = bucketName(node);
  if (!name || !name.includes(TARGET)) return NagRuleCompliance.NOT_APPLICABLE;

  const enabled = Stack.of(node).resolve(node.objectLockEnabled);
  const config = Stack.of(node).resolve(node.objectLockConfiguration);
  return enabled === true && config !== undefined
    ? NagRuleCompliance.COMPLIANT
    : NagRuleCompliance.NON_COMPLIANT;
}

export class BaselineS3Checks extends NagPack {
  constructor(props?: NagPackProps) {
    super(props);
    this.packName = 'Baseline';
  }

  public visit(node: IConstruct): void {
    if (node instanceof CfnResource) {
      this.applyRule({
        ruleSuffixOverride: 'S3CmkEncryption',
        info: 'secure-data バケットは SSE-KMS (CMK) 暗号化が必須。',
        explanation:
          'S3_MANAGED では鍵ローテーション・鍵アクセス制御を顧客が管理できず、規制業界の要件を満たさない。',
        level: NagMessageLevel.ERROR,
        rule: s3CmkEncryption,
        node,
      });
      this.applyRule({
        ruleSuffixOverride: 'S3ObjectLock',
        info: 'secure-data バケットは Object Lock (WORM) が必須。',
        explanation:
          '監査ログ改ざん防止・法令保持要件のため Object Lock (retention 付き) を有効化する。',
        level: NagMessageLevel.ERROR,
        rule: s3ObjectLock,
        node,
      });
    }
  }
}
