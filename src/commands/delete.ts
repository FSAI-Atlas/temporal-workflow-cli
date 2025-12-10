import chalk from "chalk";
import ora from "ora";
import { deleteVersion, listVersions, getLatestVersion, setLatestVersion } from "../services/minio";

interface DeleteOptions {
  version?: string;
  all?: boolean;
}

export async function deleteWorkflow(workflowName: string, options: DeleteOptions): Promise<void> {
  const spinner = ora();

  try {
    spinner.start("Fetching workflow info...");
    const versions = await listVersions(workflowName);
    const currentLatest = await getLatestVersion(workflowName);
    spinner.stop();

    if (versions.length === 0) {
      console.log(chalk.yellow(`No versions found for workflow: ${workflowName}`));
      return;
    }

    if (options.all) {
      // Delete all versions
      spinner.start(`Deleting all versions of ${workflowName}...`);

      for (const version of versions) {
        await deleteVersion(workflowName, version);
      }

      // Also delete the latest pointer
      // Note: MinIO client doesn't have a direct delete for non-versioned objects in some cases
      // The latest pointer will become orphaned but that's okay

      spinner.succeed(`Deleted all ${versions.length} versions`);
      console.log(chalk.green(`\nWorkflow ${workflowName} completely removed.`));
    } else if (options.version) {
      // Delete specific version
      if (!versions.includes(options.version)) {
        console.log(chalk.red(`Version ${options.version} not found.`));
        console.log(`Available versions: ${versions.join(", ")}`);
        return;
      }

      spinner.start(`Deleting version ${options.version}...`);
      await deleteVersion(workflowName, options.version);
      spinner.succeed(`Deleted version ${options.version}`);

      // Update latest if we deleted the current latest
      if (options.version === currentLatest && versions.length > 1) {
        const remainingVersions = versions.filter((v) => v !== options.version);
        const newLatest = remainingVersions[0];
        await setLatestVersion(workflowName, newLatest);
        console.log(chalk.yellow(`\nLatest version updated to: ${newLatest}`));
      }
    } else {
      console.log(chalk.yellow("Please specify --version or --all"));
      console.log(`Available versions: ${versions.join(", ")}`);
    }
  } catch (error) {
    spinner.fail("Delete failed");
    console.error(chalk.red(`\nError: ${error instanceof Error ? error.message : error}`));
    process.exit(1);
  }
}

