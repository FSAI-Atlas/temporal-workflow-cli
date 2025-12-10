import * as Minio from "minio";
import { getConfig } from "../config";
import { WorkflowMetadata } from "../types";
import { requireAuth, getCurrentUser } from "./auth";

let minioClient: Minio.Client | null = null;

function getClient(): Minio.Client {
  if (!minioClient) {
    const config = getConfig();
    minioClient = new Minio.Client({
      endPoint: config.minio.endPoint,
      port: config.minio.port,
      useSSL: config.minio.useSSL,
      accessKey: config.minio.accessKey,
      secretKey: config.minio.secretKey,
    });
  }
  return minioClient;
}

// Ensure authenticated before making requests
async function ensureAuth(): Promise<void> {
  await requireAuth();
}

// Ensure the bucket exists
export async function ensureBucket(): Promise<void> {
  await ensureAuth();
  const client = getClient();
  const config = getConfig();

  const exists = await client.bucketExists(config.minio.bucket);
  if (!exists) {
    await client.makeBucket(config.minio.bucket);
    console.log(`Created bucket: ${config.minio.bucket}`);
  }
}

// Get deployer identifier from authenticated user
function getDeployer(): string {
  const user = getCurrentUser();
  return user?.email || process.env.USER || process.env.USERNAME || "unknown";
}

// Upload a workflow bundle to MinIO
export async function uploadWorkflow(
  workflowName: string,
  version: string,
  bundlePath: string,
  metadata: WorkflowMetadata
): Promise<string> {
  await ensureAuth();
  const client = getClient();
  const config = getConfig();

  await ensureBucket();

  // Add deployer info to metadata
  const enrichedMetadata = {
    ...metadata,
    deployedBy: getDeployer(),
  };

  // Upload the bundle
  const bundleKey = `${workflowName}/${version}/bundle.zip`;
  await client.fPutObject(config.minio.bucket, bundleKey, bundlePath, {
    "Content-Type": "application/zip",
  });

  // Upload the metadata
  const metadataKey = `${workflowName}/${version}/metadata.json`;
  const metadataBuffer = Buffer.from(JSON.stringify(enrichedMetadata, null, 2));
  await client.putObject(config.minio.bucket, metadataKey, metadataBuffer, metadataBuffer.length, {
    "Content-Type": "application/json",
  });

  // Update the latest pointer
  const latestKey = `${workflowName}/latest`;
  const latestBuffer = Buffer.from(version);
  await client.putObject(config.minio.bucket, latestKey, latestBuffer, latestBuffer.length, {
    "Content-Type": "text/plain",
  });

  return bundleKey;
}

// List all workflows in the bucket
export async function listWorkflows(): Promise<string[]> {
  await ensureAuth();
  const client = getClient();
  const config = getConfig();

  await ensureBucket();

  const workflows = new Set<string>();
  const stream = client.listObjects(config.minio.bucket, "", false);

  return new Promise((resolve, reject) => {
    stream.on("data", (obj) => {
      if (obj.prefix) {
        const name = obj.prefix.replace(/\/$/, "");
        workflows.add(name);
      }
    });
    stream.on("error", reject);
    stream.on("end", () => resolve(Array.from(workflows)));
  });
}

// List versions of a specific workflow
export async function listVersions(workflowName: string): Promise<string[]> {
  await ensureAuth();
  const client = getClient();
  const config = getConfig();

  const versions: string[] = [];
  const prefix = `${workflowName}/`;
  const stream = client.listObjects(config.minio.bucket, prefix, false);

  return new Promise((resolve, reject) => {
    stream.on("data", (obj) => {
      if (obj.prefix) {
        const version = obj.prefix.replace(prefix, "").replace(/\/$/, "");
        if (version !== "latest" && version) {
          versions.push(version);
        }
      }
    });
    stream.on("error", reject);
    stream.on("end", () => resolve(versions.sort().reverse()));
  });
}

// Get the latest version of a workflow
export async function getLatestVersion(workflowName: string): Promise<string | null> {
  await ensureAuth();
  const client = getClient();
  const config = getConfig();

  try {
    const latestKey = `${workflowName}/latest`;
    const stream = await client.getObject(config.minio.bucket, latestKey);

    return new Promise((resolve, reject) => {
      let data = "";
      stream.on("data", (chunk) => (data += chunk));
      stream.on("end", () => resolve(data.trim()));
      stream.on("error", reject);
    });
  } catch {
    return null;
  }
}

// Get workflow metadata
export async function getMetadata(workflowName: string, version: string): Promise<WorkflowMetadata | null> {
  await ensureAuth();
  const client = getClient();
  const config = getConfig();

  try {
    const metadataKey = `${workflowName}/${version}/metadata.json`;
    const stream = await client.getObject(config.minio.bucket, metadataKey);

    return new Promise((resolve, reject) => {
      let data = "";
      stream.on("data", (chunk) => (data += chunk));
      stream.on("end", () => resolve(JSON.parse(data)));
      stream.on("error", reject);
    });
  } catch {
    return null;
  }
}

// Delete a specific version
export async function deleteVersion(workflowName: string, version: string): Promise<void> {
  await ensureAuth();
  const client = getClient();
  const config = getConfig();

  const prefix = `${workflowName}/${version}/`;
  const objects: string[] = [];

  const stream = client.listObjects(config.minio.bucket, prefix, true);

  await new Promise<void>((resolve, reject) => {
    stream.on("data", (obj) => {
      if (obj.name) {
        objects.push(obj.name);
      }
    });
    stream.on("error", reject);
    stream.on("end", resolve);
  });

  for (const obj of objects) {
    await client.removeObject(config.minio.bucket, obj);
  }
}

// Set a specific version as latest
export async function setLatestVersion(workflowName: string, version: string): Promise<void> {
  await ensureAuth();
  const client = getClient();
  const config = getConfig();

  const latestKey = `${workflowName}/latest`;
  const latestBuffer = Buffer.from(version);
  await client.putObject(config.minio.bucket, latestKey, latestBuffer, latestBuffer.length, {
    "Content-Type": "text/plain",
  });
}
