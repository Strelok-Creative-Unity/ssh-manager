import { select, input, confirm, password } from '@inquirer/prompts';
import { Server, Tunnel } from '../types';
import { ConfigManager } from '../utils/config';
import { CryptoManager } from '../utils/crypto';
import { testSSHConnection } from '../ssh/connection';
import { ServerValidator, TunnelValidator, PasswordValidator } from '../utils/validation';
import { logger } from '../utils/logger';
import { ValidationError } from '../exceptions/validation';
import { Language } from '../localization/types/data-types';

export class MenuManager {
    private password: string = '';
    console: Console;

    /**
     * Устанавливает пароль для текущей сессии
     */
    setPassword(password: string): void {
        this.password = password;
    }

    constructor() {
        this.console = console;
    }

    /**
     * Главное меню
     */
    async showMainMenu(): Promise<string> {
        this.console.clear();
        global.currentPlace = 'main';
        const config = ConfigManager.getConfig();
        const serverNames = Object.keys(config.servers);

        const choices = [
            ...serverNames.map((name) => ({
                name: `${global.localization.get('menu.connectTo')} ${name}`,
                value: `ssh:${name}`,
            })),
            { name: global.localization.get('menu.addConnection'), value: 'add' },
            { name: global.localization.get('menu.deleteConnection'), value: 'delete' },
            { name: global.localization.get('menu.manageTunnels'), value: 'tunnels' },
            { name: global.localization.get('menu.changeLanguage'), value: 'language' },
            { name: global.localization.get('menu.exit'), value: 'exit' },
        ];

        return await select({
            message: global.localization.get('menu.selectAction'),
            pageSize: process.stdout.rows - 3, // 3 - это высота меню, не убирать
            choices,
        });
    }

    private async handleValidationError(error: Error): Promise<void> {
        global.currentPlace = 'exception';
        if (error instanceof ValidationError) {
            this.console.error(global.localization.getGeneric('error.validation', { message: error.message }));
            logger.error('Validation error in menu', error);
        } else if (error.name === 'ExitPromptError') {
            this.console.log('\n' + global.localization.get('error.cancelled'));
            logger.info('User cancelled operation with Ctrl+C');
            return; // Не показываем confirm для ExitPromptError
        } else {
            const errorMessage = error instanceof Error ? error.message : global.localization.get('error.unknownError');
            this.console.error(global.localization.getGeneric('error.unknown', { message: errorMessage }));
            logger.error('Error in menu', error as Error);
        }

        await confirm({
            message: global.localization.get('continue.pressEnterShort'),
            default: true,
        });
    }

    /**
     * Меню добавления подключения
     */
    async showAddConnectionMenu(): Promise<Server | null> {
        this.console.clear();
        global.currentPlace = 'addConnection';
        const name = await input({ message: global.localization.get('add.connectionName') });
        ServerValidator.validateServerName(name);

        const host = await input({ message: global.localization.get('add.host') });
        ServerValidator.validateHost(host);

        const username = await input({ message: global.localization.get('add.user') });
        ServerValidator.validateUsername(username);

        const portInput = await input({
            message: global.localization.get('add.port'),
            default: '22',
        });
        const port = parseInt(portInput) || 22;
        ServerValidator.validatePort(port);

        const usePassword = await confirm({
            message: global.localization.get('add.usePassword'),
            default: true,
        });

        let server: Server;

        if (usePassword) {
            const pwd = await password({ message: global.localization.get('add.password') });
            server = { host, username, password: pwd, port };
        } else {
            const keyPath = await input({
                message: global.localization.get('add.keyPath'),
                default: '~/.ssh/id_rsa',
            });
            server = { host, username, privateKey: keyPath, port };
        }

        // Тестируем подключение
        this.console.log(global.localization.get('add.testingConnection'));
        const connectionTest = await testSSHConnection(server, this.password);

        if (connectionTest) {
            this.console.log(global.localization.get('add.connectionSuccess'));
        } else {
            this.console.log(global.localization.get('add.connectionFailed'));
            const saveAnyway = await confirm({
                message: global.localization.get('add.saveAnyway'),
                default: false,
            });

            if (!saveAnyway) {
                return null;
            }
        }

        // Шифруем пароль если нужно
        if (server.password && typeof server.password === 'string') {
            const saveHashedPassword = await confirm({
                message: global.localization.get('add.encryptPassword'),
                default: true,
            });

            if (saveHashedPassword) {
                const salt = CryptoManager.generateSalt();
                const hash = CryptoManager.encrypt(server.password, this.password, salt);
                server.password = { hash, salt };
            }
        }

        server.tunnels = [];
        ConfigManager.addServer(name, server);
        this.console.log(global.localization.get('add.serverAdded'));

        return server;
    }

    /**
     * Меню удаления подключения
     */
    async showDeleteConnectionMenu(): Promise<string | null> {
        this.console.clear();
        global.currentPlace = 'deleteConnection';
        const serverNames = ConfigManager.getServerNames();
        if (serverNames.length === 0) {
            this.console.log(global.localization.get('delete.noConnections'));
            return null;
        }

        const choices = [
            ...serverNames.map((name) => ({
                name: `${name} (${ConfigManager.getServer(name)?.host})`,
                value: name,
            })),
            { name: global.localization.get('menu.back'), value: 'back' },
        ];

        const serverName = await select({
            message: global.localization.get('delete.selectConnection'),
            choices,
        });

        if (serverName === 'back') {
            return null;
        }

        const confirmed = await confirm({
            message: global.localization.getGeneric('delete.confirm', { name: serverName }),
            default: false,
        });

        if (confirmed) {
            ConfigManager.removeServer(serverName);
            this.console.log(global.localization.getGeneric('delete.connectionDeleted', { name: serverName }));
            return serverName;
        }

        return null;
    }

    /**
     * Меню выбора сервера для туннелей
     */
    async showTunnelServerMenu(): Promise<string | null> {
        this.console.clear();
        global.currentPlace = 'tunnelServerMenu';
        const serverNames = ConfigManager.getServerNames();
        if (serverNames.length === 0) {
            this.console.log(global.localization.get('tunnels.noServers'));
            return null;
        }

        const choices = [
            ...serverNames.map((name) => ({
                name,
                value: name,
            })),
            { name: global.localization.get('menu.back'), value: 'back' },
        ];

        const serverName = await select({
            message: global.localization.get('tunnels.selectServer'),
            choices,
        });

        return serverName === 'back' ? null : serverName;
    }

    /**
     * Меню управления туннелями
     */
    async showTunnelManagementMenu(serverName: string, activeTunnels: Tunnel[]): Promise<string> {
        this.console.clear();
        global.currentPlace = 'tunnelManagement:' + serverName;
        const server = ConfigManager.getServer(serverName);
        if (!server) {
            throw new Error(global.localization.getGeneric('error.serverNotExist', { name: serverName }));
        }

        const tunnelChoices = (server.tunnels || []).map((t, index) => {
            const isActive = activeTunnels.some((at) => at.srcPort === t.srcPort && at.dstHost === t.dstHost && at.dstPort === t.dstPort);

            const status = isActive ? ` ${global.localization.get('tunnels.stop')}` : ` ${global.localization.get('tunnels.start')}`;

            return {
                name: `${t.srcPort} -> ${t.dstHost}:${t.dstPort}${status}`,
                value: `tunnel:${index}`,
            };
        });

        const choices = [
            ...tunnelChoices,
            { name: global.localization.get('tunnels.add'), value: 'add' },
            { name: global.localization.get('tunnels.delete'), value: 'delete' },
            { name: global.localization.get('menu.back'), value: 'back' },
        ];

        return await select({
            message: global.localization.get('tunnels.action'),
            choices,
        });
    }

    /**
     * Меню добавления туннеля
     */
    async showAddTunnelMenu(serverName: string): Promise<Tunnel | null> {
        this.console.clear();
        global.currentPlace = 'tunnelAdd:' + serverName;
        const dstHost = await input({
            message: global.localization.get('tunnel.destinationHost'),
            default: '127.0.0.1',
        });
        ServerValidator.validateHost(dstHost);

        const dstPortInput = await input({ message: global.localization.get('tunnel.destinationPort') });
        const dstPort = parseInt(dstPortInput);
        ServerValidator.validatePort(dstPort);

        const srcPortInput = await input({ message: global.localization.get('tunnel.localPort') });
        const srcPort = parseInt(srcPortInput);
        ServerValidator.validatePort(srcPort);

        const tunnel = { srcPort: srcPortInput, dstHost, dstPort: dstPortInput };
        TunnelValidator.validate(tunnel);

        TunnelValidator.validateUnique(serverName, tunnel);

        return tunnel;
    }

    /**
     * Меню удаления туннеля
     */
    async showDeleteTunnelMenu(serverName: string): Promise<number | null> {
        this.console.clear();
        global.currentPlace = 'tunnelDelete:' + serverName;
        const server = ConfigManager.getServer(serverName);
        if (!server || !server.tunnels || server.tunnels.length === 0) {
            this.console.log(global.localization.get('tunnels.noTunnels'));
            return null;
        }

        const choices = [
            ...server.tunnels.map((t, index) => ({
                name: `${t.srcPort} -> ${t.dstHost}:${t.dstPort}`,
                value: index.toString(),
            })),
            { name: global.localization.get('menu.back'), value: 'back' },
        ];

        const tunnelToDelete = await select({
            message: global.localization.get('tunnels.deleteSelect'),
            choices,
        });

        if (tunnelToDelete === 'back') {
            return null;
        }

        const tunnelIndex = parseInt(tunnelToDelete);
        const tunnel = server.tunnels![tunnelIndex];

        const confirmed = await confirm({
            message: global.localization.getGeneric('tunnels.deleteConfirm', { src: tunnel.srcPort, dst: tunnel.dstHost, port: tunnel.dstPort }),
            default: false,
        });

        return confirmed ? tunnelIndex : null;
    }

    /**
     * Меню выбора языка
     */
    async showLanguageSelectionMenu(): Promise<string | null> {
        this.console.clear();
        global.currentPlace = 'languageSelection';
        const availableLanguages = global.localization.getAvailableLanguages();
        const currentLanguage = global.localization.getLanguage();

        const choices = [
            ...availableLanguages.map((lang) => ({
                name: `${lang.name}${currentLanguage === lang.value ? ' ✓' : ''}`,
                value: lang.value,
            })),
            { name: global.localization.get('menu.back'), value: 'back' },
        ];

        const selectedLanguage = (await select({
            message: global.localization.get('language.select'),
            choices,
        })) as Language | 'back';

        if (selectedLanguage === 'back') {
            return null;
        }

        global.localization.setLanguage(selectedLanguage);
        ConfigManager.setLanguage(selectedLanguage);

        const languageName = availableLanguages.find((lang) => lang.value === selectedLanguage)?.name;
        this.console.log(global.localization.getGeneric('language.changed', { language: languageName || selectedLanguage }));

        return selectedLanguage;
    }

    /**
     * Меню установки пароля
     */
    async showPasswordSetupMenu(): Promise<string> {
        this.console.clear();
        global.currentPlace = 'passwordSetup';
        const hashPassword = ConfigManager.getPasswordHash();

        if (hashPassword === '') {
            const newPassword = await password({
                message: global.localization.get('password.newPassword'),
            });
            PasswordValidator.validate(newPassword);

            const confirmPassword = await password({
                message: global.localization.get('password.confirmPassword'),
            });

            if (newPassword !== confirmPassword) {
                throw new Error(global.localization.get('password.notMatch'));
            }

            ConfigManager.setPasswordHash(CryptoManager.createPasswordHash(newPassword));
            this.console.log(global.localization.get('password.set'));
            logger.info('New password set');
            return newPassword;
        } else {
            const enteredPassword = await password({
                message: global.localization.get('password.enterPassword'),
            });

            if (!ConfigManager.checkPassword(enteredPassword)) {
                throw new Error(global.localization.get('password.wrongPassword'));
            }

            this.console.log(global.localization.get('password.set'));
            logger.info('Password verified');
            return enteredPassword;
        }
    }
}
