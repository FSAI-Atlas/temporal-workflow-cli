import chalk from "chalk";
import ora from "ora";
import { listVersions, getLatestVersion, setLatestVersion, getMetadata } from "../services/minio";

export async function rollback(workflowName: string, targetVersion?: string): Promise<void> {
  const spinner = ora();

  try {
    // Get available versions
    spinner.start("Fetching versions...");
    const versions = await listVersions(workflowName);
    const currentLatest = await getLatestVersion(workflowName);
    spinner.stop();

    if (versions.length === 0) {
      console.log(chalk.yellow(`No versions found for workflow: ${workflowName}`));
      return;
    }

    if (versions.length === 1) {
      console.log(chalk.yellow("Only one version exists, cannot rollback."));
      return;
    }

    // Determine target version
    let newVersion: string;

    if (targetVersion) {
      if (!versions.includes(targetVersion)) {
        console.log(chalk.red(`Version ${targetVersion} not found.`));
        console.log(`Available versions: ${versions.join(", ")}`);
        return;
      }
      newVersion = targetVersion;
    } else {
      // Find the previous version
      const currentIndex = versions.indexOf(currentLatest || "");
      if (currentIndex === -1 || currentIndex === versions.length - 1) {
        newVersion = versions[1]; // Second newest
      } else {
        newVersion = versions[currentIndex + 1];
      }
    }

    if (newVersion === currentLatest) {
      console.log(chalk.yellow(`Version ${newVersion} is already the latest.`));
      return;
    }

    // Perform rollback
    spinner.start(`Rolling back to version ${newVersion}...`);
    await setLatestVersion(workflowName, newVersion);
    spinner.succeed("Rollback complete");

    // Get metadata for the new version
    const metadata = await getMetadata(workflowName, newVersion);

    console.log("");
    console.log(chalk.green("Rollback successful!"));
    console.log("");
    console.log(chalk.bold("Details:"));
    console.log(`  Workflow:     ${chalk.cyan(workflowName)}`);
    console.log(`  Previous:     ${chalk.gray(currentLatest)}`);
    console.log(`  Current:      ${chalk.cyan(newVersion)}`);
    if (metadata) {
      console.log(`  Deployed at:  ${new Date(metadata.deployedAt).toLocaleString()}`);
    }
    console.log("");
  } catch (error) {
    spinner.fail("Rollback failed");
    console.error(chalk.red(`\nError: ${error instanceof Error ? error.message : error}`));
    process.exit(1);
  }
}

