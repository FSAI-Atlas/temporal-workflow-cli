import * as path from "path";
import * as os from "os";
import chalk from "chalk";
import ora from "ora";
import {
  loadWorkflowConfig,
  validateWorkflowDir,
  createBundle,
  calculateChecksum,
  generateVersion,
  createMetadata,
  cleanup,
} from "../services/packager";
import { uploadWorkflow, getLatestVersion } from "../services/minio";
import { getToken, isMasterAdmin, getCurrentTenant } from "../services/auth";
import { DeployOptions } from "../types";
import { createLogger } from "../lib/logger";
import { getApiUrl } from "../config";

const logger = createLogger("deploy");

// Register the deployment with the API
async function registerDeployment(
  token: string,
  data: {
    name: string;
    namespace: string;
    taskQueue: string;
    version: string;
    trigger: { type: string; config?: Record<string, unknown> };
    checksum: string;
    minioPath: string;
  },
  tenantOverride?: string
): Promise<{ success: boolean; message: string }> {
  try {
    // Build URL with tenant query param for master admin
    let url = `${getApiUrl()}/workflows/register`;
    if (tenantOverride) {
      url += `?tenant=${encodeURIComponent(tenantOverride)}`;
    }

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(data),
    });

    const result = (await response.json()) as { success: boolean; message: string };
    return result;
  } catch (error) {
    logger.error(error, "Failed to register deployment with API");
    return { success: false, message: error instanceof Error ? error.message : "API error" };
  }
}

export async function deploy(workflowPath: string, options: DeployOptions): Promise<void> {
  const spinner = ora();
  const absolutePath = path.resolve(workflowPath);

  // Validate tenant for master admin
  const isMaster = isMasterAdmin();
  const tenantOverride = options.tenant;

  if (isMaster && !tenantOverride) {
    console.error(chalk.red("\nError: Master admin must specify --tenant flag"));
    console.error(chalk.gray("Usage: workflow-cli deploy <path> --tenant <tenant_id>\n"));
    process.exit(1);
  }

  if (!isMaster && tenantOverride) {
    console.error(chalk.red("\nError: Only master admin can use --tenant flag"));
    process.exit(1);
  }

  try {
    // Validate workflow directory
    spinner.start("Validating workflow directory...");
    validateWorkflowDir(absolutePath);
    spinner.succeed("Workflow directory validated");

    // Load and validate config
    spinner.start("Loading workflow configuration...");
    const config = await loadWorkflowConfig(absolutePath);
    spinner.succeed(`Loaded config for workflow: ${chalk.cyan(config.name)}`);

    // Check if version already exists
    const version = options.version || generateVersion();
    const latestVersion = await getLatestVersion(config.name);

    if (latestVersion === version && !options.force) {
      console.log(chalk.yellow(`\nVersion ${version} already exists. Use --force to overwrite.`));
      return;
    }

    // Create bundle
    spinner.start("Creating workflow bundle...");
    const tempBundlePath = path.join(os.tmpdir(), `${config.name}-${version}.zip`);
    await createBundle(absolutePath, tempBundlePath);
    spinner.succeed("Bundle created");

    // Calculate checksum
    const checksum = calculateChecksum(tempBundlePath);

    // Create metadata
    const metadata = createMetadata(config, version, checksum);

    // Upload to MinIO
    spinner.start("Uploading to MinIO...");
    const bundleKey = await uploadWorkflow(config.name, version, tempBundlePath, metadata);
    spinner.succeed("Uploaded to MinIO");

    // Register deployment with API
    spinner.start("Registering deployment...");
    const token = getToken();
    
    if (token) {
      const minioPath = `${config.name}/${version}/bundle.zip`;
      const registerResult = await registerDeployment(
        token,
        {
          name: config.name,
          namespace: config.namespace,
          taskQueue: config.taskQueue,
          version,
          trigger: config.trigger,
          checksum,
          minioPath,
        },
        tenantOverride
      );

      if (registerResult.success) {
        spinner.succeed("Deployment registered in database");
      } else {
        spinner.warn(`Deployment uploaded but not registered: ${registerResult.message}`);
      }
    } else {
      spinner.warn("Deployment uploaded but not registered (no auth token)");
    }

    // Cleanup
    cleanup(tempBundlePath);

    // Success message
    console.log("");
    console.log(chalk.green("Workflow deployed successfully!"));
    console.log("");
    console.log(chalk.bold("Details:"));
    console.log(`  Name:      ${chalk.cyan(config.name)}`);
    console.log(`  Version:   ${chalk.cyan(version)}`);
    console.log(`  Namespace: ${chalk.cyan(config.namespace)}`);
    console.log(`  TaskQueue: ${chalk.cyan(config.taskQueue)}`);
    console.log(`  Trigger:   ${chalk.cyan(config.trigger.type)}`);
    console.log(`  Checksum:  ${chalk.gray(checksum.substring(0, 16))}...`);
    console.log(`  Location:  ${chalk.gray(bundleKey)}`);

    // Show tenant info
    if (tenantOverride) {
      console.log(`  Tenant:    ${chalk.cyan(tenantOverride)}`);
    } else {
      const tenant = getCurrentTenant();
      if (tenant) {
        console.log(`  Tenant:    ${chalk.cyan(tenant.tenantId)}`);
      }
    }

    console.log("");
  } catch (error) {
    spinner.fail("Deployment failed");
    console.error(chalk.red(`\nError: ${error instanceof Error ? error.message : error}`));
    process.exit(1);
  }
}
