import * as fs from "fs";
import * as path from "path";
import * as os from "os";

const CONFIG_DIR = path.join(os.homedir(), ".workflow-cli");
const CONFIG_FILE = path.join(CONFIG_DIR, "config.json");

// Environment variable names
export const API_KEY_ENV_VAR = "WORKFLOW_CLI_API_KEY";
export const SECRET_KEY_ENV_VAR = "WORKFLOW_CLI_SECRET_KEY";

// Default API URL (can be overridden by env var)
const API_URL = process.env.WORKFLOW_CLI_API_URL || "http://localhost:3001";

interface AuthConfig {
  token: string;
  apiKey: string;
  user: {
    id: string;
    email: string;
    name: string;
  };
  savedAt: string;
}

interface LoginResponse {
  success: boolean;
  message: string;
  data?: {
    token: string;
    user: {
      id: string;
      email: string;
      name: string;
    };
  };
}

interface VerifyResponse {
  success: boolean;
  data?: {
    userId: string;
    email: string;
    type: string;
    valid: boolean;
  };
}

function ensureConfigDir(): void {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  }
}

// Login to the API using API key and secret key
export async function loginWithApiKey(apiKey: string, secretKey: string): Promise<{
  success: boolean;
  message: string;
  user?: { id: string; email: string; name: string };
}> {
  try {
    const response = await fetch(`${API_URL}/cli/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ apiKey, secretKey }),
    });

    const data = (await response.json()) as LoginResponse;

    if (!data.success || !data.data) {
      return { success: false, message: data.message || "Login failed" };
    }

    // Save auth config
    saveAuth(data.data.token, apiKey, data.data.user);

    return {
      success: true,
      message: "Login successful",
      user: data.data.user,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Connection failed";
    return { success: false, message: `API error: ${message}` };
  }
}

// Save authenticated state with token
export function saveAuth(
  token: string,
  apiKey: string,
  user: { id: string; email: string; name: string }
): void {
  ensureConfigDir();

  const config: AuthConfig = {
    token,
    apiKey,
    user,
    savedAt: new Date().toISOString(),
  };

  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), { mode: 0o600 });
}

// Get saved auth config
export function getAuthConfig(): AuthConfig | null {
  try {
    if (!fs.existsSync(CONFIG_FILE)) {
      return null;
    }

    const content = fs.readFileSync(CONFIG_FILE, "utf-8");
    return JSON.parse(content);
  } catch {
    return null;
  }
}

// Get the stored JWT token
export function getToken(): string | null {
  const config = getAuthConfig();
  return config?.token || null;
}

// Check if authenticated (has valid token)
export async function isAuthenticated(): Promise<boolean> {
  // Check env vars first
  const envApiKey = process.env[API_KEY_ENV_VAR];
  const envSecretKey = process.env[SECRET_KEY_ENV_VAR];

  if (envApiKey && envSecretKey) {
    // Try to login with env vars
    const result = await loginWithApiKey(envApiKey, envSecretKey);
    return result.success;
  }

  // Check config file
  const config = getAuthConfig();
  if (!config?.token) {
    return false;
  }

  // Verify token with API
  return verifyToken(config.token);
}

// Verify token with the API
export async function verifyToken(token: string): Promise<boolean> {
  try {
    const response = await fetch(`${API_URL}/cli/verify`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const data = (await response.json()) as VerifyResponse;
    return data.success && data.data?.valid === true;
  } catch {
    return false;
  }
}

// Get authentication source
export function getAuthSource(): "env" | "config" | null {
  const envApiKey = process.env[API_KEY_ENV_VAR];
  const envSecretKey = process.env[SECRET_KEY_ENV_VAR];

  if (envApiKey && envSecretKey) {
    return "env";
  }

  const config = getAuthConfig();
  if (config?.token) {
    return "config";
  }

  return null;
}

// Get current user info
export function getCurrentUser(): { id: string; email: string; name: string } | null {
  const config = getAuthConfig();
  return config?.user || null;
}

// Clear authentication
export function clearAuth(): void {
  if (fs.existsSync(CONFIG_FILE)) {
    fs.unlinkSync(CONFIG_FILE);
  }
}

// Require authentication - exits if not authenticated
export async function requireAuth(): Promise<void> {
  const authenticated = await isAuthenticated();

  if (!authenticated) {
    console.error("\nError: Not authenticated. Please run 'workflow-cli login' first.\n");
    process.exit(1);
  }
}

// Get authorization header for API requests
export function getAuthHeader(): { Authorization: string } | Record<string, never> {
  const token = getToken();
  if (token) {
    return { Authorization: `Bearer ${token}` };
  }
  return {};
}
