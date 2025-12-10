import { config } from "dotenv";
import { CLIConfig } from "../types";
import { getMinioConfig, getApiUrl } from "../commands/config";

// Load .env file if it exists (for local development)
config();

export function getConfig(): CLIConfig {
  const minioConfig = getMinioConfig();

  if (!minioConfig) {
    console.error("\nError: MinIO not configured.");
    console.error("Run 'workflow-cli config setup' to configure MinIO settings.");
    console.error("Or set environment variables: MINIO_ACCESS_KEY, MINIO_SECRET_KEY\n");
    process.exit(1);
  }

  return {
    minio: {
      endPoint: minioConfig.endpoint,
      port: minioConfig.port,
      useSSL: minioConfig.useSSL,
      accessKey: minioConfig.accessKey,
      secretKey: minioConfig.secretKey,
      bucket: minioConfig.bucket,
    },
  };
}

export { getApiUrl };
