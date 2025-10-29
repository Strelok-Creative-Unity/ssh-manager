import { AsyncSocket } from 'asyncsocket';
import { AsyncSocketNetServer, NetIncomingDataStore, NetServerEngine } from '../dataengine';
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
    private server: any;
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
        const serverEngine = this.server.engine as NetServerEngine;

        this.server.on('connection', (socket: AsyncSocket) => {
            socket.on('message', async (message: NetIncomingDataStore) => {
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
    private async handleMessage(message: NetIncomingDataStore): Promise<void> {
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
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            });
        }
    }

    /**
     * Обрабатывает: "запуск туннеля"
     */
    private async handleStartTunnel(data: DaemonMessage, message: NetIncomingDataStore): Promise<void> {
        if (!data.servername || !data.tunnel) {
            message.sendNoReply({
                success: false,
                error: 'Missing servername or tunnel data',
            });
            return;
        }

        const server = ConfigManager.getServer(data.servername);
        if (!server) {
            message.sendNoReply({
                success: false,
                error: `Server ${data.servername} not found`,
            });
            return;
        }

        try {
            await this.tunnelManager.startTunnel(data.servername, server, this.password, data.tunnel);
            message.sendNoReply({ success: true });
        } catch (error) {
            message.sendNoReply({
                success: false,
                error: error instanceof Error ? error.message : 'Failed to start tunnel',
            });
        }
    }

    /**
     * Обрабатывает: "остановка туннеля"
     */
    private async handleStopTunnel(data: DaemonMessage, message: NetIncomingDataStore): Promise<void> {
        if (!data.servername || !data.tunnel) {
            message.sendNoReply({
                success: false,
                error: 'Missing servername or tunnel data',
            });
            return;
        }

        try {
            this.tunnelManager.stopTunnel(data.servername, data.tunnel);
            message.sendNoReply({ success: true });
        } catch (error) {
            message.sendNoReply({
                success: false,
                error: error instanceof Error ? error.message : 'Failed to stop tunnel',
            });
        }
    }

    /**
     * Обрабатывает запрос: "список туннелей"
     */
    private async handleListTunnels(data: DaemonMessage, message: NetIncomingDataStore): Promise<void> {
        if (!data.servername) {
            message.sendNoReply({
                success: false,
                error: 'Missing servername',
            });
            return;
        }

        try {
            const tunnels = this.tunnelManager.getActiveTunnels(data.servername);
            message.sendNoReply({
                success: true,
                tunnels: tunnels as any,
            });
        } catch (error) {
            message.sendNoReply({
                success: false,
                error: error instanceof Error ? error.message : 'Failed to list tunnels',
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
