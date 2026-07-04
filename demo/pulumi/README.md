# demo/pulumi — Pulumi（実言語）で S3 非機能を書き、deploy 前に検証する

汎用言語（TypeScript）で S3 の非機能を宣言し、**AWS にデプロイせずに** 2 系統で検証する:

- **`setMocks` ユニットテスト**（[test/secure-bucket.test.ts](./test/secure-bucket.test.ts)）: エンジンを in-process のモックに差し替え、宣言された入力値を **cloud 資格情報なし・高速・決定的**に検査（S 層）。
- **CrossGuard PolicyPack**（[policy/](./policy/)）: `pulumi preview` / `up` 時に **mandatory** で非機能を強制（違反で up をブロック）。

## 前提

- Node.js 20+ / npm
- CrossGuard 実行には Pulumi CLI（ユニットテストだけなら不要）

## 実行

```bash
cd demo/pulumi && npm install
npm test          # green: setMocks unit test で public block / 暗号化 / versioning / CORS をアサート

# CrossGuard (Pulumi CLI + AWS 資格情報が必要):
cd policy && npm install && cd ..
pulumi preview --policy-pack ./policy
```

## green → red（デモの肝）

[secure-bucket.ts](./secure-bucket.ts) の非機能を 1 つ壊すと red になる:

| 壊し方 | 失敗するもの |
|--------|--------------|
| `pab` の `blockPublicPolicy` を `false` に | unit test「Public アクセスを完全ブロック」＋ CrossGuard `s3-public-access-blocked` |
| `sse` の `sseAlgorithm` を `"AES256"` に | unit test「SSE-KMS 暗号化」＋ CrossGuard `s3-sse-kms` |
| `versioning` の `status` を `"Suspended"` に | unit test「Versioning 有効」 |
| CORS の `allowedOrigins` に `"*"` を追加 | unit test「ワイルドカード Origin を使わない」＋ CrossGuard `s3-cors-no-wildcard-origin` |

## メモ

- **CORS には pre-built CrossGuard ポリシーが無い**ため、custom policy（`s3-cors-no-wildcard-origin`）で検査している（[04-nfr-testing-s3.md](../../docs/04-nfr-testing-s3.md)）。CIS/PCI などの pre-built パックは public/暗号化/versioning をカバーする。
- `setMocks` は宣言入力の検証（S 層）。実 deploy 後の検証は Automation API を使った integration test（D 層）で別途。
- コードは 2026 年時点の API に基づく illustrative 実装。`@pulumi/aws` の version により `BucketV2` 系リソース名の細部が変わり得るので、`npm install` 後に型で確認すること。
