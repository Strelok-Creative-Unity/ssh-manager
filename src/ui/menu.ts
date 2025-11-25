import { select, input, confirm, password } from '@inquirer/prompts';
import { type Server, type Tunnel } from '../types';
import { ConfigManager } from '../utils/config';
import { ServerValidator, TunnelValidator, PasswordValidator } from '../utils/validation';
import { type Language } from '../localization/types/data-types';

const MAX_PASSWORD_ATTEMPTS = 3;

export class MenuManager {
    console: Console;

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
            choices,
            ...this.defaultConfig,
        });
    }

    get defaultConfig(): { pageSize: number } {
        return { pageSize: process.stdout.rows };
    }

    /**
     * Меню добавления подключения
     */
    async showAddConnectionMenu(): Promise<{ name: string; server: Server }> {
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
            ...this.defaultConfig,
        });
        const port = parseInt(portInput) || 22;
        ServerValidator.validatePort(port);

        const usePassword = await confirm({
            message: global.localization.get('add.usePassword'),
            default: true,
            ...this.defaultConfig,
        });

        let server: Server;

        if (usePassword) {
            const pwd = await password({ message: global.localization.get('add.password') });
            server = { host, username, password: pwd, port };
        } else {
            const keyPath = await input({
                message: global.localization.get('add.keyPath'),
                default: '~/.ssh/id_rsa',
                ...this.defaultConfig,
            });
            server = { host, username, privateKey: keyPath, port };
        }

        return { name, server };
    }

    /**
     * Меню удаления подключения
     */
    async showDeleteConnectionMenu(): Promise<{ serverName: string | null; confirmed: boolean }> {
        this.console.clear();
        global.currentPlace = 'deleteConnection';
        const serverNames = ConfigManager.getServerNames();
        if (serverNames.length === 0) {
            this.console.log(global.localization.get('delete.noConnections'));
            return { serverName: null, confirmed: false };
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
            ...this.defaultConfig,
        });

        if (serverName === 'back') {
            return { serverName: null, confirmed: false };
        }

        const confirmed = await confirm({
            message: global.localization.getGeneric('delete.confirm', { name: serverName }),
            default: false,
        });

        return { serverName, confirmed };
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
            ...this.defaultConfig,
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
            ...this.defaultConfig,
        });
    }

    /**
     * Меню добавления туннеля
     */
    async showAddTunnelMenu(serverName: string): Promise<Tunnel> {
        this.console.clear();
        global.currentPlace = 'tunnelAdd:' + serverName;
        const dstHost = await input({
            message: global.localization.get('tunnel.destinationHost'),
            default: '127.0.0.1',
            ...this.defaultConfig,
        });
        ServerValidator.validateHost(dstHost);

        const dstPortInput = await input({ message: global.localization.get('tunnel.destinationPort') });
        const dstPort = +dstPortInput;
        ServerValidator.validatePort(dstPort);

        const srcPortInput = await input({ message: global.localization.get('tunnel.localPort') });
        const srcPort = +srcPortInput;
        ServerValidator.validatePort(srcPort);

        const tunnel = { srcPort: srcPort.toString(), dstHost, dstPort: dstPort.toString() };
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
            ...this.defaultConfig,
        });

        if (tunnelToDelete === 'back') {
            return null;
        }

        const tunnelIndex = parseInt(tunnelToDelete);
        const tunnel = server.tunnels![tunnelIndex];

        const confirmed = await confirm({
            message: global.localization.getGeneric('tunnels.deleteConfirm', { src: tunnel.srcPort, dst: tunnel.dstHost, port: tunnel.dstPort }),
            default: false,
            ...this.defaultConfig,
        });

        return confirmed ? tunnelIndex : null;
    }

    /**
     * Меню выбора языка
     */
    async showLanguageSelectionMenu(): Promise<Language | null> {
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
            ...this.defaultConfig,
        })) as Language | 'back';

        return selectedLanguage === 'back' ? null : selectedLanguage;
    }

    /**
     * Меню установки пароля
     */
    async showPasswordSetupMenu(): Promise<{ isNewPassword: boolean; password: string; confirmPassword?: string }> {
        this.console.clear();
        global.currentPlace = 'passwordSetup';
        const hashPassword = ConfigManager.getPasswordHash();

        if (hashPassword === '') {
            const newPassword = await password({
                message: global.localization.get('password.newPassword'),
                ...this.defaultConfig,
            });
            PasswordValidator.validate(newPassword);

            const confirmPassword = await password({
                message: global.localization.get('password.confirmPassword'),
                ...this.defaultConfig,
            });

            if (newPassword !== confirmPassword) {
                throw new Error(global.localization.get('password.notMatch'));
            }

            return { isNewPassword: true, password: newPassword, confirmPassword };
        } else {
            let attempts = 0;

            while (attempts < MAX_PASSWORD_ATTEMPTS) {
                const enteredPassword = await password({
                    message: global.localization.get('password.enterPassword'),
                    ...this.defaultConfig,
                });

                if (ConfigManager.checkPassword(enteredPassword)) {
                    return { isNewPassword: false, password: enteredPassword };
                }

                attempts++;
                const remainingAttempts = MAX_PASSWORD_ATTEMPTS - attempts;

                if (remainingAttempts > 0) {
                    this.console.log(global.localization.getGeneric('password.wrongPasswordAttempts', { attempts: remainingAttempts.toString() }));
                } else {
                    throw new Error(global.localization.get('password.maxAttemptsReached'));
                }
            }

            // Недостижим, но TS плоха -Ka
            throw new Error(global.localization.get('password.maxAttemptsReached'));
        }
    }

    /**
     * Запрашивает подтверждение сохранения подключения при неудачном тесте
     */
    async askSaveConnectionAnyway(): Promise<boolean> {
        return await confirm({
            message: global.localization.get('add.saveAnyway'),
            default: false,
            ...this.defaultConfig,
        });
    }

    /**
     * Запрашивает подтверждение шифрования пароля
     */
    async askEncryptPassword(): Promise<boolean> {
        return await confirm({
            message: global.localization.get('add.encryptPassword'),
            default: true,
            ...this.defaultConfig,
        });
    }

    /**
     * Запрашивает подтверждение продолжения после ошибки
     */
    async askContinueAfterError(): Promise<boolean> {
        return await confirm({
            message: global.localization.get('continue.pressEnterShort'),
            default: true,
            ...this.defaultConfig,
        });
    }
}
