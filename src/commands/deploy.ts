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
import { DeployOptions } from "../types";

export async function deploy(workflowPath: string, options: DeployOptions): Promise<void> {
  const spinner = ora();
  const absolutePath = path.resolve(workflowPath);

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
    console.log("");
  } catch (error) {
    spinner.fail("Deployment failed");
    console.error(chalk.red(`\nError: ${error instanceof Error ? error.message : error}`));
    process.exit(1);
  }
}

