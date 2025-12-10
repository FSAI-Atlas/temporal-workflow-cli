import { z } from "zod";

// Webhook authentication configuration
export const WebhookAuthConfigSchema = z.object({
  type: z.enum(["bearer", "api-key", "basic"]),
  // For bearer: the token value
  // For api-key: the key value
  // For basic: base64 encoded "username:password"
  token: z.string().min(1),
  // For api-key: the header name (default: X-API-Key)
  headerName: z.string().optional(),
});

export type WebhookAuthConfig = z.infer<typeof WebhookAuthConfigSchema>;

// Webhook trigger configuration with optional auth
export const WebhookTriggerConfigSchema = z.object({
  path: z.string().min(1),
  method: z.enum(["GET", "POST", "PUT", "DELETE"]).default("POST"),
  auth: WebhookAuthConfigSchema.optional(),
});

export type WebhookTriggerConfig = z.infer<typeof WebhookTriggerConfigSchema>;

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
