import { App, Aspects } from 'aws-cdk-lib';
import { SecureBucketStack } from '../lib/secure-bucket-stack';
import { BaselineS3Checks } from '../lib/nag/baseline-s3-rules';

const app = new App();

new SecureBucketStack(app, 'SecureBucketStack');

// 自作 NagPack を synth 時ゲートとして登録。
// NFR 違反 (CMK 未使用 / Object Lock 未設定) があると ERROR となり synth が失敗する = fail-closed。
Aspects.of(app).add(new BaselineS3Checks({ verbose: true }));

app.synth();
