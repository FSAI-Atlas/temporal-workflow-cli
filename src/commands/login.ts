import chalk from "chalk";
import * as readline from "readline";
import { 
  saveAuth, 
  validateSecret, 
  isAuthenticated, 
  clearAuth, 
  getAuthSource,
  SECRET_ENV_VAR 
} from "../services/auth";

function createReadline(): readline.Interface {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

async function promptSecret(rl: readline.Interface): Promise<string> {
  return new Promise((resolve) => {
    process.stdout.write("Enter the CLI secret: ");
    
    let secret = "";
    
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
      process.stdin.resume();
      process.stdin.setEncoding("utf8");
      
      const onData = (char: string) => {
        if (char === "\n" || char === "\r" || char === "\u0004") {
          process.stdin.setRawMode(false);
          process.stdin.pause();
          process.stdin.removeListener("data", onData);
          console.log("");
          resolve(secret);
        } else if (char === "\u0003") {
          process.exit(0);
        } else if (char === "\u007F" || char === "\b") {
          secret = secret.slice(0, -1);
        } else {
          secret += char;
        }
      };
      
      process.stdin.on("data", onData);
    } else {
      rl.question("", (answer) => {
        resolve(answer);
      });
    }
  });
}

export async function login(): Promise<void> {
  console.log(chalk.bold("\nWorkflow CLI Authentication\n"));

  // Check if using env var
  if (process.env[SECRET_ENV_VAR] && isAuthenticated()) {
    console.log(chalk.green(`Authenticated via ${SECRET_ENV_VAR} environment variable.`));
    return;
  }

  // Check if already logged in
  if (isAuthenticated()) {
    console.log(chalk.yellow("You are already logged in."));
    console.log("Use 'workflow-cli logout' to clear your credentials.\n");
    return;
  }

  const rl = createReadline();

  try {
    const secret = await promptSecret(rl);

    if (!secret) {
      console.log(chalk.red("No secret provided. Login cancelled."));
      return;
    }

    if (!validateSecret(secret)) {
      console.log(chalk.red("\nInvalid secret. Access denied."));
      return;
    }

    saveAuth(secret);

    console.log(chalk.green("\nAuthentication successful!"));
    console.log(chalk.gray("Credentials saved to ~/.workflow-cli/config.json\n"));
  } finally {
    rl.close();
  }
}

export async function logout(): Promise<void> {
  if (!isAuthenticated()) {
    console.log(chalk.yellow("You are not logged in."));
    return;
  }

  if (process.env[SECRET_ENV_VAR]) {
    console.log(chalk.yellow(`Cannot logout when using ${SECRET_ENV_VAR} env var.`));
    console.log("Unset the env var to logout.");
    return;
  }

  clearAuth();
  console.log(chalk.green("Logged out successfully."));
}

export async function whoami(): Promise<void> {
  const source = getAuthSource();

  if (!source) {
    console.log(chalk.yellow("Not authenticated."));
    console.log(`Use 'workflow-cli login' or set ${SECRET_ENV_VAR} env var.`);
    return;
  }

  console.log(chalk.green("Authenticated"));
  console.log(`Source: ${chalk.gray(source === "env" ? `env var (${SECRET_ENV_VAR})` : "config file")}`);
}
