# Temporal Workflow CLI

A command-line interface for deploying Temporal workflows to MinIO storage. This CLI works in conjunction with `temporal-worker` to enable dynamic workflow deployment without server restarts.

## Authentication

Before using the CLI, you must authenticate with your deployment token:

```bash
# Login with your token
workflow-cli login
# Enter your authentication token: ********************************

# Check authentication status
workflow-cli whoami

# Logout
workflow-cli logout
```

The token is stored securely in `~/.workflow-cli/config.json` with restricted permissions.

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

## Installation

```bash
# Clone the repository
git clone <repo-url>
cd temporal-workflow-cli

# Install dependencies
npm install

# Build
npm run build

# Link globally (optional)
npm link
```

## Configuration

Create a `.env` file in the project root or set environment variables:

```bash
# MinIO Configuration (required)
MINIO_ENDPOINT=localhost
MINIO_PORT=9000
MINIO_USE_SSL=false
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin

# Optional
MINIO_BUCKET=temporal-workflows
```

## Usage

### Authentication

```bash
# Login (required before other commands)
workflow-cli login

# Check status
workflow-cli whoami

# Logout
workflow-cli logout
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
2. Worker detects the new/updated workflow
3. Worker downloads and extracts the bundle
4. Worker registers the workflow with appropriate triggers
5. Workflow becomes available for execution

See the `temporal-worker` project for more details on the worker configuration.

