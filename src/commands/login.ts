import chalk from "chalk";
import * as readline from "readline";
import {
  loginWithApiKey,
  isAuthenticated,
  clearAuth,
  getAuthSource,
  getCurrentUser,
  API_KEY_ENV_VAR,
  SECRET_KEY_ENV_VAR,
} from "../services/auth";

function createReadline(): readline.Interface {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

async function prompt(rl: readline.Interface, question: string, hidden = false): Promise<string> {
  return new Promise((resolve) => {
    if (hidden && process.stdin.isTTY) {
      process.stdout.write(question);

      let answer = "";
      process.stdin.setRawMode(true);
      process.stdin.resume();
      process.stdin.setEncoding("utf8");

      const onData = (char: string) => {
        if (char === "\n" || char === "\r" || char === "\u0004") {
          process.stdin.setRawMode(false);
          process.stdin.pause();
          process.stdin.removeListener("data", onData);
          console.log("");
          resolve(answer);
        } else if (char === "\u0003") {
          process.exit(0);
        } else if (char === "\u007F" || char === "\b") {
          answer = answer.slice(0, -1);
        } else {
          answer += char;
        }
      };

      process.stdin.on("data", onData);
    } else {
      rl.question(question, (answer) => {
        resolve(answer);
      });
    }
  });
}

export async function login(): Promise<void> {
  console.log(chalk.bold("\nWorkflow CLI Authentication\n"));

  // Check if using env vars
  if (process.env[API_KEY_ENV_VAR] && process.env[SECRET_KEY_ENV_VAR]) {
    const authenticated = await isAuthenticated();
    if (authenticated) {
      console.log(chalk.green(`Authenticated via environment variables.`));
      console.log(chalk.gray(`(${API_KEY_ENV_VAR} and ${SECRET_KEY_ENV_VAR})\n`));
      return;
    }
  }

  // Check if already logged in
  const authenticated = await isAuthenticated();
  if (authenticated) {
    const user = getCurrentUser();
    console.log(chalk.yellow("You are already logged in."));
    if (user) {
      console.log(chalk.gray(`User: ${user.email}`));
    }
    console.log("Use 'workflow-cli logout' to clear your credentials.\n");
    return;
  }

  console.log(chalk.gray("Enter your API credentials from the Temporal API dashboard.\n"));

  const rl = createReadline();

  try {
    const apiKey = await prompt(rl, "API Key: ");

    if (!apiKey) {
      console.log(chalk.red("No API key provided. Login cancelled."));
      return;
    }

    const secretKey = await prompt(rl, "Secret Key: ", true);

    if (!secretKey) {
      console.log(chalk.red("No secret key provided. Login cancelled."));
      return;
    }

    console.log(chalk.gray("\nAuthenticating..."));

    const result = await loginWithApiKey(apiKey, secretKey);

    if (!result.success) {
      console.log(chalk.red(`\nLogin failed: ${result.message}`));
      return;
    }

    console.log(chalk.green("\nAuthentication successful!"));
    if (result.user) {
      console.log(chalk.gray(`Logged in as: ${result.user.email}`));
    }
    console.log(chalk.gray("Credentials saved to ~/.workflow-cli/config.json\n"));
  } finally {
    rl.close();
  }
}

export async function logout(): Promise<void> {
  const authenticated = await isAuthenticated();

  if (!authenticated) {
    console.log(chalk.yellow("You are not logged in."));
    return;
  }

  if (process.env[API_KEY_ENV_VAR] && process.env[SECRET_KEY_ENV_VAR]) {
    console.log(chalk.yellow(`Cannot logout when using environment variables.`));
    console.log(`Unset ${API_KEY_ENV_VAR} and ${SECRET_KEY_ENV_VAR} to logout.`);
    return;
  }

  clearAuth();
  console.log(chalk.green("Logged out successfully."));
}

export async function whoami(): Promise<void> {
  const source = getAuthSource();

  if (!source) {
    console.log(chalk.yellow("Not authenticated."));
    console.log(`Use 'workflow-cli login' or set ${API_KEY_ENV_VAR} and ${SECRET_KEY_ENV_VAR} env vars.`);
    return;
  }

  const user = getCurrentUser();

  console.log(chalk.green("Authenticated"));
  console.log(`Source: ${chalk.gray(source === "env" ? "environment variables" : "config file")}`);

  if (user) {
    console.log(`User: ${chalk.cyan(user.email)}`);
    console.log(`Name: ${chalk.gray(user.name)}`);
  }
}
