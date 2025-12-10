import chalk from "chalk";
import * as fs from "fs";
import * as path from "path";

type TriggerType = "webhook" | "schedule" | "polling" | "manual";

interface InitOptions {
  type: TriggerType;
  name: string;
  namespace?: string;
  taskQueue?: string;
}

function toKebabCase(str: string): string {
  return str
    .replace(/([a-z])([A-Z])/g, "$1-$2")
    .replace(/[\s_]+/g, "-")
    .toLowerCase();
}

function toCamelCase(str: string): string {
  return str
    .replace(/[-_\s]+(.)?/g, (_, c) => (c ? c.toUpperCase() : ""))
    .replace(/^(.)/, (c) => c.toLowerCase());
}

function toPascalCase(str: string): string {
  const camel = toCamelCase(str);
  return camel.charAt(0).toUpperCase() + camel.slice(1);
}

function generateActivities(workflowName: string): string {
  const pascalName = toPascalCase(workflowName);

  return `/**
 * Activities for ${pascalName} workflow
 * 
 * Activities are the building blocks of workflows. They perform the actual work
 * and can interact with external services, databases, APIs, etc.
 */

/**
 * Logs a message (example activity)
 */
export async function logMessage(message: string): Promise<void> {
  console.log(\`[${pascalName}] \${message}\`);
}

/**
 * Example activity that processes data
 */
export async function processData(data: Record<string, unknown>): Promise<Record<string, unknown>> {
  // Simulate processing
  console.log(\`[${pascalName}] Processing data:\`, JSON.stringify(data));
  
  return {
    ...data,
    processedAt: new Date().toISOString(),
    status: "processed",
  };
}

/**
 * Example activity that sends a notification
 */
export async function sendNotification(to: string, message: string): Promise<boolean> {
  console.log(\`[${pascalName}] Sending notification to \${to}: \${message}\`);
  
  // In a real implementation, this would send an email, SMS, etc.
  return true;
}
`;
}

function generateWorkflow(workflowName: string, triggerType: TriggerType): string {
  const pascalName = toPascalCase(workflowName);
  const camelName = toCamelCase(workflowName);

  const inputInterface = getInputInterface(triggerType, pascalName);
  const workflowLogic = getWorkflowLogic(triggerType, camelName);

  return `import { proxyActivities } from "@temporalio/workflow";

// Import activity types
const activities = proxyActivities<{
  logMessage: (message: string) => Promise<void>;
  processData: (data: Record<string, unknown>) => Promise<Record<string, unknown>>;
  sendNotification: (to: string, message: string) => Promise<boolean>;
}>({
  startToCloseTimeout: "1 minute",
});

${inputInterface}

/**
 * ${pascalName} Workflow
 * 
 * Trigger type: ${triggerType}
 */
export async function ${camelName}Workflow(input: ${pascalName}Input): Promise<${pascalName}Result> {
${workflowLogic}
}
`;
}

function getInputInterface(triggerType: TriggerType, pascalName: string): string {
  switch (triggerType) {
    case "webhook":
      return `/**
 * Input received from webhook trigger
 */
interface ${pascalName}Input {
  body: Record<string, unknown>;
  query: Record<string, unknown>;
  headers: Record<string, unknown>;
  timestamp: string;
}

interface ${pascalName}Result {
  success: boolean;
  message: string;
  processedAt: string;
}`;

    case "schedule":
      return `/**
 * Input received from schedule trigger
 */
interface ${pascalName}Input {
  scheduledTime: string;
  runId: string;
}

interface ${pascalName}Result {
  success: boolean;
  message: string;
  completedAt: string;
}`;

    case "polling":
      return `/**
 * Input received from polling trigger
 */
interface ${pascalName}Input {
  polledAt: string;
  data: Record<string, unknown> | null;
}

interface ${pascalName}Result {
  success: boolean;
  itemsProcessed: number;
  completedAt: string;
}`;

    case "manual":
      return `/**
 * Input for manual workflow execution
 */
interface ${pascalName}Input {
  data: Record<string, unknown>;
  triggeredBy?: string;
}

interface ${pascalName}Result {
  success: boolean;
  message: string;
  completedAt: string;
}`;
  }
}

function getWorkflowLogic(triggerType: TriggerType, camelName: string): string {
  switch (triggerType) {
    case "webhook":
      return `  await activities.logMessage("Workflow started from webhook");
  
  // Process the incoming data
  const processed = await activities.processData(input.body);
  
  await activities.logMessage("Data processed successfully");
  
  return {
    success: true,
    message: "Webhook processed successfully",
    processedAt: new Date().toISOString(),
  };`;

    case "schedule":
      return `  await activities.logMessage(\`Scheduled run started: \${input.runId}\`);
  
  // Perform scheduled tasks
  const result = await activities.processData({ scheduledTime: input.scheduledTime });
  
  await activities.logMessage("Scheduled task completed");
  
  return {
    success: true,
    message: "Scheduled task completed successfully",
    completedAt: new Date().toISOString(),
  };`;

    case "polling":
      return `  await activities.logMessage(\`Polling check at: \${input.polledAt}\`);
  
  let itemsProcessed = 0;
  
  if (input.data) {
    // Process polled data
    await activities.processData(input.data);
    itemsProcessed = 1;
    await activities.logMessage("Polled data processed");
  } else {
    await activities.logMessage("No data to process");
  }
  
  return {
    success: true,
    itemsProcessed,
    completedAt: new Date().toISOString(),
  };`;

    case "manual":
      return `  await activities.logMessage(\`Manual workflow triggered by: \${input.triggeredBy || "unknown"}\`);
  
  // Process the provided data
  const processed = await activities.processData(input.data);
  
  await activities.logMessage("Manual workflow completed");
  
  return {
    success: true,
    message: "Workflow completed successfully",
    completedAt: new Date().toISOString(),
  };`;
  }
}

function generateConfig(
  workflowName: string,
  triggerType: TriggerType,
  namespace: string,
  taskQueue: string
): string {
  const camelName = toCamelCase(workflowName);
  const triggerConfig = getTriggerConfig(triggerType, workflowName);

  return `/**
 * Workflow Configuration
 * 
 * This file defines how the workflow is deployed and triggered.
 */

export const ${camelName}WorkflowConfig = {
  /**
   * Workflow name - must match the exported workflow function name
   */
  name: "${camelName}Workflow",

  /**
   * Temporal namespace
   */
  namespace: "${namespace}",

  /**
   * Task queue for this workflow
   */
  taskQueue: "${taskQueue}",

  /**
   * Trigger configuration
   */
  trigger: {
    type: "${triggerType}" as const,
    config: ${triggerConfig},
  },
};
`;
}

function getTriggerConfig(triggerType: TriggerType, workflowName: string): string {
  const kebabName = toKebabCase(workflowName);

  switch (triggerType) {
    case "webhook":
      return `{
      /**
       * HTTP path for the webhook endpoint
       */
      path: "/${kebabName}",
      
      /**
       * HTTP method
       */
      method: "POST",
      
      /**
       * Optional authentication
       */
      // auth: {
      //   type: "api-key",
      //   token: "your-secret-token",
      //   headerName: "X-API-Key",
      // },
    }`;

    case "schedule":
      return `{
      /**
       * Cron expression for scheduling
       * Examples:
       *   "0 * * * *"     - Every hour
       *   "0 0 * * *"     - Every day at midnight
       *   "0 9 * * 1-5"   - Every weekday at 9 AM
       */
      cronExpression: "0 * * * *",
      
      /**
       * Or use interval in milliseconds
       */
      // intervalMs: 3600000, // Every hour
    }`;

    case "polling":
      return `{
      /**
       * Polling interval in milliseconds
       */
      intervalMs: 60000, // Every minute
      
      /**
       * Optional endpoint to poll for data
       */
      // endpoint: "https://api.example.com/pending-items",
      
      /**
       * Optional headers for the polling request
       */
      // headers: {
      //   "Authorization": "Bearer your-token",
      // },
    }`;

    case "manual":
      return `{
      /**
       * Manual trigger has no automatic configuration
       * The workflow is started programmatically via the Temporal SDK or API
       */
    }`;
  }
}

function generateEnvExample(): string {
  return `# Environment variables for local development
# Copy this file to .env and fill in the values

# These are used when running activities locally during development
# In production, activities run in the temporal-worker

# Example external service configurations
# DATABASE_URL=postgresql://localhost:5432/mydb
# REDIS_URL=redis://localhost:6379
# API_KEY=your-api-key
`;
}

function generateGitignore(): string {
  return `# Dependencies
node_modules/

# Build output
dist/
*.js
*.d.ts
*.js.map

# Environment
.env
.env.local

# IDE
.idea/
.vscode/
*.swp
*.swo

# OS
.DS_Store
Thumbs.db

# Logs
*.log
`;
}

function generatePackageJson(workflowName: string): string {
  const kebabName = toKebabCase(workflowName);

  return JSON.stringify(
    {
      name: kebabName,
      version: "1.0.0",
      description: `${workflowName} Temporal workflow`,
      main: "workflow.ts",
      scripts: {
        build: "tsc",
        lint: "eslint . --ext .ts",
      },
      keywords: ["temporal", "workflow"],
      devDependencies: {
        "@temporalio/workflow": "^1.11.0",
        typescript: "^5.0.0",
      },
    },
    null,
    2
  );
}

function generateTsConfig(): string {
  return JSON.stringify(
    {
      compilerOptions: {
        target: "ES2020",
        module: "commonjs",
        lib: ["ES2020"],
        strict: true,
        esModuleInterop: true,
        skipLibCheck: true,
        forceConsistentCasingInFileNames: true,
        outDir: "./dist",
        rootDir: ".",
        declaration: true,
        declarationMap: true,
        sourceMap: true,
      },
      include: ["*.ts"],
      exclude: ["node_modules", "dist"],
    },
    null,
    2
  );
}

function generateReadme(workflowName: string, triggerType: TriggerType): string {
  const pascalName = toPascalCase(workflowName);
  const camelName = toCamelCase(workflowName);

  return `# ${pascalName} Workflow

A Temporal workflow with **${triggerType}** trigger.

## Structure

\`\`\`
${toKebabCase(workflowName)}/
├── activities.ts   # Activity implementations
├── workflow.ts     # Workflow definition
├── config.ts       # Deployment configuration
├── .env.example    # Environment variables template
└── README.md       # This file
\`\`\`

## Files

### activities.ts

Contains the activity implementations. Activities are the building blocks that perform actual work:
- Interact with external services
- Access databases
- Make API calls
- Process data

### workflow.ts

Contains the workflow definition. The workflow orchestrates activities and defines the business logic.

### config.ts

Contains the deployment configuration:
- Workflow name
- Namespace
- Task queue
- Trigger configuration

## Deployment

\`\`\`bash
# Deploy the workflow
workflow-cli deploy ./${toKebabCase(workflowName)}

# Check deployment status
workflow-cli info ${camelName}Workflow
\`\`\`

## Trigger: ${triggerType}

${getTriggerReadme(triggerType)}

## Development

1. Modify \`activities.ts\` to add your business logic
2. Update \`workflow.ts\` to orchestrate your activities
3. Configure triggers in \`config.ts\`
4. Deploy with \`workflow-cli deploy\`
`;
}

function getTriggerReadme(triggerType: TriggerType): string {
  switch (triggerType) {
    case "webhook":
      return `This workflow is triggered via HTTP webhook.

\`\`\`bash
# Example: Trigger the workflow
curl -X POST http://your-worker/webhook/your-path \\
  -H "Content-Type: application/json" \\
  -d '{"key": "value"}'
\`\`\``;

    case "schedule":
      return `This workflow runs on a schedule (cron expression or interval).

The schedule is configured in \`config.ts\`:
\`\`\`typescript
cronExpression: "0 * * * *"  // Every hour
\`\`\``;

    case "polling":
      return `This workflow polls for data at regular intervals.

Configure the polling interval in \`config.ts\`:
\`\`\`typescript
intervalMs: 60000  // Every minute
\`\`\``;

    case "manual":
      return `This workflow is triggered manually via the Temporal SDK or API.

\`\`\`typescript
// Start the workflow programmatically
await client.workflow.start(myWorkflow, {
  taskQueue: "your-task-queue",
  workflowId: "unique-id",
  args: [{ data: {} }],
});
\`\`\``;
  }
}

export async function init(options: InitOptions): Promise<void> {
  const { type, name, namespace = "default", taskQueue } = options;
  const kebabName = toKebabCase(name);
  const finalTaskQueue = taskQueue || `${kebabName}-queue`;
  const workflowDir = path.resolve(process.cwd(), kebabName);

  // Check if directory already exists
  if (fs.existsSync(workflowDir)) {
    console.error(chalk.red(`\nError: Directory '${kebabName}' already exists.\n`));
    process.exit(1);
  }

  console.log(chalk.bold(`\nCreating workflow: ${chalk.cyan(name)}`));
  console.log(chalk.gray(`Type: ${type}`));
  console.log(chalk.gray(`Directory: ${workflowDir}\n`));

  // Create directory
  fs.mkdirSync(workflowDir, { recursive: true });

  // Generate files
  const files = [
    { name: "activities.ts", content: generateActivities(name) },
    { name: "workflow.ts", content: generateWorkflow(name, type) },
    { name: "config.ts", content: generateConfig(name, type, namespace, finalTaskQueue) },
    { name: ".env.example", content: generateEnvExample() },
    { name: ".gitignore", content: generateGitignore() },
    { name: "package.json", content: generatePackageJson(name) },
    { name: "tsconfig.json", content: generateTsConfig() },
    { name: "README.md", content: generateReadme(name, type) },
  ];

  for (const file of files) {
    const filePath = path.join(workflowDir, file.name);
    fs.writeFileSync(filePath, file.content);
    console.log(chalk.green(`  ✔ Created ${file.name}`));
  }

  console.log(chalk.bold.green(`\n✔ Workflow created successfully!\n`));

  console.log(chalk.bold("Next steps:"));
  console.log(chalk.gray(`  1. cd ${kebabName}`));
  console.log(chalk.gray("  2. Edit activities.ts to add your business logic"));
  console.log(chalk.gray("  3. Edit workflow.ts to orchestrate your activities"));
  console.log(chalk.gray("  4. Configure trigger in config.ts"));
  console.log(chalk.gray(`  5. workflow-cli deploy ./${kebabName}\n`));
}

