import { AsyncSocket, AsyncSocketServer, IncomingDataPackage } from 'asyncsocket';
import { AsyncSocketNetServer, NetEngine, NetServerEngine } from 'ase-net';
import { ConfigManager } from '../utils/config';
import { TunnelManager } from './tunnel/manager';
import { Tunnel } from '../types';

export interface DaemonMessage {
    action: string;
    servername?: string;
    tunnel?: Tunnel;
}

export class DaemonManager {
    private tunnelManager: TunnelManager;
    private server!: AsyncSocketServer<NetServerEngine, AsyncSocket<NetEngine>>;
    private password: string = '';

    constructor() {
        this.tunnelManager = new TunnelManager();
        this.initializeServer();
    }

    /**
     * Устанавливает пароль для демона
     */
    setPassword(password: string): void {
        this.password = password;
    }

    /**
     * Инициализирует сервер
     */
    private initializeServer(): void {
        this.server = AsyncSocketNetServer();
        const serverEngine = this.server.engine;

        this.server.on('connection', (socket: AsyncSocket<NetEngine>) => {
            socket.on('message', async (message: IncomingDataPackage<any>) => {
                await this.handleMessage(message);
            });
        });

        const PORT = 31337;
        serverEngine.server.listen(PORT, '127.0.0.1', () => {
            console.log(`Daemon listening on ${PORT}`);
        });
    }

    /**
     * Общий обработчик сообщений
     */
    private async handleMessage(message: IncomingDataPackage<any>): Promise<void> {
        try {
            const data = message.data as unknown as DaemonMessage;

            switch (data.action) {
                case 'startTunnel':
                    await this.handleStartTunnel(data, message);
                    break;

                case 'stopTunnel':
                    await this.handleStopTunnel(data, message);
                    break;

                case 'listTunnels':
                    await this.handleListTunnels(data, message);
                    break;

                default:
                    message.sendNoReply({
                        success: false,
                        error: `Unknown action: ${data.action}`,
                    });
            }
        } catch (error) {
            console.error('Error handling message:', error);
            message.sendNoReply({
                data: {
                    success: false,
                    error: error instanceof Error ? error.message : 'Unknown error',
                },
            });
        }
    }

    /**
     * Обрабатывает: "запуск туннеля"
     */
    private async handleStartTunnel(data: DaemonMessage, message: IncomingDataPackage<any>): Promise<void> {
        if (!data.servername || !data.tunnel) {
            message.sendNoReply({
                data: {
                    success: false,
                    error: 'Missing servername or tunnel data',
                },
            });
            return;
        }

        const server = ConfigManager.getServer(data.servername);
        if (!server) {
            message.sendNoReply({
                data: {
                    success: false,
                    error: `Server ${data.servername} not found`,
                },
            });
            return;
        }

        try {
            await this.tunnelManager.startTunnel(data.servername, server, this.password, data.tunnel);
            message.sendNoReply({ data: { success: true } });
        } catch (error) {
            message.sendNoReply({
                data: {
                    success: false,
                    error: error instanceof Error ? error.message : 'Failed to start tunnel',
                },
            });
        }
    }

    /**
     * Обрабатывает: "остановка туннеля"
     */
    private async handleStopTunnel(data: DaemonMessage, message: IncomingDataPackage<any>): Promise<void> {
        if (!data.servername || !data.tunnel) {
            message.sendNoReply({
                data: {
                    success: false,
                    error: 'Missing servername or tunnel data',
                },
            });
            return;
        }

        try {
            this.tunnelManager.stopTunnel(data.servername, data.tunnel);
            message.sendNoReply({ data: { success: true } });
        } catch (error) {
            message.sendNoReply({
                data: {
                    success: false,
                    error: error instanceof Error ? error.message : 'Failed to stop tunnel',
                },
            });
        }
    }

    /**
     * Обрабатывает запрос: "список туннелей"
     */
    private async handleListTunnels(data: DaemonMessage, message: IncomingDataPackage<any>): Promise<void> {
        if (!data.servername) {
            message.sendNoReply({
                data: {
                    success: false,
                    error: 'Missing servername',
                },
            });
            return;
        }

        try {
            const tunnels = this.tunnelManager.getActiveTunnels(data.servername);
            message.sendNoReply({
                data: {
                    success: true,
                    tunnels: tunnels as any,
                },
            });
        } catch (error) {
            message.sendNoReply({
                data: {
                    success: false,
                    error: error instanceof Error ? error.message : 'Failed to list tunnels',
                },
            });
        }
    }

    stop(): void {
        this.tunnelManager.stopAllTunnels();
        if (this.server && this.server.engine) {
            this.server.engine.server.close();
        }
    }
}

function runDaemon(): void {
    const daemon = new DaemonManager();

    process.stdin.setEncoding('utf8');
    process.stdin.once('data', (password) => {
        daemon.setPassword(password.toString().trim());
    });

    process.on('SIGINT', () => {
        console.log('Shutting down daemon...');
        daemon.stop();
        process.exit(0);
    });

    process.on('SIGTERM', () => {
        console.log('Shutting down daemon...');
        daemon.stop();
        process.exit(0);
    });
}

runDaemon();
