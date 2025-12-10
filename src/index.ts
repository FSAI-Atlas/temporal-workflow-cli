#!/usr/bin/env node

import { Command } from "commander";
import { deploy, list, rollback, deleteWorkflow, info, login, logout, whoami, init, run, signal, query, cancel, terminate, status } from "./commands";
import { configSetup, configShow, configSet } from "./commands/config";
import { readFileSync } from "fs";
import { join } from "path";

// Read version from package.json
const packageJson = JSON.parse(readFileSync(join(__dirname, "..", "package.json"), "utf-8"));

const program = new Command();

program
  .name("workflow-cli")
  .description("CLI for deploying Temporal workflows to MinIO storage")
  .version(packageJson.version);

// Config command group
const configCmd = program
  .command("config")
  .description("Manage CLI configuration");

configCmd
  .command("setup")
  .description("Interactive configuration setup")
  .action(async () => {
    await configSetup();
  });

configCmd
  .command("show")
  .description("Show current configuration")
  .action(async () => {
    await configShow();
  });

configCmd
  .command("set <key> <value>")
  .description("Set a configuration value (e.g., minio.endpoint, minio.accessKey, apiUrl)")
  .action(async (key, value) => {
    await configSet(key, value);
  });

// Init command
program
  .command("init")
  .description("Initialize a new workflow project")
  .requiredOption("-t, --type <type>", "Trigger type: webhook, schedule, polling, or manual")
  .requiredOption("-n, --name <name>", "Workflow name")
  .option("--namespace <namespace>", "Temporal namespace (default: default)")
  .option("--task-queue <taskQueue>", "Task queue name (default: <name>-queue)")
  .action(async (options) => {
    const validTypes = ["webhook", "schedule", "polling", "manual"];
    if (!validTypes.includes(options.type)) {
      console.error(`Error: Invalid type "${options.type}". Must be one of: ${validTypes.join(", ")}`);
      process.exit(1);
    }
    await init({
      type: options.type,
      name: options.name,
      namespace: options.namespace,
      taskQueue: options.taskQueue,
    });
  });

// Login command
program
  .command("login")
  .description("Authenticate with your workflow deployment token")
  .action(async () => {
    await login();
  });

// Logout command
program
  .command("logout")
  .description("Clear stored authentication credentials")
  .action(async () => {
    await logout();
  });

// Whoami command
program
  .command("whoami")
  .description("Show current authentication status")
  .action(async () => {
    await whoami();
  });

// Deploy command
program
  .command("deploy <path>")
  .description("Deploy a workflow from a local directory")
  .option("-v, --version <version>", "Specify version (default: auto-generated timestamp)")
  .option("-f, --force", "Force overwrite if version exists")
  .option("-t, --tenant <tenantId>", "Target tenant ID (master admin only)")
  .action(async (path, options) => {
    await deploy(path, {
      version: options.version,
      force: options.force,
      tenant: options.tenant,
    });
  });

// List command
program
  .command("list")
  .alias("ls")
  .description("List all deployed workflows")
  .option("-n, --namespace <namespace>", "Filter by namespace")
  .option("--versions", "Show all versions for each workflow")
  .action(async (options) => {
    await list({
      namespace: options.namespace,
      showVersions: options.versions,
    });
  });

// Info command
program
  .command("info <workflow>")
  .description("Show detailed information about a workflow")
  .option("-v, --version <version>", "Show info for specific version (default: latest)")
  .action(async (workflow, options) => {
    await info(workflow, options.version);
  });

// Rollback command
program
  .command("rollback <workflow>")
  .description("Rollback a workflow to a previous version")
  .option("-v, --version <version>", "Target version to rollback to (default: previous version)")
  .action(async (workflow, options) => {
    await rollback(workflow, options.version);
  });

// Delete command
program
  .command("delete <workflow>")
  .alias("rm")
  .description("Delete a workflow or specific version")
  .option("-v, --version <version>", "Delete specific version")
  .option("--all", "Delete all versions")
  .action(async (workflow, options) => {
    await deleteWorkflow(workflow, {
      version: options.version,
      all: options.all,
    });
  });

// Run command - execute workflow on Temporal server
program
  .command("run <path>")
  .description("Start a workflow execution on the Temporal server")
  .option("-i, --input <json>", "Input data as JSON string")
  .option("-f, --input-file <file>", "Input data from JSON file")
  .option("--workflow-id <id>", "Custom workflow ID (default: auto-generated)")
  .option("-w, --wait", "Wait for workflow to complete and show result")
  .action(async (path, options) => {
    await run(path, {
      input: options.input,
      inputFile: options.inputFile,
      workflowId: options.workflowId,
      wait: options.wait,
    });
  });

// Signal command - send signal to running workflow
program
  .command("signal <workflowId> <signalName>")
  .description("Send a signal to a running workflow")
  .option("-d, --data <json>", "Signal data as JSON string")
  .action(async (workflowId, signalName, options) => {
    await signal(workflowId, signalName, { data: options.data });
  });

// Query command - query workflow state
program
  .command("query <workflowId> <queryName>")
  .description("Query a workflow's state")
  .action(async (workflowId, queryName) => {
    await query(workflowId, queryName);
  });

// Status command - get workflow status
program
  .command("status <workflowId>")
  .description("Get the status of a workflow execution")
  .action(async (workflowId) => {
    await status(workflowId);
  });

// Cancel command - request workflow cancellation
program
  .command("cancel <workflowId>")
  .description("Request cancellation of a running workflow")
  .action(async (workflowId) => {
    await cancel(workflowId);
  });

// Terminate command - forcefully terminate workflow
program
  .command("terminate <workflowId>")
  .description("Forcefully terminate a running workflow")
  .option("-r, --reason <reason>", "Reason for termination")
  .action(async (workflowId, options) => {
    await terminate(workflowId, { reason: options.reason });
  });

program.parse();
