import { z } from "zod";

// Workflow configuration schema that must exist in each workflow folder
export const WorkflowConfigSchema = z.object({
  name: z.string().min(1),
  namespace: z.string().default("default"),
  taskQueue: z.string().min(1),
  trigger: z.object({
    type: z.enum(["schedule", "polling", "webhook", "manual"]),
    config: z.record(z.unknown()).optional(),
  }),
});

export type WorkflowConfig = z.infer<typeof WorkflowConfigSchema>;

// Metadata stored alongside the workflow in MinIO
export const WorkflowMetadataSchema = z.object({
  name: z.string(),
  version: z.string(),
  namespace: z.string(),
  taskQueue: z.string(),
  trigger: z.object({
    type: z.enum(["schedule", "polling", "webhook", "manual"]),
    config: z.record(z.unknown()).optional(),
  }),
  deployedAt: z.string(),
  deployedBy: z.string().optional(),
  checksum: z.string(),
});

export type WorkflowMetadata = z.infer<typeof WorkflowMetadataSchema>;

// CLI configuration
export interface CLIConfig {
  minio: {
    endPoint: string;
    port: number;
    useSSL: boolean;
    accessKey: string;
    secretKey: string;
    bucket: string;
  };
}

// Deploy options
export interface DeployOptions {
  version?: string;
  force?: boolean;
}

// List options
export interface ListOptions {
  namespace?: string;
  showVersions?: boolean;
}

