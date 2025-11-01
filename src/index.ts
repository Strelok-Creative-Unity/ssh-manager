#!/usr/bin/env node
import { spawn } from 'child_process';
import net from 'net';
import { AsyncSocket } from 'asyncsocket';
import { AsyncSocketNetClient } from './dataengine';
import { MenuManager } from './ui/menu';
import { SSHConnection, testSSHConnection } from './ssh';
import { ConfigManager } from './utils/config';
import { ValidationError } from './exceptions/validation';
import { Localization } from './localization';
import { type Language } from './localization/types/data-types';
import { type Server, type Tunnel } from './types';
import { CryptoManager } from './utils/crypto';

const PORT = 31337; //!!! Вынести в конфиг и env
const inPkg = !!(process as any).pkg;

declare global {
    var socket: AsyncSocket;
    var password: string;
    var currentPlace: string;
    var localization: Localization;
}

const localization = new Localization();
localization.loadFromData(require('./localization/data/localization.json'));

// Загружаем сохраненный язык из конфига
const savedLanguage = ConfigManager.getLanguage();
if (savedLanguage) {
    localization.setLanguage(savedLanguage as Language);
}

global.localization = localization;

// console.clear = () => {};

export class SSHManagerApp {
    private menuManager: MenuManager;
    console: Console;
    constructor() {
        this.menuManager = new MenuManager();
        this.setupErrorHandling();
        this.setupKeyboardHandling();
        this.console = console;
    }

    // !!!: не всегда работает выход, починить -Ka
    private setupErrorHandling(): void {
        process.on('uncaughtException', (err) => {
            if (err instanceof ValidationError) {
                // Handle ValidationError gracefully
                this.handleValidationError(err);
            } else {
                console.error('Uncaught exception:', err);
                process.exit(1);
            }
        });

        process.on('unhandledRejection', (reason, promise) => {
            // Handle inquirer ExitPromptError gracefully
            if (reason && typeof reason === 'object' && 'name' in reason && reason.name === 'ExitPromptError') {
                this.exitHandler();
            } else if (reason instanceof ValidationError) {
                // Handle ValidationError gracefully
                this.handleValidationError(reason);
            } else {
                console.error('Unhandled Rejection', reason);
                process.exit(1);
            }
        });
    }

    private setupKeyboardHandling(): void {
        process.stdin.on('data', (data: Buffer) => {
            if (data.length === 1 && data[0] === 0x04) {
                // CTRL+D
                console.log('\n' + global.localization.get('exit.appExit'));
                process.exit(0);
            }
        });
    }

    private async handleValidationError(error: ValidationError): Promise<void> {
        console.error(global.localization.getGeneric('error.validation', { message: error.message }));
        console.log(global.localization.get('continue.pressEnter'));

        await this.menuManager.askContinueAfterError();

        this.exitHandler();
    }

    private exitHandler(): void {
        // console.log(global.currentPlace);

        // Если мы находимся в SSH-сессии, не отключаемся от неё
        if (global.currentPlace === 'ssh') {
            return;
        }

        const [prefix, serverName] = global.currentPlace.includes(':') ? global.currentPlace.split(':', 2) : [global.currentPlace, null];

        switch (prefix) {
            case 'main':
                process.exit(1);
                break;

            case 'tunnelManagement':
                return void this.handleTunnelsMenu();

            case 'tunnelAdd':
            case 'tunnelDelete':
                return void this.handleTunnelManagement(serverName!);

            case 'languageSelection':
                return void this.showMainMenu();

            default:
                console.log(global.localization.get('continue.returning'));
                global.currentPlace = 'main';
                this.showMainMenu();
        }
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
        console.log(global.localization.get('daemon.connecting'));

        const socket = net.createConnection(PORT, '127.0.0.1');

        socket.once('error', (error) => {
            console.log(global.localization.get('daemon.notFound'));

            console.error(error);
            this.startDaemon();
            setTimeout(() => this.connectToDaemon(), 2000);
        });

        try {
            global.socket = await AsyncSocketNetClient(socket);
            console.log(global.localization.get('daemon.connected'));
            this.showMainMenu();
        } catch (error) {
            console.log(global.localization.get('daemon.notFound'));
            this.startDaemon();
            setTimeout(() => this.connectToDaemon(), 2000);
        }
    }

    private async showMainMenu(): Promise<void> {
        const choice = await this.menuManager.showMainMenu();
        await this.handleMainMenuChoice(choice);
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

            case 'language':
                await this.handleLanguageChange();
                break;

            default:
                if (choice.startsWith('ssh:')) {
                    const serverName = choice.split(':')[1];
                    await this.handleSSHConnection(serverName);
                } else {
                    console.log(global.localization.getGeneric('error.unknownChoice', { choice }));
                    await this.showMainMenu();
                }
        }
    }

    private async handleAddConnection(): Promise<void> {
        const { name, server } = await this.menuManager.showAddConnectionMenu();

        // Тестируем подключение
        console.log(global.localization.get('add.testingConnection'));
        const connectionTest = await testSSHConnection(server, global.password);

        if (connectionTest) {
            this.console.log(global.localization.get('add.connectionSuccess'));
        } else {
            this.console.log(global.localization.get('add.connectionFailed'));
            const saveAnyway = await this.menuManager.askSaveConnectionAnyway();

            if (!saveAnyway) {
                return void this.showMainMenu();
            }
        }

        await this.saveConnection(name, server);
        await this.showMainMenu();
    }

    private async saveConnection(name: string, server: Server): Promise<void> {
        if (server.password && typeof server.password === 'string') {
            const saveHashedPassword = await this.menuManager.askEncryptPassword();

            if (saveHashedPassword) {
                const salt = CryptoManager.generateSalt();
                const hash = CryptoManager.encrypt(server.password, global.password, salt);
                server.password = { hash, salt };
            }
        }

        server.tunnels = [];
        ConfigManager.addServer(name, server);
        this.console.log(global.localization.get('add.serverAdded'));
    }

    private async handleDeleteConnection(): Promise<void> {
        const { serverName, confirmed } = await this.menuManager.showDeleteConnectionMenu();
        if (confirmed && serverName) {
            await this.stopAllTunnelsForServer(serverName);
            ConfigManager.removeServer(serverName);
            this.console.log(global.localization.getGeneric('delete.connectionDeleted', { name: serverName }));
        }

        await this.showMainMenu();
    }

    private async handleLanguageChange(): Promise<void> {
        const selectedLanguage = await this.menuManager.showLanguageSelectionMenu();
        if (selectedLanguage) {
            global.localization.setLanguage(selectedLanguage);
            ConfigManager.setLanguage(selectedLanguage);

            const availableLanguages = global.localization.getAvailableLanguages();
            const languageName = availableLanguages.find((lang) => lang.value === selectedLanguage)?.name;
            this.console.log(global.localization.getGeneric('language.changed', { language: languageName || selectedLanguage }));
        }
        await this.showMainMenu();
    }

    private async handleTunnelsMenu(): Promise<void> {
        const serverName = await this.menuManager.showTunnelServerMenu();
        if (serverName) {
            await this.handleTunnelManagement(serverName);
        } else {
            await this.showMainMenu();
        }
    }

    private async handleTunnelManagement(serverName: string): Promise<void> {
        console.log(global.localization.get('tunnels.loading'));
        const activeTunnels = await this.listTunnels(serverName);

        const action = await this.menuManager.showTunnelManagementMenu(serverName, activeTunnels);

        switch (action) {
            case 'back':
                return await this.showMainMenu();

            case 'add':
                await this.handleAddTunnel(serverName);
                break;

            case 'delete':
                await this.handleDeleteTunnel(serverName);
                break;

            default:
                if (action.startsWith('tunnel:')) {
                    await this.handleToggleTunnel(serverName, action);
                }
                break;
        }

        await this.handleTunnelManagement(serverName);
    }

    private async handleAddTunnel(serverName: string): Promise<void> {
        const tunnel = await this.menuManager.showAddTunnelMenu(serverName);
        const server = ConfigManager.getServer(serverName);
        if (server) {
            if (!server.tunnels) {
                server.tunnels = [];
            }
            server.tunnels.push(tunnel);
            ConfigManager.saveConfig();
            console.log(global.localization.get('tunnels.tunnelAdded'));
        }
    }

    private async handleDeleteTunnel(serverName: string): Promise<void> {
        const tunnelIndex = await this.menuManager.showDeleteTunnelMenu(serverName);
        if (tunnelIndex === null) return;

        const server = ConfigManager.getServer(serverName);
        if (!server || !server.tunnels) return;

        const tunnel = server.tunnels[tunnelIndex];
        await this.stopTunnel(serverName, tunnel);
        server.tunnels.splice(tunnelIndex, 1);
        ConfigManager.saveConfig();
        console.log(global.localization.get('tunnels.tunnelDeleted'));
    }

    private async handleToggleTunnel(serverName: string, action: string): Promise<void> {
        const tunnelIndex = parseInt(action.split(':')[1]);
        const server = ConfigManager.getServer(serverName);

        if (!server || !server.tunnels) return;
        const tunnel = server.tunnels[tunnelIndex];
        const activeTunnels = await this.listTunnels(serverName);

        const isActive = activeTunnels.some((at) => at.srcPort === tunnel.srcPort && at.dstHost === tunnel.dstHost && at.dstPort === tunnel.dstPort);

        if (isActive) {
            await this.stopTunnel(serverName, tunnel);
        } else {
            await this.startTunnel(serverName, tunnel);
        }
    }

    private async handleSSHConnection(serverName: string): Promise<void> {
        try {
            const server = ConfigManager.getServer(serverName);
            if (!server) {
                console.log(global.localization.getGeneric('error.serverNotFound', { name: serverName }));
                await this.showMainMenu();
                return;
            }

            global.currentPlace = 'ssh';
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
                global.currentPlace = 'main';
                console.clear();
                this.showMainMenu();
            });

            process.stdin.on('data', (data: Buffer) => {
                if (data.length === 1 && data[0] === 0x04) {
                    connection.disconnect();
                    global.currentPlace = 'main';
                    console.clear();
                    this.showMainMenu();
                }
            });
        } catch (error: any) {
            console.error(global.localization.getGeneric('error.sshConnection', { message: error.message }));
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

    private async listTunnels(serverName: string): Promise<Tunnel[]> {
        const response = await global.socket.send<{ tunnels: Tunnel[] }>({
            action: 'listTunnels',
            servername: serverName,
        });
        return response.data?.tunnels ?? [];
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
        const passwordData = await this.menuManager.showPasswordSetupMenu();

        if (passwordData.isNewPassword) {
            ConfigManager.setPasswordHash(CryptoManager.createPasswordHash(passwordData.password));
        }
        this.console.log(global.localization.get('password.set'));

        global.password = passwordData.password;

        await this.connectToDaemon();
    }
}

// Общий точкой входа
if (process.argv.includes('daemon')) {
    require('./daemon/index');
} else {
    const app = new SSHManagerApp();
    app.run();
}
