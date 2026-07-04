import { createSecureBucket } from "./secure-bucket";

const { bucket } = createSecureBucket("secure-data-demo-pulumi");

export const bucketName = bucket.bucket;
