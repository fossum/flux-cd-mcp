#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { ConnectionManager, ConnectionConfig } from './connection.js';

// Configuration from environment variables
const connectionConfig: ConnectionConfig = {
  mode: (process.env.FLUX_CONNECTION_MODE as 'kubeconfig' | 'ssh') || 'kubeconfig',
  kubeconfigPath: process.env.KUBECONFIG,
  sshHost: process.env.FLUX_SSH_HOST,
  sshPort: process.env.FLUX_SSH_PORT ? parseInt(process.env.FLUX_SSH_PORT) : undefined,
  sshUser: process.env.FLUX_SSH_USER,
  sshPassword: process.env.FLUX_SSH_PASSWORD,
  sshPrivateKeyPath: process.env.FLUX_SSH_KEY_PATH,
};

let connectionManager: ConnectionManager | null = null;

// Define the tools
const tools: Tool[] = [
  {
    name: "flux_get",
    description: "Get Flux resources (kustomizations, helmreleases, gitrepositories, etc.)",
    inputSchema: {
      type: "object",
      properties: {
        resource_type: {
          type: "string",
          description: "Type of resource to get (e.g., kustomizations, helmreleases, gitrepositories, helmrepositories, ocirepositories, buckets, alerts, providers, receivers)",
          enum: [
            "kustomizations",
            "helmreleases",
            "gitrepositories",
            "helmrepositories",
            "ocirepositories",
            "buckets",
            "alerts",
            "providers",
            "receivers",
            "all"
          ]
        },
        namespace: {
          type: "string",
          description: "Namespace to query (optional, defaults to all namespaces)",
        },
        name: {
          type: "string",
          description: "Specific resource name (optional)",
        },
      },
      required: ["resource_type"],
    },
  },
  {
    name: "flux_reconcile",
    description: "Trigger reconciliation of a Flux resource",
    inputSchema: {
      type: "object",
      properties: {
        resource_type: {
          type: "string",
          description: "Type of resource to reconcile",
          enum: [
            "kustomization",
            "helmrelease",
            "gitrepository",
            "helmrepository",
            "ocirepository",
            "bucket"
          ]
        },
        name: {
          type: "string",
          description: "Name of the resource to reconcile",
        },
        namespace: {
          type: "string",
          description: "Namespace of the resource (optional)",
        },
        with_source: {
          type: "boolean",
          description: "Reconcile the source before reconciling the resource",
        },
      },
      required: ["resource_type", "name"],
    },
  },
  {
    name: "flux_suspend",
    description: "Suspend reconciliation of a Flux resource",
    inputSchema: {
      type: "object",
      properties: {
        resource_type: {
          type: "string",
          description: "Type of resource to suspend",
          enum: [
            "kustomization",
            "helmrelease",
            "gitrepository",
            "helmrepository",
            "ocirepository",
            "bucket",
            "alert",
            "receiver"
          ]
        },
        name: {
          type: "string",
          description: "Name of the resource to suspend",
        },
        namespace: {
          type: "string",
          description: "Namespace of the resource (optional)",
        },
      },
      required: ["resource_type", "name"],
    },
  },
  {
    name: "flux_resume",
    description: "Resume reconciliation of a suspended Flux resource",
    inputSchema: {
      type: "object",
      properties: {
        resource_type: {
          type: "string",
          description: "Type of resource to resume",
          enum: [
            "kustomization",
            "helmrelease",
            "gitrepository",
            "helmrepository",
            "ocirepository",
            "bucket",
            "alert",
            "receiver"
          ]
        },
        name: {
          type: "string",
          description: "Name of the resource to resume",
        },
        namespace: {
          type: "string",
          description: "Namespace of the resource (optional)",
        },
      },
      required: ["resource_type", "name"],
    },
  },
  {
    name: "flux_logs",
    description: "View logs from Flux controllers",
    inputSchema: {
      type: "object",
      properties: {
        kind: {
          type: "string",
          description: "Controller kind (source-controller, kustomize-controller, helm-controller, notification-controller, image-reflector-controller, image-automation-controller)",
        },
        follow: {
          type: "boolean",
          description: "Follow logs (not recommended for MCP usage)",
        },
        tail: {
          type: "number",
          description: "Number of lines to show from the end of the logs",
        },
      },
    },
  },
  {
    name: "flux_check",
    description: "Check Flux installation and prerequisites",
    inputSchema: {
      type: "object",
      properties: {
        pre: {
          type: "boolean",
          description: "Check prerequisites only (before installation)",
        },
      },
    },
  },
  {
    name: "flux_version",
    description: "Get Flux version information",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "flux_export",
    description: "Export Flux resources in YAML format",
    inputSchema: {
      type: "object",
      properties: {
        resource_type: {
          type: "string",
          description: "Type of resource to export",
          enum: [
            "kustomization",
            "helmrelease",
            "gitrepository",
            "helmrepository",
            "ocirepository",
            "bucket",
            "alert",
            "receiver",
            "provider"
          ]
        },
        name: {
          type: "string",
          description: "Name of the resource to export",
        },
        namespace: {
          type: "string",
          description: "Namespace of the resource (optional)",
        },
      },
      required: ["resource_type", "name"],
    },
  },
  {
    name: "flux_trace",
    description: "Trace in-cluster objects throughout the GitOps delivery pipeline",
    inputSchema: {
      type: "object",
      properties: {
        kind: {
          type: "string",
          description: "Kubernetes object kind (e.g., Deployment, Service)",
        },
        name: {
          type: "string",
          description: "Kubernetes object name",
        },
        namespace: {
          type: "string",
          description: "Kubernetes object namespace",
        },
        api_version: {
          type: "string",
          description: "Kubernetes API version (optional)",
        },
      },
      required: ["kind", "name", "namespace"],
    },
  },
];

// Initialize the server
const server = new Server(
  {
    name: "flux-cd-mcp",
    version: "0.1.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Tool handlers
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    // Initialize connection if not already done
    if (!connectionManager) {
      connectionManager = new ConnectionManager(connectionConfig);
      await connectionManager.initialize();
    }

    const { name, arguments: args } = request.params;

    switch (name) {
      case "flux_get": {
        const { resource_type, namespace, name: resourceName } = args as any;
        const cmdArgs = ['get', resource_type];
        if (namespace) {
          cmdArgs.push('-n', namespace);
        } else {
          cmdArgs.push('-A');
        }
        if (resourceName) {
          cmdArgs.push(resourceName);
        }
        const output = await connectionManager.executeFluxCommand(cmdArgs);
        return {
          content: [{ type: "text", text: output }],
        };
      }

      case "flux_reconcile": {
        const { resource_type, name: resourceName, namespace, with_source } = args as any;
        const cmdArgs = ['reconcile', resource_type, resourceName];
        if (namespace) {
          cmdArgs.push('-n', namespace);
        }
        if (with_source) {
          cmdArgs.push('--with-source');
        }
        const output = await connectionManager.executeFluxCommand(cmdArgs);
        return {
          content: [{ type: "text", text: output }],
        };
      }

      case "flux_suspend": {
        const { resource_type, name: resourceName, namespace } = args as any;
        const cmdArgs = ['suspend', resource_type, resourceName];
        if (namespace) {
          cmdArgs.push('-n', namespace);
        }
        const output = await connectionManager.executeFluxCommand(cmdArgs);
        return {
          content: [{ type: "text", text: output }],
        };
      }

      case "flux_resume": {
        const { resource_type, name: resourceName, namespace } = args as any;
        const cmdArgs = ['resume', resource_type, resourceName];
        if (namespace) {
          cmdArgs.push('-n', namespace);
        }
        const output = await connectionManager.executeFluxCommand(cmdArgs);
        return {
          content: [{ type: "text", text: output }],
        };
      }

      case "flux_logs": {
        const { kind, follow, tail } = args as any;
        const cmdArgs = ['logs'];
        if (kind) {
          cmdArgs.push(`--kind=${kind}`);
        }
        if (follow) {
          cmdArgs.push('--follow');
        }
        if (tail) {
          cmdArgs.push(`--tail=${tail}`);
        }
        const output = await connectionManager.executeFluxCommand(cmdArgs);
        return {
          content: [{ type: "text", text: output }],
        };
      }

      case "flux_check": {
        const { pre } = args as any;
        const cmdArgs = ['check'];
        if (pre) {
          cmdArgs.push('--pre');
        }
        const output = await connectionManager.executeFluxCommand(cmdArgs);
        return {
          content: [{ type: "text", text: output }],
        };
      }

      case "flux_version": {
        const output = await connectionManager.executeFluxCommand(['version']);
        return {
          content: [{ type: "text", text: output }],
        };
      }

      case "flux_export": {
        const { resource_type, name: resourceName, namespace } = args as any;
        const cmdArgs = ['export', resource_type, resourceName];
        if (namespace) {
          cmdArgs.push('-n', namespace);
        }
        const output = await connectionManager.executeFluxCommand(cmdArgs);
        return {
          content: [{ type: "text", text: output }],
        };
      }

      case "flux_trace": {
        const { kind, name: resourceName, namespace, api_version } = args as any;
        const cmdArgs = ['trace', resourceName];
        if (namespace) {
          cmdArgs.push(`--namespace=${namespace}`);
        }
        if (kind) {
          cmdArgs.push(`--kind=${kind}`);
        }
        if (api_version) {
          cmdArgs.push(`--api-version=${api_version}`);
        }
        const output = await connectionManager.executeFluxCommand(cmdArgs);
        return {
          content: [{ type: "text", text: output }],
        };
      }

      default:
        return {
          content: [{ type: "text", text: `Unknown tool: ${name}` }],
          isError: true,
        };
    }
  } catch (error: any) {
    return {
      content: [{ type: "text", text: `Error: ${error.message}` }],
      isError: true,
    };
  }
});

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  
  // Handle cleanup
  process.on('SIGINT', async () => {
    if (connectionManager) {
      await connectionManager.close();
    }
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    if (connectionManager) {
      await connectionManager.close();
    }
    process.exit(0);
  });
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
