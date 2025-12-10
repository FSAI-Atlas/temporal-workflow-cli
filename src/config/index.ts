import { config } from "dotenv";
import { CLIConfig } from "../types";

config();

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function getConfig(): CLIConfig {
  return {
    minio: {
      endPoint: process.env.MINIO_ENDPOINT || "localhost",
      port: parseInt(process.env.MINIO_PORT || "9000", 10),
      useSSL: process.env.MINIO_USE_SSL === "true",
      accessKey: requireEnv("MINIO_ACCESS_KEY"),
      secretKey: requireEnv("MINIO_SECRET_KEY"),
      bucket: process.env.MINIO_BUCKET || "temporal-workflows",
    },
  };
}

