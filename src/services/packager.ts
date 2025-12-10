import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import archiver from "archiver";
import { WorkflowConfig, WorkflowConfigSchema, WorkflowMetadata } from "../types";

// Validate and load workflow config from a directory
export async function loadWorkflowConfig(workflowDir: string): Promise<WorkflowConfig> {
  const configPath = path.join(workflowDir, "config.ts");
  const configPathJs = path.join(workflowDir, "config.js");

  let configFile: string;
  if (fs.existsSync(configPath)) {
    configFile = configPath;
  } else if (fs.existsSync(configPathJs)) {
    configFile = configPathJs;
  } else {
    throw new Error(`No config.ts or config.js found in ${workflowDir}`);
  }

  // Use require to load the config (works with ts-node)
  const configModule = require(configFile);

  // Find the config export
  let config: WorkflowConfig | undefined;

  if (configModule.default) {
    config = configModule.default;
  } else {
    const configKey = Object.keys(configModule).find(
      (key) => key.endsWith("Config") || key === "config"
    );
    if (configKey) {
      config = configModule[configKey];
    }
  }

  if (!config) {
    throw new Error(`No valid config export found in ${configFile}`);
  }

  return WorkflowConfigSchema.parse(config);
}

// Validate workflow directory structure
export function validateWorkflowDir(workflowDir: string): void {
  if (!fs.existsSync(workflowDir)) {
    throw new Error(`Workflow directory not found: ${workflowDir}`);
  }

  const stats = fs.statSync(workflowDir);
  if (!stats.isDirectory()) {
    throw new Error(`Not a directory: ${workflowDir}`);
  }

  // Check for workflow.ts file
  const workflowFile = path.join(workflowDir, "workflow.ts");
  const workflowFileJs = path.join(workflowDir, "workflow.js");

  if (!fs.existsSync(workflowFile) && !fs.existsSync(workflowFileJs)) {
    throw new Error(`No workflow.ts or workflow.js found in ${workflowDir}`);
  }
}

// Create a zip bundle of the workflow
export async function createBundle(workflowDir: string, outputPath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(outputPath);
    const archive = archiver("zip", { zlib: { level: 9 } });

    output.on("close", () => resolve(outputPath));
    archive.on("error", reject);

    archive.pipe(output);

    // Add all files from the workflow directory
    archive.directory(workflowDir, false);

    archive.finalize();
  });
}

// Calculate checksum of a file
export function calculateChecksum(filePath: string): string {
  const content = fs.readFileSync(filePath);
  return crypto.createHash("sha256").update(content).digest("hex");
}

// Generate version string if not provided
export function generateVersion(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  const seconds = String(now.getSeconds()).padStart(2, "0");

  return `${year}${month}${day}-${hours}${minutes}${seconds}`;
}

// Create workflow metadata
export function createMetadata(
  config: WorkflowConfig,
  version: string,
  checksum: string
): WorkflowMetadata {
  return {
    name: config.name,
    version,
    namespace: config.namespace,
    taskQueue: config.taskQueue,
    trigger: config.trigger,
    deployedAt: new Date().toISOString(),
    deployedBy: process.env.USER || "unknown",
    checksum,
  };
}

// Clean up temporary files
export function cleanup(filePath: string): void {
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}

