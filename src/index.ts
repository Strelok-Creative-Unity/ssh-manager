#!/usr/bin/env node
import { spawn } from 'child_process';
import net from 'net';
import { AsyncSocket } from 'asyncsocket';
import { AsyncSocketNetClient } from './dataengine';
import { MenuManager } from './ui/menu';
import { SSHConnection } from './ssh/connection';
import { ConfigManager } from './utils/config';

const PORT = 31337; //!!! Вынести в конфиг и env
const inPkg = !!(process as any).pkg;

declare global {
    var socket: AsyncSocket;
    var password: string;
}

export class SSHManagerApp {
    private menuManager: MenuManager;

    constructor() {
        this.menuManager = new MenuManager();
        this.setupErrorHandling();
    }

    // !!!: не всегда работает выход, починить -Ka
    private setupErrorHandling(): void {
        process.on('uncaughtException', (err) => {
            console.error('Uncaught exception:', err);
            process.exit(1);
        });

        process.on('unhandledRejection', (reason, promise) => {
            console.error('Unhandled Rejection at:', promise, 'reason:', reason);
            process.exit(1);
        });
    }

    private startDaemon(): void {
        const args: [string, string[]] = inPkg ? [process.execPath, [require.resolve('./daemon/index')]] : ['ts-node', [process.argv[1], 'daemon']];

        const child = spawn(...args, {
            detached: true,
            stdio: ['pipe', 'ignore', 'ignore'],
        });

        child.stdin.write(global.password + '\n');
        child.stdin.end();
        child.unref();
    }

    private async connectToDaemon(): Promise<void> {
        console.log('Подключаюсь к демону...');

        const socket = net.createConnection(PORT, '127.0.0.1');

        socket.on('error', () => {
            console.log('Демона нет, запускаю...');
            this.startDaemon();
            setTimeout(() => this.connectToDaemon(), 2000);
        });

        try {
            global.socket = await AsyncSocketNetClient(socket);
            console.log('Подключился к демону');
            await this.showMainMenu();
        } catch (error) {
            console.log('Демона нет, запускаю...');
            this.startDaemon();
            setTimeout(() => this.connectToDaemon(), 2000);
        }
    }

    private async showMainMenu(): Promise<void> {
        try {
            const choice = await this.menuManager.showMainMenu();
            await this.handleMainMenuChoice(choice);
        } catch (error) {
            console.error('Error in main menu:', error);
            await this.showMainMenu();
        }
    }

    private async handleMainMenuChoice(choice: string): Promise<void> {
        switch (choice) {
            case 'exit':
                process.exit(0);
                break;

            case 'add':
                await this.handleAddConnection();
                break;

            case 'delete':
                await this.handleDeleteConnection();
                break;

            case 'tunnels':
                await this.handleTunnelsMenu();
                break;

            default:
                if (choice.startsWith('ssh:')) {
                    const serverName = choice.split(':')[1];
                    await this.handleSSHConnection(serverName);
                } else {
                    console.log('Неизвестный выбор:', choice);
                    await this.showMainMenu();
                }
        }
    }

    private async handleAddConnection(): Promise<void> {
        try {
            await this.menuManager.showAddConnectionMenu();
        } catch (error) {
            console.error('Error adding connection:', error);
        }
        await this.showMainMenu();
    }

    private async handleDeleteConnection(): Promise<void> {
        try {
            const deletedServerName = await this.menuManager.showDeleteConnectionMenu();
            if (deletedServerName) {
                await this.stopAllTunnelsForServer(deletedServerName);
            }
        } catch (error) {
            console.error('Error deleting connection:', error);
        }
        await this.showMainMenu();
    }

    private async handleTunnelsMenu(): Promise<void> {
        try {
            const serverName = await this.menuManager.showTunnelServerMenu();
            if (serverName) {
                await this.handleTunnelManagement(serverName);
            }
        } catch (error) {
            console.error('Error in tunnels menu:', error);
        }
        await this.showMainMenu();
    }

    private async handleTunnelManagement(serverName: string): Promise<void> {
        try {
            console.log('Загрузка активных туннелей...');
            const activeTunnels = await this.listTunnels(serverName);

            const action = await this.menuManager.showTunnelManagementMenu(serverName, activeTunnels);

            if (action === 'back') {
                return;
            }

            if (action === 'add') {
                await this.handleAddTunnel(serverName);
            } else if (action === 'delete') {
                await this.handleDeleteTunnel(serverName);
            } else if (action.startsWith('tunnel:')) {
                await this.handleToggleTunnel(serverName, action);
            }

            await this.handleTunnelManagement(serverName);
        } catch (error) {
            console.error('Error in tunnel management:', error);
        }
    }

    private async handleAddTunnel(serverName: string): Promise<void> {
        try {
            const tunnel = await this.menuManager.showAddTunnelMenu();
            if (tunnel) {
                const server = ConfigManager.getServer(serverName);
                if (server) {
                    if (!server.tunnels) {
                        server.tunnels = [];
                    }
                    server.tunnels.push(tunnel);
                    ConfigManager.saveConfig();
                    console.log('Туннель добавлен.');
                }
            }
        } catch (error) {
            console.error('Error adding tunnel:', error);
        }
    }

    private async handleDeleteTunnel(serverName: string): Promise<void> {
        try {
            const tunnelIndex = await this.menuManager.showDeleteTunnelMenu(serverName);
            if (tunnelIndex !== null) {
                const server = ConfigManager.getServer(serverName);
                if (server && server.tunnels) {
                    const tunnel = server.tunnels[tunnelIndex];

                    await this.stopTunnel(serverName, tunnel);

                    server.tunnels.splice(tunnelIndex, 1);
                    ConfigManager.saveConfig();
                    console.log('Туннель удален.');
                }
            }
        } catch (error) {
            console.error('Error deleting tunnel:', error);
        }
    }

    private async handleToggleTunnel(serverName: string, action: string): Promise<void> {
        try {
            const tunnelIndex = parseInt(action.split(':')[1]);
            const server = ConfigManager.getServer(serverName);

            if (server && server.tunnels) {
                const tunnel = server.tunnels[tunnelIndex];
                const activeTunnels = await this.listTunnels(serverName);

                const isActive = activeTunnels.some((at) => at.srcPort === tunnel.srcPort && at.dstHost === tunnel.dstHost && at.dstPort === tunnel.dstPort);

                if (isActive) {
                    await this.stopTunnel(serverName, tunnel);
                } else {
                    await this.startTunnel(serverName, tunnel);
                }
            }
        } catch (error) {
            console.error('Error toggling tunnel:', error);
        }
    }

    private async handleSSHConnection(serverName: string): Promise<void> {
        try {
            const server = ConfigManager.getServer(serverName);
            if (!server) {
                console.log(`Сервер ${serverName} не найден`);
                await this.showMainMenu();
                return;
            }

            const connection = new SSHConnection(server, global.password);
            await connection.connect();

            const stream = await connection.createShell();

            process.stdin.setRawMode(true);
            process.stdin.resume();
            process.stdin.pipe(stream);
            stream.pipe(process.stdout);

            process.stdout.on('resize', () => {
                stream.setWindow(process.stdout.rows, process.stdout.columns, 0, 0);
            });

            stream.on('close', () => {
                connection.disconnect();
                console.clear();
                this.showMainMenu();
            });

            process.on('SIGINT', () => {
                connection.disconnect();
                console.clear();
                this.showMainMenu();
            });

            process.stdin.on('data', (data: Buffer) => {
                if (data.length === 1 && data[0] === 0x04) {
                    connection.disconnect();
                    console.clear();
                    this.showMainMenu();
                }
            });
        } catch (error) {
            console.error('Error connecting to SSH:', error);
            await this.showMainMenu();
        }
    }

    private async startTunnel(serverName: string, tunnel: any): Promise<void> {
        await global.socket.send({
            action: 'startTunnel',
            servername: serverName,
            tunnel: tunnel,
        });
    }

    private async stopTunnel(serverName: string, tunnel: any): Promise<void> {
        await global.socket.send({
            action: 'stopTunnel',
            servername: serverName,
            tunnel: tunnel,
        });
    }

    private async listTunnels(serverName: string): Promise<any[]> {
        const response = await global.socket.send({
            action: 'listTunnels',
            servername: serverName,
        });
        return (response.data as any).tunnels || [];
    }

    private async stopAllTunnelsForServer(serverName: string): Promise<void> {
        const server = ConfigManager.getServer(serverName);
        if (server?.tunnels) {
            for (const tunnel of server.tunnels) {
                await this.stopTunnel(serverName, tunnel);
            }
        }
    }

    async run(): Promise<void> {
        try {
            global.password = await this.menuManager.showPasswordSetupMenu();
            this.menuManager.setPassword(global.password);

            await this.connectToDaemon();
        } catch (error) {
            console.error('Error starting application:', error);
            process.exit(1);
        }
    }
}

// Общий точкой входа
if (process.argv.includes('daemon')) {
    require('./daemon/index');
} else {
    const app = new SSHManagerApp();
    app.run();
}
