# Temporal Workflow CLI

A command-line interface for deploying Temporal workflows to MinIO storage. This CLI works in conjunction with `temporal-worker` to enable dynamic workflow deployment without server restarts.

## Installation

```bash
# Install globally from npm
npm install -g temporal-workflow-cli

# Or clone and build locally
git clone <repo-url>
cd temporal-workflow-cli
npm install
npm run build
npm link
```

## Quick Start

```bash
# 1. Configure MinIO connection
workflow-cli config setup

# 2. Authenticate with your API credentials
workflow-cli login

# 3. Create a new workflow
workflow-cli init --type webhook --name myWorkflow

# 4. Deploy the workflow
workflow-cli deploy ./my-workflow
```

## Architecture

```
┌─────────────────┐         ┌─────────────────┐         ┌─────────────────┐
│   Developer     │         │     MinIO       │         │ temporal-worker │
│                 │         │                 │         │                 │
│  workflow-cli   │ deploy  │   Bucket:       │  watch  │   Discovers &   │
│    deploy       │ ──────► │   workflows/    │ ◄────── │   executes      │
│                 │         │                 │         │   workflows     │
└─────────────────┘         └─────────────────┘         └─────────────────┘
```

## Configuration

The CLI stores configuration in `~/.workflow-cli/config.json`. You can configure it using the built-in commands or environment variables.

### Using CLI Commands (Recommended)

```bash
# Interactive setup - guides you through all settings
workflow-cli config setup

# Or set individual values
workflow-cli config set minio.endpoint localhost
workflow-cli config set minio.port 9000
workflow-cli config set minio.useSSL false
workflow-cli config set minio.accessKey minioadmin
workflow-cli config set minio.secretKey minioadmin
workflow-cli config set minio.bucket temporal-workflows

# Temporal server settings
workflow-cli config set temporal.address localhost:7233
workflow-cli config set temporal.namespace default

# API settings
workflow-cli config set apiUrl http://localhost:3001

# View current configuration
workflow-cli config show
```

### Using Environment Variables (CI/CD Only)

> **Note:** For normal usage, use `workflow-cli config set`. Environment variables are only useful in CI/CD pipelines where file persistence is not available.

Environment variables override the config file when defined:

```bash
# Example for GitHub Actions / Docker
export MINIO_ACCESS_KEY=${{ secrets.MINIO_ACCESS_KEY }}
export MINIO_SECRET_KEY=${{ secrets.MINIO_SECRET_KEY }}
export TEMPORAL_ADDRESS=temporal.production.com:7233
```

### Configuration Priority

1. **Environment variables** - highest priority (CI/CD only)
2. **Config file** (`~/.workflow-cli/config.json`) - normal usage (recommended)

## Authentication

Before deploying workflows, you must authenticate with your API credentials:

```bash
# Login with your API key and secret
workflow-cli login
# Enter your API Key: tk_xxxxxxxxxxxx
# Enter your Secret Key: sk_xxxxxxxxxxxx

# Check authentication status
workflow-cli whoami

# Logout
workflow-cli logout
```

The authentication token is stored securely in `~/.workflow-cli/config.json` with restricted permissions (600).

## Usage

### Initialize a New Workflow

Create a new workflow project with the scaffolding for your trigger type:

```bash
# Create a webhook-triggered workflow
workflow-cli init --type webhook --name orderProcessor

# Create a scheduled workflow
workflow-cli init --type schedule --name dailyReport --namespace reports

# Create a polling workflow
workflow-cli init --type polling --name dataSync

# Create a manually-triggered workflow
workflow-cli init --type manual --name batchJob --task-queue batch-queue
```

**Generated structure:**

```
my-workflow/
├── activities.ts   # Activity implementations
├── workflow.ts     # Workflow definition
├── config.ts       # Deployment configuration
├── .env.example    # Environment template
├── .gitignore      
├── package.json    
├── tsconfig.json   
└── README.md       
```

### Deploy a Workflow

```bash
# Deploy from a workflow directory
workflow-cli deploy ./my-workflow

# Deploy with a specific version
workflow-cli deploy ./my-workflow --version v1.0.0

# Force overwrite existing version
workflow-cli deploy ./my-workflow --version v1.0.0 --force
```

### List Workflows

```bash
# List all workflows
workflow-cli list

# List with all versions
workflow-cli list --versions

# Filter by namespace
workflow-cli list --namespace orders
```

### Get Workflow Info

```bash
# Show info for latest version
workflow-cli info my-workflow

# Show info for specific version
workflow-cli info my-workflow --version v1.0.0
```

### Rollback

```bash
# Rollback to previous version
workflow-cli rollback my-workflow

# Rollback to specific version
workflow-cli rollback my-workflow --version v1.0.0
```

### Delete

```bash
# Delete specific version
workflow-cli delete my-workflow --version v1.0.0

# Delete all versions
workflow-cli delete my-workflow --all
```

### Run a Workflow

Execute a workflow directly on the Temporal server:

```bash
# Run with JSON input
workflow-cli run ./my-workflow -i '{"key": "value"}'

# Run with input from file
workflow-cli run ./my-workflow -f input.json

# Run and wait for result
workflow-cli run ./my-workflow -i '{"key": "value"}' --wait

# Run with custom workflow ID
workflow-cli run ./my-workflow --workflow-id my-custom-id -i '{}'
```

### Workflow Operations

Interact with running workflows:

```bash
# Check workflow status
workflow-cli status <workflowId>

# Send a signal to a workflow
workflow-cli signal <workflowId> mySignal -d '{"data": "value"}'

# Query workflow state
workflow-cli query <workflowId> myQuery

# Cancel a workflow (graceful)
workflow-cli cancel <workflowId>

# Terminate a workflow (forceful)
workflow-cli terminate <workflowId> --reason "Manual termination"
```

## Workflow Structure

Each workflow must follow this structure:

```
my-workflow/
├── workflow.ts     # Workflow implementation (required)
└── config.ts       # Workflow configuration (required)
```

### workflow.ts

```typescript
import { proxyActivities } from "@temporalio/workflow";

const activities = proxyActivities<{
  logMessage: (message: string) => Promise<void>;
}>({
  startToCloseTimeout: "1 minute",
});

interface OrderInput {
  orderId: string;
  amount: number;
}

export async function orderWorkflow(input: OrderInput): Promise<string> {
  await activities.logMessage(`Processing order ${input.orderId}`);
  return `Order ${input.orderId} completed`;
}
```

### config.ts

```typescript
export const orderWorkflowConfig = {
  // Name must match the exported workflow function
  name: "orderWorkflow",

  // Temporal namespace
  namespace: "orders",

  // Task queue for this workflow
  taskQueue: "order-processing",

  // Trigger configuration
  trigger: {
    type: "webhook" as const,  // "schedule" | "polling" | "webhook" | "manual"
    config: {
      path: "/orders",
      method: "POST",
    },
  },
};
```

## Trigger Types

### Schedule

Runs the workflow on a cron schedule or fixed interval:

```typescript
trigger: {
  type: "schedule",
  config: {
    cronExpression: "0 * * * *",  // Every hour
    // OR
    intervalMs: 3600000,  // Every hour in milliseconds
  },
}
```

### Polling

Periodically checks an endpoint and triggers when data is available:

```typescript
trigger: {
  type: "polling",
  config: {
    intervalMs: 60000,  // Check every minute
    endpoint: "https://api.example.com/pending-items",  // Optional
  },
}
```

### Webhook

Exposes an HTTP endpoint that triggers the workflow:

```typescript
trigger: {
  type: "webhook",
  config: {
    path: "/orders",
    method: "POST",  // GET, POST, PUT, DELETE
    auth: {  // Optional authentication
      type: "api-key",
      token: "your-secret-token",
      headerName: "X-API-Key",
    },
  },
}
```

### Manual

No automatic trigger, workflow is started programmatically:

```typescript
trigger: {
  type: "manual",
  config: {},
}
```

## MinIO Storage Structure

Deployed workflows are stored in MinIO with the following structure:

```
temporal-workflows/           # Bucket
├── order-workflow/           # Workflow name
│   ├── latest                # Points to current version
│   ├── 20241210-143052/      # Version (timestamp)
│   │   ├── bundle.zip        # Workflow code
│   │   └── metadata.json     # Deployment metadata
│   └── v1.0.0/               # Custom version
│       ├── bundle.zip
│       └── metadata.json
└── payment-workflow/
    └── ...
```

## Metadata

Each deployment stores metadata including:

```json
{
  "name": "orderWorkflow",
  "version": "20241210-143052",
  "namespace": "orders",
  "taskQueue": "order-processing",
  "trigger": {
    "type": "webhook",
    "config": {
      "path": "/orders",
      "method": "POST"
    }
  },
  "deployedAt": "2024-12-10T14:30:52.000Z",
  "deployedBy": "developer",
  "checksum": "sha256:abc123..."
}
```

## Commands Reference

| Command | Description |
|---------|-------------|
| `workflow-cli init -t <type> -n <name>` | Create a new workflow project |
| `workflow-cli config setup` | Interactive configuration setup |
| `workflow-cli config show` | Show current configuration |
| `workflow-cli config set <key> <value>` | Set a configuration value |
| `workflow-cli login` | Authenticate with API credentials |
| `workflow-cli logout` | Clear stored credentials |
| `workflow-cli whoami` | Show current authentication status |
| `workflow-cli deploy <path>` | Deploy a workflow to MinIO |
| `workflow-cli run <path>` | Start a workflow execution on Temporal |
| `workflow-cli status <workflowId>` | Get workflow execution status |
| `workflow-cli signal <workflowId> <signal>` | Send a signal to a running workflow |
| `workflow-cli query <workflowId> <query>` | Query a workflow's state |
| `workflow-cli cancel <workflowId>` | Request workflow cancellation |
| `workflow-cli terminate <workflowId>` | Forcefully terminate a workflow |
| `workflow-cli list` | List all deployed workflows |
| `workflow-cli info <workflow>` | Show workflow details |
| `workflow-cli rollback <workflow>` | Rollback to previous version |
| `workflow-cli delete <workflow>` | Delete a workflow |

## Development

```bash
# Run in development mode
npm run dev -- deploy ./my-workflow

# Build
npm run build

# Run built version
npm start -- deploy ./my-workflow
```

## Integration with temporal-worker

The `temporal-worker` project watches the MinIO bucket for new workflows. When a workflow is deployed:

1. CLI packages the workflow and uploads to MinIO
2. Deployment is registered in the database via `temporal-api`
3. Worker detects the new/updated workflow
4. Worker downloads and extracts the bundle
5. Worker registers the workflow with appropriate triggers
6. Workflow becomes available for execution

See the `temporal-worker` project for more details on the worker configuration.
