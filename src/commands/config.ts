import chalk from "chalk";
import * as readline from "readline";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

const CONFIG_DIR = path.join(os.homedir(), ".workflow-cli");
const CONFIG_FILE = path.join(CONFIG_DIR, "config.json");

interface CliConfig {
  token?: string;
  apiKey?: string;
  user?: {
    id: string;
    email: string;
    name: string;
  };
  savedAt?: string;
  minio?: {
    endpoint: string;
    port: number;
    useSSL: boolean;
    accessKey: string;
    secretKey: string;
    bucket: string;
  };
  temporal?: {
    address: string;
    namespace: string;
  };
  apiUrl?: string;
}

function ensureConfigDir(): void {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  }
}

function loadConfig(): CliConfig {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const content = fs.readFileSync(CONFIG_FILE, "utf-8");
      return JSON.parse(content);
    }
  } catch {
    // ignore
  }
  return {};
}

function saveConfig(config: CliConfig): void {
  ensureConfigDir();
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), { mode: 0o600 });
}

export function getMinioConfig(): CliConfig["minio"] | null {
  // First check environment variables
  if (process.env.MINIO_ACCESS_KEY && process.env.MINIO_SECRET_KEY) {
    return {
      endpoint: process.env.MINIO_ENDPOINT || "localhost",
      port: parseInt(process.env.MINIO_PORT || "9000", 10),
      useSSL: process.env.MINIO_USE_SSL === "true",
      accessKey: process.env.MINIO_ACCESS_KEY,
      secretKey: process.env.MINIO_SECRET_KEY,
      bucket: process.env.MINIO_BUCKET || "temporal-workflows",
    };
  }

  // Then check config file
  const config = loadConfig();
  return config.minio || null;
}

export function getApiUrl(): string {
  return process.env.WORKFLOW_CLI_API_URL || loadConfig().apiUrl || "http://localhost:3001";
}

function createReadline(): readline.Interface {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

async function prompt(rl: readline.Interface, question: string, defaultValue?: string): Promise<string> {
  return new Promise((resolve) => {
    const defaultText = defaultValue ? ` (${defaultValue})` : "";
    rl.question(`${question}${defaultText}: `, (answer) => {
      resolve(answer || defaultValue || "");
    });
  });
}

export async function configSetup(): Promise<void> {
  console.log(chalk.bold("\nWorkflow CLI Configuration\n"));

  const existingConfig = loadConfig();
  const existingMinio = existingConfig.minio;
  const existingTemporal = existingConfig.temporal;

  const rl = createReadline();

  try {
    console.log(chalk.gray("Configure MinIO connection settings:\n"));

    const endpoint = await prompt(rl, "MinIO Endpoint", existingMinio?.endpoint || "localhost");
    const port = await prompt(rl, "MinIO Port", String(existingMinio?.port || 9000));
    const useSSL = await prompt(rl, "Use SSL (true/false)", String(existingMinio?.useSSL || false));
    const accessKey = await prompt(rl, "MinIO Access Key", existingMinio?.accessKey || "minioadmin");
    const secretKey = await prompt(rl, "MinIO Secret Key", existingMinio?.secretKey || "minioadmin");
    const bucket = await prompt(rl, "MinIO Bucket", existingMinio?.bucket || "temporal-workflows");

    console.log(chalk.gray("\nConfigure Temporal server settings:\n"));

    const temporalAddress = await prompt(rl, "Temporal Address", existingTemporal?.address || "localhost:7233");
    const temporalNamespace = await prompt(rl, "Temporal Namespace", existingTemporal?.namespace || "default");

    console.log(chalk.gray("\nConfigure API settings:\n"));

    const apiUrl = await prompt(rl, "API URL", existingConfig.apiUrl || "http://localhost:3001");

    const newConfig: CliConfig = {
      ...existingConfig,
      minio: {
        endpoint,
        port: parseInt(port, 10),
        useSSL: useSSL === "true",
        accessKey,
        secretKey,
        bucket,
      },
      temporal: {
        address: temporalAddress,
        namespace: temporalNamespace,
      },
      apiUrl,
    };

    saveConfig(newConfig);

    console.log(chalk.green("\nConfiguration saved successfully!"));
    console.log(chalk.gray(`Config file: ${CONFIG_FILE}\n`));
  } finally {
    rl.close();
  }
}

export async function configShow(): Promise<void> {
  const config = loadConfig();

  console.log(chalk.bold("\nCurrent Configuration\n"));

  if (config.minio) {
    console.log(chalk.cyan("MinIO:"));
    console.log(`  Endpoint:   ${config.minio.endpoint}`);
    console.log(`  Port:       ${config.minio.port}`);
    console.log(`  SSL:        ${config.minio.useSSL}`);
    console.log(`  Access Key: ${config.minio.accessKey.substring(0, 4)}****`);
    console.log(`  Secret Key: ****`);
    console.log(`  Bucket:     ${config.minio.bucket}`);
  } else {
    console.log(chalk.yellow("MinIO: Not configured"));
    console.log(chalk.gray("  Run 'workflow-cli config setup' to configure"));
  }

  console.log("");

  if (config.temporal) {
    console.log(chalk.cyan("Temporal:"));
    console.log(`  Address:    ${config.temporal.address}`);
    console.log(`  Namespace:  ${config.temporal.namespace}`);
  } else {
    console.log(chalk.cyan("Temporal:"));
    console.log(`  Address:    localhost:7233 (default)`);
    console.log(`  Namespace:  default`);
  }

  console.log("");

  if (config.apiUrl) {
    console.log(chalk.cyan("API:"));
    console.log(`  URL: ${config.apiUrl}`);
  } else {
    console.log(chalk.cyan("API:"));
    console.log(`  URL: http://localhost:3001 (default)`);
  }

  console.log("");

  if (config.user) {
    console.log(chalk.cyan("User:"));
    console.log(`  Email: ${config.user.email}`);
    console.log(`  Name:  ${config.user.name}`);
    if ((config as any).user?.role) {
      console.log(`  Role:  ${(config as any).user.role}`);
    }
  }

  if ((config as any).tenant) {
    console.log("");
    console.log(chalk.cyan("Workspace:"));
    console.log(`  Name:      ${(config as any).tenant.name}`);
    console.log(`  Tenant ID: ${(config as any).tenant.tenantId}`);
  }

  console.log(chalk.gray(`\nConfig file: ${CONFIG_FILE}\n`));
}

export async function configSet(key: string, value: string): Promise<void> {
  const config = loadConfig();

  const keyParts = key.split(".");

  if (keyParts[0] === "minio") {
    if (!config.minio) {
      config.minio = {
        endpoint: "localhost",
        port: 9000,
        useSSL: false,
        accessKey: "",
        secretKey: "",
        bucket: "temporal-workflows",
      };
    }

    switch (keyParts[1]) {
      case "endpoint":
        config.minio.endpoint = value;
        break;
      case "port":
        config.minio.port = parseInt(value, 10);
        break;
      case "useSSL":
        config.minio.useSSL = value === "true";
        break;
      case "accessKey":
        config.minio.accessKey = value;
        break;
      case "secretKey":
        config.minio.secretKey = value;
        break;
      case "bucket":
        config.minio.bucket = value;
        break;
      default:
        console.log(chalk.red(`Unknown minio config key: ${keyParts[1]}`));
        return;
    }
  } else if (keyParts[0] === "temporal") {
    if (!config.temporal) {
      config.temporal = {
        address: "localhost:7233",
        namespace: "default",
      };
    }

    switch (keyParts[1]) {
      case "address":
        config.temporal.address = value;
        break;
      case "namespace":
        config.temporal.namespace = value;
        break;
      default:
        console.log(chalk.red(`Unknown temporal config key: ${keyParts[1]}`));
        return;
    }
  } else if (key === "apiUrl") {
    config.apiUrl = value;
  } else {
    console.log(chalk.red(`Unknown config key: ${key}`));
    console.log(chalk.gray("Available keys:"));
    console.log(chalk.gray("  minio.endpoint, minio.port, minio.useSSL, minio.accessKey, minio.secretKey, minio.bucket"));
    console.log(chalk.gray("  temporal.address, temporal.namespace"));
    console.log(chalk.gray("  apiUrl"));
    return;
  }

  saveConfig(config);
  console.log(chalk.green(`Set ${key} = ${key.includes("Key") ? "****" : value}`));
}

