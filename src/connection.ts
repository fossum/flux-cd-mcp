import { Client, ClientChannel } from 'ssh2';
import { KubeConfig, CoreV1Api } from '@kubernetes/client-node';
import { promisify } from 'util';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

export interface ConnectionConfig {
  mode: 'kubeconfig' | 'ssh';
  kubeconfigPath?: string;
  sshHost?: string;
  sshPort?: number;
  sshUser?: string;
  sshPassword?: string;
  sshPrivateKeyPath?: string;
}

export class ConnectionManager {
  private config: ConnectionConfig;
  private kubeConfig?: KubeConfig;
  private sshClient?: Client;

  constructor(config: ConnectionConfig) {
    this.config = config;
  }

  async initialize(): Promise<void> {
    if (this.config.mode === 'kubeconfig') {
      await this.initializeKubeconfig();
    } else if (this.config.mode === 'ssh') {
      await this.initializeSSH();
    } else {
      throw new Error(`Unknown connection mode: ${this.config.mode}`);
    }
  }

  private async initializeKubeconfig(): Promise<void> {
    this.kubeConfig = new KubeConfig();
    
    // Try to load kubeconfig from specified path or common locations
    const kubeconfigPath = this.config.kubeconfigPath || 
      process.env.KUBECONFIG ||
      path.join(os.homedir(), '.kube', 'config');

    if (fs.existsSync(kubeconfigPath)) {
      this.kubeConfig.loadFromFile(kubeconfigPath);
    } else {
      // Try loading from default config
      this.kubeConfig.loadFromDefault();
    }

    // Test connection
    const k8sApi = this.kubeConfig.makeApiClient(CoreV1Api);
    try {
      await k8sApi.listNamespace();
    } catch (error) {
      throw new Error(`Failed to connect to Kubernetes cluster: ${error}`);
    }
  }

  private async initializeSSH(): Promise<void> {
    if (!this.config.sshHost || !this.config.sshUser) {
      throw new Error('SSH mode requires sshHost and sshUser');
    }

    this.sshClient = new Client();

    const connectConfig: any = {
      host: this.config.sshHost,
      port: this.config.sshPort || 22,
      username: this.config.sshUser,
    };

    if (this.config.sshPrivateKeyPath) {
      const privateKey = await fs.promises.readFile(this.config.sshPrivateKeyPath);
      connectConfig.privateKey = privateKey;
    } else if (this.config.sshPassword) {
      connectConfig.password = this.config.sshPassword;
    } else {
      // Try default SSH key locations
      const defaultKeyPath = path.join(os.homedir(), '.ssh', 'id_rsa');
      if (fs.existsSync(defaultKeyPath)) {
        const privateKey = await fs.promises.readFile(defaultKeyPath);
        connectConfig.privateKey = privateKey;
      } else {
        throw new Error('SSH mode requires either sshPassword or sshPrivateKeyPath');
      }
    }

    return new Promise((resolve, reject) => {
      this.sshClient!.on('ready', () => {
        resolve();
      });
      this.sshClient!.on('error', (err) => {
        reject(new Error(`SSH connection failed: ${err.message}`));
      });
      this.sshClient!.connect(connectConfig);
    });
  }

  async executeFluxCommand(command: string): Promise<string> {
    if (this.config.mode === 'kubeconfig') {
      return this.executeFluxViaKubectl(command);
    } else if (this.config.mode === 'ssh') {
      return this.executeFluxViaSSH(command);
    } else {
      throw new Error(`Unknown connection mode: ${this.config.mode}`);
    }
  }

  private async executeFluxViaKubectl(command: string): Promise<string> {
    // Execute flux command using kubectl exec or direct flux CLI
    const { exec } = await import('child_process');
    const execPromise = promisify(exec);

    const kubeconfigArg = this.config.kubeconfigPath 
      ? `--kubeconfig=${this.config.kubeconfigPath}` 
      : '';

    try {
      const { stdout, stderr } = await execPromise(`flux ${command} ${kubeconfigArg}`);
      if (stderr) {
        return `${stdout}\n${stderr}`;
      }
      return stdout;
    } catch (error: any) {
      throw new Error(`Failed to execute flux command: ${error.message}`);
    }
  }

  private async executeFluxViaSSH(command: string): Promise<string> {
    if (!this.sshClient) {
      throw new Error('SSH client not initialized');
    }

    return new Promise((resolve, reject) => {
      this.sshClient!.exec(`flux ${command}`, (err, stream: ClientChannel) => {
        if (err) {
          reject(new Error(`Failed to execute command via SSH: ${err.message}`));
          return;
        }

        let stdout = '';
        let stderr = '';

        stream.on('close', (code: number) => {
          if (code !== 0) {
            reject(new Error(`Command exited with code ${code}: ${stderr}`));
          } else {
            resolve(stderr ? `${stdout}\n${stderr}` : stdout);
          }
        });

        stream.on('data', (data: Buffer) => {
          stdout += data.toString();
        });

        stream.stderr.on('data', (data: Buffer) => {
          stderr += data.toString();
        });
      });
    });
  }

  async close(): Promise<void> {
    if (this.sshClient) {
      this.sshClient.end();
    }
  }
}
