import * as pulumi from "@pulumi/pulumi";
import { describe, it, expect } from "vitest";

// setMocks: エンジン/クラウドを in-process のモックに差し替える。
// AWS 資格情報不要・高速・決定的で、宣言された入力値を synth せずに検証できる (S 層)。
pulumi.runtime.setMocks({
  newResource: (args: pulumi.runtime.MockResourceArgs): { id: string; state: any } => {
    return { id: `${args.name}-id`, state: args.inputs };
  },
  call: (args: pulumi.runtime.MockCallArgs) => args.inputs,
});

// Output<T> を Promise<T> に変換するヘルパ
function promiseOf<T>(output: pulumi.Output<T>): Promise<T> {
  return new Promise((resolve) => output.apply(resolve));
}

describe("secure S3 bucket NFR (静的・deploy 不要)", () => {
  it("NFR: Public アクセスを完全ブロック", async () => {
    const { createSecureBucket } = await import("../secure-bucket");
    const { pab } = createSecureBucket("secure-data-test");
    expect(await promiseOf(pab.blockPublicPolicy)).toBe(true);
    expect(await promiseOf(pab.restrictPublicBuckets)).toBe(true);
    expect(await promiseOf(pab.blockPublicAcls)).toBe(true);
    expect(await promiseOf(pab.ignorePublicAcls)).toBe(true);
  });

  it("NFR: SSE-KMS (CMK) 暗号化", async () => {
    const { createSecureBucket } = await import("../secure-bucket");
    const { sse } = createSecureBucket("secure-data-test2");
    const rules = await promiseOf(sse.rules);
    expect(rules[0].applyServerSideEncryptionByDefault?.sseAlgorithm).toBe("aws:kms");
  });

  it("NFR: Versioning 有効", async () => {
    const { createSecureBucket } = await import("../secure-bucket");
    const { versioning } = createSecureBucket("secure-data-test3");
    const cfg = await promiseOf(versioning.versioningConfiguration);
    expect(cfg.status).toBe("Enabled");
  });

  it("NFR: CORS にワイルドカード Origin を使わない", async () => {
    const { createSecureBucket } = await import("../secure-bucket");
    const { cors } = createSecureBucket("secure-data-test4");
    const rules = await promiseOf(cors.corsRules);
    expect(rules[0].allowedOrigins).not.toContain("*");
  });
});
