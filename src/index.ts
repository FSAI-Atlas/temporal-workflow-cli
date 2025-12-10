#!/usr/bin/env node

import { Command } from "commander";
import { deploy, list, rollback, deleteWorkflow, info, login, logout, whoami } from "./commands";

const program = new Command();

program
  .name("workflow-cli")
  .description("CLI for deploying Temporal workflows to MinIO storage")
  .version("1.0.0");

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
  .action(async (path, options) => {
    await deploy(path, {
      version: options.version,
      force: options.force,
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

program.parse();
