import chalk from "chalk";
import * as fs from "fs";
import * as path from "path";
import { Client, Connection } from "@temporalio/client";

interface RunOptions {
  input?: string;
  inputFile?: string;
  workflowId?: string;
  wait?: boolean;
}

interface TemporalConfig {
  address: string;
  namespace: string;
}

function getTemporalConfig(): TemporalConfig {
  // Check environment variables first
  const address = process.env.TEMPORAL_ADDRESS || "localhost:7233";
  const namespace = process.env.TEMPORAL_NAMESPACE || "default";

  // Then check config file
  const configDir = path.join(require("os").homedir(), ".workflow-cli");
  const configFile = path.join(configDir, "config.json");

  try {
    if (fs.existsSync(configFile)) {
      const config = JSON.parse(fs.readFileSync(configFile, "utf-8"));
      return {
        address: config.temporal?.address || address,
        namespace: config.temporal?.namespace || namespace,
      };
    }
  } catch {
    // ignore
  }

  return { address, namespace };
}

function generateWorkflowId(workflowName: string): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return `${workflowName}-${timestamp}-${random}`;
}

interface WorkflowConfig {
  name: string;
  namespace?: string;
  taskQueue: string;
  trigger?: {
    type: string;
    config?: Record<string, unknown>;
  };
}

async function loadWorkflowConfig(workflowDir: string): Promise<WorkflowConfig> {
  const configTsPath = path.join(workflowDir, "config.ts");
  const configJsPath = path.join(workflowDir, "config.js");

  let configPath: string;

  if (fs.existsSync(configJsPath)) {
    configPath = configJsPath;
  } else if (fs.existsSync(configTsPath)) {
    // For TypeScript, we need to transpile it first or use ts-node
    // For simplicity, we'll read and parse it manually
    const content = fs.readFileSync(configTsPath, "utf-8");

    // Extract the config object using regex
    const configMatch = content.match(/export\s+const\s+\w+Config\s*=\s*(\{[\s\S]*?\});?\s*$/m);

    if (!configMatch) {
      throw new Error("Could not parse config.ts - make sure it exports a config object");
    }

    // Parse the config - this is a simplified parser
    const configStr = configMatch[1]
      .replace(/as\s+const/g, "") // Remove 'as const'
      .replace(/\/\*[\s\S]*?\*\//g, "") // Remove block comments
      .replace(/\/\/.*/g, "") // Remove line comments
      .replace(/,(\s*[}\]])/g, "$1"); // Remove trailing commas

    try {
      // Use Function constructor to evaluate the object literal
      const evalFn = new Function(`return ${configStr}`);
      return evalFn();
    } catch (e: any) {
      throw new Error(`Failed to parse config.ts: ${e.message}`);
    }
  } else {
    throw new Error("No config.ts or config.js found in workflow directory");
  }

  // For JS files, require them directly
  const config = require(configPath);

  // Find the exported config (it should end with 'Config')
  const configKey = Object.keys(config).find((key) => key.endsWith("Config"));
  if (!configKey) {
    throw new Error("No config export found in config file");
  }

  return config[configKey];
}

export async function run(workflowPath: string, options: RunOptions): Promise<void> {
  const absolutePath = path.resolve(process.cwd(), workflowPath);

  // Validate workflow directory
  if (!fs.existsSync(absolutePath)) {
    console.error(chalk.red(`\nError: Workflow directory not found: ${absolutePath}\n`));
    process.exit(1);
  }

  const configPath = path.join(absolutePath, "config.ts");
  const configJsPath = path.join(absolutePath, "config.js");

  if (!fs.existsSync(configPath) && !fs.existsSync(configJsPath)) {
    console.error(chalk.red("\nError: config.ts or config.js not found in workflow directory\n"));
    process.exit(1);
  }

  // Load workflow config
  let workflowConfig: WorkflowConfig;
  try {
    workflowConfig = await loadWorkflowConfig(absolutePath);
  } catch (error: any) {
    console.error(chalk.red(`\nError loading config: ${error.message}\n`));
    process.exit(1);
  }

  // Parse input
  let input: any = {};

  if (options.inputFile) {
    const inputFilePath = path.resolve(process.cwd(), options.inputFile);
    if (!fs.existsSync(inputFilePath)) {
      console.error(chalk.red(`\nError: Input file not found: ${inputFilePath}\n`));
      process.exit(1);
    }
    try {
      input = JSON.parse(fs.readFileSync(inputFilePath, "utf-8"));
    } catch (error: any) {
      console.error(chalk.red(`\nError parsing input file: ${error.message}\n`));
      process.exit(1);
    }
  } else if (options.input) {
    try {
      input = JSON.parse(options.input);
    } catch (error: any) {
      console.error(chalk.red(`\nError parsing input JSON: ${error.message}\n`));
      process.exit(1);
    }
  }

  // Get Temporal connection config
  const temporalConfig = getTemporalConfig();
  const workflowId = options.workflowId || generateWorkflowId(workflowConfig.name);

  console.log(chalk.bold("\nStarting workflow execution\n"));
  console.log(chalk.gray(`  Temporal Server: ${temporalConfig.address}`));
  console.log(chalk.gray(`  Namespace:       ${workflowConfig.namespace || temporalConfig.namespace}`));
  console.log(chalk.gray(`  Workflow:        ${workflowConfig.name}`));
  console.log(chalk.gray(`  Task Queue:      ${workflowConfig.taskQueue}`));
  console.log(chalk.gray(`  Workflow ID:     ${workflowId}`));
  console.log("");

  try {
    // Connect to Temporal
    console.log(chalk.gray("Connecting to Temporal server..."));

    const connection = await Connection.connect({
      address: temporalConfig.address,
    });

    const client = new Client({
      connection,
      namespace: workflowConfig.namespace || temporalConfig.namespace,
    });

    // Start the workflow
    console.log(chalk.gray("Starting workflow..."));

    const handle = await client.workflow.start(workflowConfig.name, {
      taskQueue: workflowConfig.taskQueue,
      workflowId,
      args: [input],
    });

    console.log(chalk.green(`\n✔ Workflow started successfully!\n`));
    console.log(chalk.cyan("Details:"));
    console.log(`  Workflow ID:  ${handle.workflowId}`);
    console.log(`  Run ID:       ${handle.firstExecutionRunId}`);
    console.log("");

    // Build Temporal UI URL
    const uiUrl = temporalConfig.address.replace(":7233", ":8080");
    console.log(
      chalk.gray(
        `  View in UI:   http://${uiUrl}/namespaces/${workflowConfig.namespace || temporalConfig.namespace}/workflows/${handle.workflowId}/${handle.firstExecutionRunId}`
      )
    );
    console.log("");

    if (options.wait) {
      console.log(chalk.gray("Waiting for workflow to complete..."));

      try {
        const result = await handle.result();
        console.log(chalk.green("\n✔ Workflow completed successfully!\n"));
        console.log(chalk.cyan("Result:"));
        console.log(JSON.stringify(result, null, 2));
        console.log("");
      } catch (error: any) {
        console.error(chalk.red(`\n✖ Workflow failed: ${error.message}\n`));
        process.exit(1);
      }
    } else {
      console.log(chalk.gray("Workflow is running in the background."));
      console.log(chalk.gray(`Use --wait flag to wait for completion.\n`));
    }

    await connection.close();
  } catch (error: any) {
    if (error.code === "UNAVAILABLE" || error.message?.includes("UNAVAILABLE")) {
      console.error(chalk.red(`\n✖ Cannot connect to Temporal server at ${temporalConfig.address}`));
      console.error(chalk.gray("  Make sure the Temporal server is running and accessible.\n"));
      console.error(chalk.gray("  Configure the server address with:"));
      console.error(chalk.gray("    workflow-cli config set temporal.address localhost:7233\n"));
    } else {
      console.error(chalk.red(`\n✖ Error: ${error.message}\n`));
    }
    process.exit(1);
  }
}

export async function signal(workflowId: string, signalName: string, options: { data?: string }): Promise<void> {
  const temporalConfig = getTemporalConfig();

  let signalData: any = undefined;
  if (options.data) {
    try {
      signalData = JSON.parse(options.data);
    } catch {
      signalData = options.data;
    }
  }

  console.log(chalk.bold("\nSending signal to workflow\n"));
  console.log(chalk.gray(`  Workflow ID:  ${workflowId}`));
  console.log(chalk.gray(`  Signal:       ${signalName}`));
  console.log("");

  try {
    const connection = await Connection.connect({
      address: temporalConfig.address,
    });

    const client = new Client({
      connection,
      namespace: temporalConfig.namespace,
    });

    const handle = client.workflow.getHandle(workflowId);
    await handle.signal(signalName, signalData);

    console.log(chalk.green(`✔ Signal sent successfully!\n`));

    await connection.close();
  } catch (error: any) {
    console.error(chalk.red(`\n✖ Error: ${error.message}\n`));
    process.exit(1);
  }
}

export async function query(workflowId: string, queryName: string): Promise<void> {
  const temporalConfig = getTemporalConfig();

  console.log(chalk.bold("\nQuerying workflow\n"));
  console.log(chalk.gray(`  Workflow ID:  ${workflowId}`));
  console.log(chalk.gray(`  Query:        ${queryName}`));
  console.log("");

  try {
    const connection = await Connection.connect({
      address: temporalConfig.address,
    });

    const client = new Client({
      connection,
      namespace: temporalConfig.namespace,
    });

    const handle = client.workflow.getHandle(workflowId);
    const result = await handle.query(queryName);

    console.log(chalk.green(`✔ Query executed successfully!\n`));
    console.log(chalk.cyan("Result:"));
    console.log(JSON.stringify(result, null, 2));
    console.log("");

    await connection.close();
  } catch (error: any) {
    console.error(chalk.red(`\n✖ Error: ${error.message}\n`));
    process.exit(1);
  }
}

export async function cancel(workflowId: string): Promise<void> {
  const temporalConfig = getTemporalConfig();

  console.log(chalk.bold("\nCancelling workflow\n"));
  console.log(chalk.gray(`  Workflow ID:  ${workflowId}`));
  console.log("");

  try {
    const connection = await Connection.connect({
      address: temporalConfig.address,
    });

    const client = new Client({
      connection,
      namespace: temporalConfig.namespace,
    });

    const handle = client.workflow.getHandle(workflowId);
    await handle.cancel();

    console.log(chalk.green(`✔ Workflow cancellation requested!\n`));

    await connection.close();
  } catch (error: any) {
    console.error(chalk.red(`\n✖ Error: ${error.message}\n`));
    process.exit(1);
  }
}

export async function terminate(workflowId: string, options: { reason?: string }): Promise<void> {
  const temporalConfig = getTemporalConfig();

  console.log(chalk.bold("\nTerminating workflow\n"));
  console.log(chalk.gray(`  Workflow ID:  ${workflowId}`));
  if (options.reason) {
    console.log(chalk.gray(`  Reason:       ${options.reason}`));
  }
  console.log("");

  try {
    const connection = await Connection.connect({
      address: temporalConfig.address,
    });

    const client = new Client({
      connection,
      namespace: temporalConfig.namespace,
    });

    const handle = client.workflow.getHandle(workflowId);
    await handle.terminate(options.reason);

    console.log(chalk.green(`✔ Workflow terminated!\n`));

    await connection.close();
  } catch (error: any) {
    console.error(chalk.red(`\n✖ Error: ${error.message}\n`));
    process.exit(1);
  }
}

export async function status(workflowId: string): Promise<void> {
  const temporalConfig = getTemporalConfig();

  console.log(chalk.bold("\nWorkflow Status\n"));

  try {
    const connection = await Connection.connect({
      address: temporalConfig.address,
    });

    const client = new Client({
      connection,
      namespace: temporalConfig.namespace,
    });

    const handle = client.workflow.getHandle(workflowId);
    const description = await handle.describe();

    const statusColors: Record<string, (s: string) => string> = {
      RUNNING: chalk.blue,
      COMPLETED: chalk.green,
      FAILED: chalk.red,
      CANCELED: chalk.yellow,
      TERMINATED: chalk.red,
      TIMED_OUT: chalk.red,
    };

    const statusStr = description.status.name;
    const colorFn = statusColors[statusStr] || chalk.white;

    console.log(chalk.cyan("Details:"));
    console.log(`  Workflow ID:   ${description.workflowId}`);
    console.log(`  Run ID:        ${description.runId}`);
    console.log(`  Type:          ${description.type}`);
    console.log(`  Status:        ${colorFn(statusStr)}`);
    console.log(`  Task Queue:    ${description.taskQueue}`);
    console.log(`  Start Time:    ${description.startTime}`);
    if (description.closeTime) {
      console.log(`  Close Time:    ${description.closeTime}`);
    }
    console.log("");

    await connection.close();
  } catch (error: any) {
    console.error(chalk.red(`\n✖ Error: ${error.message}\n`));
    process.exit(1);
  }
}

