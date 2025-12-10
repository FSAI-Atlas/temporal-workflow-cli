import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import * as crypto from "crypto";

const CONFIG_DIR = path.join(os.homedir(), ".workflow-cli");
const CONFIG_FILE = path.join(CONFIG_DIR, "config.json");

// Hardcoded secret hash for CLI authentication
// The actual secret is: "temporal-workflow-secret-2024"
// Users need to provide this secret to authenticate
const VALID_SECRET_HASH = "c631af88bca74ada4354516b5b474990dac27d9d0ef475b0084472cac73df482";

// Environment variable name for the authentication secret
export const SECRET_ENV_VAR = "WORKFLOW_CLI_SECRET";

interface AuthConfig {
  secretHash: string;
  savedAt: string;
}

function ensureConfigDir(): void {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  }
}

// Hash a secret for storage/comparison
export function hashSecret(secret: string): string {
  return crypto.createHash("sha256").update(secret).digest("hex");
}

// Validate if the provided secret is correct
export function validateSecret(secret: string): boolean {
  const hash = hashSecret(secret);
  return hash === VALID_SECRET_HASH;
}

// Save authenticated state
export function saveAuth(secret: string): void {
  ensureConfigDir();

  const config: AuthConfig = {
    secretHash: hashSecret(secret),
    savedAt: new Date().toISOString(),
  };

  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), { mode: 0o600 });
}

// Check if authenticated (via env var or config file)
export function isAuthenticated(): boolean {
  // Check env var first
  const envSecret = process.env[SECRET_ENV_VAR];
  if (envSecret) {
    return validateSecret(envSecret);
  }

  // Check config file
  try {
    if (!fs.existsSync(CONFIG_FILE)) {
      return false;
    }

    const content = fs.readFileSync(CONFIG_FILE, "utf-8");
    const config: AuthConfig = JSON.parse(content);
    return config.secretHash === VALID_SECRET_HASH;
  } catch {
    return false;
  }
}

// Get authentication source
export function getAuthSource(): "env" | "config" | null {
  const envSecret = process.env[SECRET_ENV_VAR];
  if (envSecret && validateSecret(envSecret)) {
    return "env";
  }

  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const content = fs.readFileSync(CONFIG_FILE, "utf-8");
      const config: AuthConfig = JSON.parse(content);
      if (config.secretHash === VALID_SECRET_HASH) {
        return "config";
      }
    }
  } catch {
    // ignore
  }

  return null;
}

// Clear authentication
export function clearAuth(): void {
  if (fs.existsSync(CONFIG_FILE)) {
    fs.unlinkSync(CONFIG_FILE);
  }
}

// Require authentication - exits if not authenticated
export function requireAuth(): void {
  if (!isAuthenticated()) {
    console.error("\nError: Not authenticated. Please run 'workflow-cli login' first.\n");
    process.exit(1);
  }
}
