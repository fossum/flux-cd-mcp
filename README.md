# Flux CD MCP Server

A Model Context Protocol (MCP) server that provides tools for managing Flux CD on Kubernetes clusters. This server enables AI assistants to interact with Flux CD installations through both local kubeconfig and remote SSH connections.

## Features

- 🔧 **Dual Connection Modes**: Connect via kubeconfig (local/remote) or SSH
- 📦 **Comprehensive Flux Commands**: Support for common Flux CD operations
- 🔒 **Secure**: Uses standard Kubernetes and SSH authentication methods
- 🚀 **Easy Setup**: Works with standard kubeconfig and SSH key locations

## Installation

### From npm (when published)
```bash
npm install -g flux-cd-mcp
```

### From source
```bash
git clone https://github.com/fossum/flux-cd-mcp.git
cd flux-cd-mcp
npm install
npm run build
```

## Configuration

The server supports two connection modes, configured via environment variables:

### Mode 1: Kubeconfig (Local or Remote Cluster)

This mode uses your local kubeconfig to connect to a Kubernetes cluster and execute flux commands.

**Environment Variables:**
- `FLUX_CONNECTION_MODE=kubeconfig` (default)
- `KUBECONFIG=/path/to/kubeconfig` (optional, defaults to `~/.kube/config`)

**Prerequisites:**
- Flux CLI installed locally
- Valid kubeconfig with access to your cluster
- Flux installed on the target cluster

### Mode 2: SSH Connection

This mode connects to a Kubernetes node via SSH and executes flux commands directly on the node.

**Environment Variables:**
- `FLUX_CONNECTION_MODE=ssh`
- `FLUX_SSH_HOST=hostname` (required)
- `FLUX_SSH_USER=username` (required)
- `FLUX_SSH_PORT=22` (optional, defaults to 22)
- `FLUX_SSH_PASSWORD=password` (optional)
- `FLUX_SSH_KEY_PATH=/path/to/key` (optional, defaults to `~/.ssh/id_rsa`)

**Prerequisites:**
- SSH access to a Kubernetes node
- Flux CLI installed on the target node
- Proper permissions to execute flux commands

## MCP Client Configuration

### Claude Desktop

Add to your Claude Desktop configuration file:

**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

#### Using Kubeconfig Mode:
```json
{
  "mcpServers": {
    "flux-cd": {
      "command": "flux-cd-mcp",
      "env": {
        "FLUX_CONNECTION_MODE": "kubeconfig",
        "KUBECONFIG": "/home/user/.kube/config"
      }
    }
  }
}
```

#### Using SSH Mode:
```json
{
  "mcpServers": {
    "flux-cd": {
      "command": "flux-cd-mcp",
      "env": {
        "FLUX_CONNECTION_MODE": "ssh",
        "FLUX_SSH_HOST": "k8s-node.example.com",
        "FLUX_SSH_USER": "admin",
        "FLUX_SSH_KEY_PATH": "/home/user/.ssh/id_rsa"
      }
    }
  }
}
```

### Other MCP Clients

The server communicates via stdio and can be used with any MCP-compatible client. Ensure you set the appropriate environment variables when starting the server.

## Available Tools

The server provides the following tools:

### `flux_get`
Get Flux resources (kustomizations, helmreleases, gitrepositories, etc.)

**Parameters:**
- `resource_type` (required): Type of resource (kustomizations, helmreleases, gitrepositories, etc.)
- `namespace` (optional): Specific namespace or all namespaces
- `name` (optional): Specific resource name

### `flux_reconcile`
Trigger reconciliation of a Flux resource

**Parameters:**
- `resource_type` (required): Type of resource to reconcile
- `name` (required): Name of the resource
- `namespace` (optional): Namespace of the resource
- `with_source` (optional): Reconcile the source before reconciling the resource

### `flux_suspend`
Suspend reconciliation of a Flux resource

**Parameters:**
- `resource_type` (required): Type of resource to suspend
- `name` (required): Name of the resource
- `namespace` (optional): Namespace of the resource

### `flux_resume`
Resume reconciliation of a suspended Flux resource

**Parameters:**
- `resource_type` (required): Type of resource to resume
- `name` (required): Name of the resource
- `namespace` (optional): Namespace of the resource

### `flux_logs`
View logs from Flux controllers

**Parameters:**
- `kind` (optional): Controller kind (source-controller, kustomize-controller, etc.)
- `tail` (optional): Number of lines to show from the end

### `flux_check`
Check Flux installation and prerequisites

**Parameters:**
- `pre` (optional): Check prerequisites only (before installation)

### `flux_version`
Get Flux version information

### `flux_export`
Export Flux resources in YAML format

**Parameters:**
- `resource_type` (required): Type of resource to export
- `name` (required): Name of the resource
- `namespace` (optional): Namespace of the resource

### `flux_trace`
Trace in-cluster objects throughout the GitOps delivery pipeline

**Parameters:**
- `kind` (required): Kubernetes object kind (e.g., Deployment, Service)
- `name` (required): Kubernetes object name
- `namespace` (required): Kubernetes object namespace
- `api_version` (optional): Kubernetes API version

## Example Usage

Once configured, you can ask your AI assistant questions like:

- "Show me all Flux kustomizations"
- "Reconcile the webapp helmrelease in the production namespace"
- "What's the status of my gitrepositories?"
- "Suspend the staging kustomization"
- "Export the redis helmrelease configuration"
- "Check if Flux is properly installed"
- "Show me logs from the kustomize-controller"

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Watch mode
npm run watch
```

## Security Considerations

- **SSH Mode**: Ensure SSH keys are properly secured with appropriate file permissions (600)
- **Kubeconfig Mode**: Protect your kubeconfig file as it contains cluster access credentials
- **Passwords**: Avoid using `FLUX_SSH_PASSWORD` in production; prefer SSH keys
- **Permissions**: Ensure the user/service account has appropriate RBAC permissions in the cluster

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.