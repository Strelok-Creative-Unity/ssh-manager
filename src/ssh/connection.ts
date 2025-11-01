import { Client } from 'ssh2';
import { Server } from '../types';
import { ConfigManager } from '../utils/config';

export interface SSHConnectionOptions {
    timeout?: number;
    onReady?: () => void;
    onError?: (error: Error) => void;
    onClose?: () => void;
}

export class SSHConnection {
    private sshClient: Client;
    private isConnected: boolean = false;
    private options: SSHConnectionOptions;

    constructor(private server: Server, private password: string, options: SSHConnectionOptions = {}) {
        this.sshClient = new Client();
        this.options = {
            timeout: 10000,
            ...options,
        };
    }

    async connect(): Promise<void> {
        return new Promise((resolve, reject) => {
            const normalizedServer = ConfigManager.normalizeServer(this.server, this.password);
            let resolved = false;

            const timeout = setTimeout(() => {
                if (!resolved) {
                    resolved = true;
                    this.sshClient.end();
                    reject(new Error('SSH connection timeout'));
                }
            }, this.options.timeout);

            this.sshClient.on('ready', () => {
                if (!resolved) {
                    resolved = true;
                    this.isConnected = true;
                    clearTimeout(timeout);
                    this.options.onReady?.();
                    resolve();
                }
            });

            this.sshClient.on('error', (error) => {
                if (!resolved) {
                    resolved = true;
                    clearTimeout(timeout);
                    this.options.onError?.(error);
                    reject(error);
                }
            });

            this.sshClient.on('close', () => {
                this.isConnected = false;
                this.options.onClose?.();
            });

            this.sshClient.connect(normalizedServer);
        });
    }

    disconnect(): void {
        if (this.isConnected) {
            this.sshClient.end();
        }
    }

    createShell(): Promise<any> {
        return new Promise((resolve, reject) => {
            if (!this.isConnected) {
                reject(new Error('SSH client is not connected'));
                return;
            }

            this.sshClient.shell(
                {
                    term: process.env.TERM || 'xterm-256color',
                    cols: process.stdout.columns,
                    rows: process.stdout.rows,
                },
                (err, stream) => {
                    if (err) {
                        reject(err);
                        return;
                    }
                    resolve(stream);
                },
            );
        });
    }

    /**
     * Создает туннель (проброс порта)
     */
    createTunnel(localPort: number, remoteHost: string, remotePort: number): Promise<any> {
        return new Promise((resolve, reject) => {
            if (!this.isConnected) {
                reject(new Error('SSH client is not connected'));
                return;
            }

            this.sshClient.forwardOut('127.0.0.1', localPort, remoteHost, remotePort, (err, stream) => {
                if (err) {
                    reject(err);
                    return;
                }
                resolve(stream);
            });
        });
    }

    get connected(): boolean {
        return this.isConnected;
    }

    get client(): Client {
        return this.sshClient;
    }
}
