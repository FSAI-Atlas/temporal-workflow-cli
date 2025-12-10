import chalk from "chalk";
import ora from "ora";
import { listWorkflows, listVersions, getLatestVersion, getMetadata } from "../services/minio";
import { ListOptions } from "../types";

export async function list(options: ListOptions): Promise<void> {
  const spinner = ora();

  try {
    spinner.start("Fetching workflows...");
    const workflows = await listWorkflows();
    spinner.stop();

    if (workflows.length === 0) {
      console.log(chalk.yellow("No workflows found."));
      return;
    }

    console.log(chalk.bold(`\nFound ${workflows.length} workflow(s):\n`));

    for (const workflowName of workflows) {
      const latestVersion = await getLatestVersion(workflowName);
      const metadata = latestVersion ? await getMetadata(workflowName, latestVersion) : null;

      // Filter by namespace if specified
      if (options.namespace && metadata?.namespace !== options.namespace) {
        continue;
      }

      console.log(chalk.cyan.bold(`  ${workflowName}`));

      if (metadata) {
        console.log(`    Latest:    ${chalk.green(latestVersion)}`);
        console.log(`    Namespace: ${metadata.namespace}`);
        console.log(`    TaskQueue: ${metadata.taskQueue}`);
        console.log(`    Trigger:   ${metadata.trigger.type}`);
        console.log(`    Deployed:  ${new Date(metadata.deployedAt).toLocaleString()}`);
      }

      if (options.showVersions) {
        const versions = await listVersions(workflowName);
        if (versions.length > 0) {
          console.log(`    Versions:  ${versions.join(", ")}`);
        }
      }

      console.log("");
    }
  } catch (error) {
    spinner.fail("Failed to list workflows");
    console.error(chalk.red(`\nError: ${error instanceof Error ? error.message : error}`));
    process.exit(1);
  }
}

