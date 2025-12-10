import chalk from "chalk";
import ora from "ora";
import { getLatestVersion, getMetadata, listVersions } from "../services/minio";

export async function info(workflowName: string, version?: string): Promise<void> {
  const spinner = ora();

  try {
    spinner.start("Fetching workflow info...");

    const targetVersion = version || (await getLatestVersion(workflowName));

    if (!targetVersion) {
      spinner.fail(`Workflow not found: ${workflowName}`);
      return;
    }

    const metadata = await getMetadata(workflowName, targetVersion);
    const versions = await listVersions(workflowName);
    const latestVersion = await getLatestVersion(workflowName);

    spinner.stop();

    if (!metadata) {
      console.log(chalk.yellow(`No metadata found for ${workflowName}@${targetVersion}`));
      return;
    }

    console.log("");
    console.log(chalk.bold.cyan(`Workflow: ${metadata.name}`));
    console.log("");
    console.log(chalk.bold("Configuration:"));
    console.log(`  Namespace:   ${metadata.namespace}`);
    console.log(`  TaskQueue:   ${metadata.taskQueue}`);
    console.log(`  Trigger:     ${metadata.trigger.type}`);

    if (metadata.trigger.config) {
      console.log(`  Config:      ${JSON.stringify(metadata.trigger.config)}`);
    }

    console.log("");
    console.log(chalk.bold("Version Info:"));
    console.log(`  Current:     ${chalk.cyan(targetVersion)}${targetVersion === latestVersion ? chalk.green(" (latest)") : ""}`);
    console.log(`  Deployed:    ${new Date(metadata.deployedAt).toLocaleString()}`);
    console.log(`  Deployed by: ${metadata.deployedBy || "unknown"}`);
    console.log(`  Checksum:    ${metadata.checksum}`);

    console.log("");
    console.log(chalk.bold("All Versions:"));
    for (const v of versions) {
      const marker = v === latestVersion ? chalk.green(" (latest)") : "";
      const current = v === targetVersion ? chalk.cyan(" <--") : "";
      console.log(`  - ${v}${marker}${current}`);
    }

    console.log("");
  } catch (error) {
    spinner.fail("Failed to get info");
    console.error(chalk.red(`\nError: ${error instanceof Error ? error.message : error}`));
    process.exit(1);
  }
}

