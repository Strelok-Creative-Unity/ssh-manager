import { select, input, confirm, password } from '@inquirer/prompts';
import { Server, Tunnel } from '../types';
import { ConfigManager } from '../utils/config';
import { CryptoManager } from '../utils/crypto';
import { testSSHConnection } from '../ssh/connection';
import { ServerValidator, TunnelValidator, PasswordValidator } from '../utils/validation';
import { logger } from '../utils/logger';
import { ValidationError } from '../exceptions/validation';

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
                name: `Подключиться: ${name}`,
                value: `ssh:${name}`,
            })),
            { name: 'Добавить подключение', value: 'add' },
            { name: 'Удалить подключение', value: 'delete' },
            { name: 'Управление туннелями', value: 'tunnels' },
            { name: 'Выход', value: 'exit' },
        ];

        return await select({
            message: 'Выберите действие:',
            pageSize: process.stdout.rows - 3, // 3 - это высота меню, не убирать
            choices,
        });
    }

    private async handleValidationError(error: Error): Promise<void> {
        global.currentPlace = 'exception';
        if (error instanceof ValidationError) {
            this.console.error(`Ошибка валидации: ${error.message}`);
            logger.error('Validation error in menu', error);
        } else if (error.name === 'ExitPromptError') {
            this.console.log('\nОперация отменена пользователем.');
            logger.info('User cancelled operation with Ctrl+C');
            return; // Не показываем confirm для ExitPromptError
        } else {
            this.console.error(`Ошибка: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`);
            logger.error('Error in menu', error as Error);
        }

        await confirm({
            message: 'Нажмите Enter для продолжения...',
            default: true,
        });
    }

    /**
     * Меню добавления подключения
     */
    async showAddConnectionMenu(): Promise<Server | null> {
        this.console.clear();
        global.currentPlace = 'addConnection';
        const name = await input({ message: 'Название подключения:' });
        ServerValidator.validateServerName(name);

        const host = await input({ message: 'Host:' });
        ServerValidator.validateHost(host);

        const username = await input({ message: 'User:' });
        ServerValidator.validateUsername(username);

        const portInput = await input({
            message: 'Порт:',
            default: '22',
        });
        const port = parseInt(portInput) || 22;
        ServerValidator.validatePort(port);

        const usePassword = await confirm({
            message: 'Использовать пароль? (Нет = ключ)',
            default: true,
        });

        let server: Server;

        if (usePassword) {
            const pwd = await password({ message: 'Пароль:' });
            server = { host, username, password: pwd, port };
        } else {
            const keyPath = await input({
                message: 'Путь до ключа:',
                default: '~/.ssh/id_rsa',
            });
            server = { host, username, privateKey: keyPath, port };
        }

        // Тестируем подключение
        this.console.log('Тестирую подключение к серверу...');
        const connectionTest = await testSSHConnection(server, this.password);

        if (connectionTest) {
            this.console.log('✅ Подключение успешно!');
        } else {
            this.console.log('❌ Не удалось подключиться к серверу.');
            const saveAnyway = await confirm({
                message: 'Сохранить соединение несмотря на неудачный тест?',
                default: false,
            });

            if (!saveAnyway) {
                return null;
            }
        }

        // Шифруем пароль если нужно
        if (server.password && typeof server.password === 'string') {
            const saveHashedPassword = await confirm({
                message: 'Зашифровать пароль?',
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
        this.console.log('Сервер добавлен.');

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
            this.console.log('Нет подключений для удаления.');
            return null;
        }

        const choices = [
            ...serverNames.map((name) => ({
                name: `${name} (${ConfigManager.getServer(name)?.host})`,
                value: name,
            })),
            { name: 'Назад', value: 'back' },
        ];

        const serverName = await select({
            message: 'Выберите подключение для удаления:',
            choices,
        });

        if (serverName === 'back') {
            return null;
        }

        const confirmed = await confirm({
            message: `Вы уверены, что хотите удалить подключение "${serverName}"?`,
            default: false,
        });

        if (confirmed) {
            ConfigManager.removeServer(serverName);
            this.console.log(`Подключение "${serverName}" удалено.`);
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
            this.console.log('Нет серверов для управления туннелями.');
            return null;
        }

        const choices = [
            ...serverNames.map((name) => ({
                name,
                value: name,
            })),
            { name: 'Назад', value: 'back' },
        ];

        const serverName = await select({
            message: 'Выберите сервер для туннелей:',
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
            throw new Error(`Server ${serverName} not found`);
        }

        const tunnelChoices = (server.tunnels || []).map((t, index) => {
            const isActive = activeTunnels.some((at) => at.srcPort === t.srcPort && at.dstHost === t.dstHost && at.dstPort === t.dstPort);

            const status = isActive ? ' (остановить)' : ' (запустить)';

            return {
                name: `${t.srcPort} -> ${t.dstHost}:${t.dstPort}${status}`,
                value: `tunnel:${index}`,
            };
        });

        const choices = [
            ...tunnelChoices,
            { name: 'Добавить туннель', value: 'add' },
            { name: 'Удалить туннель', value: 'delete' },
            { name: 'Назад', value: 'back' },
        ];

        return await select({
            message: 'Действие:',
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
            message: 'Хост назначения:',
            default: '127.0.0.1',
        });
        ServerValidator.validateHost(dstHost);

        const dstPortInput = await input({ message: 'Порт назначения:' });
        const dstPort = parseInt(dstPortInput);
        ServerValidator.validatePort(dstPort);

        const srcPortInput = await input({ message: 'Локальный порт:' });
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
            this.console.log('Нет туннелей для удаления.');
            return null;
        }

        const choices = [
            ...server.tunnels.map((t, index) => ({
                name: `${t.srcPort} -> ${t.dstHost}:${t.dstPort}`,
                value: index.toString(),
            })),
            { name: 'Назад', value: 'back' },
        ];

        const tunnelToDelete = await select({
            message: 'Выберите туннель для удаления:',
            choices,
        });

        if (tunnelToDelete === 'back') {
            return null;
        }

        const tunnelIndex = parseInt(tunnelToDelete);
        const tunnel = server.tunnels![tunnelIndex];

        const confirmed = await confirm({
            message: `Вы уверены, что хотите удалить туннель ${tunnel.srcPort} -> ${tunnel.dstHost}:${tunnel.dstPort}?`,
            default: false,
        });

        return confirmed ? tunnelIndex : null;
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
                message: 'Введите новый пароль для доступа к SSH Manager:',
            });
            PasswordValidator.validate(newPassword);

            const confirmPassword = await password({
                message: 'Подтвердите пароль:',
            });

            if (newPassword !== confirmPassword) {
                throw new Error('Введённые пароли не совпадают');
            }

            ConfigManager.setPasswordHash(CryptoManager.createPasswordHash(newPassword));
            this.console.log('Пароль установлен');
            logger.info('New password set');
            return newPassword;
        } else {
            const enteredPassword = await password({
                message: 'Введите пароль для доступа к SSH Manager:',
            });

            if (!ConfigManager.checkPassword(enteredPassword)) {
                throw new Error('Пароль отличается от заданного');
            }

            this.console.log('Пароль установлен');
            logger.info('Password verified');
            return enteredPassword;
        }
    }
}
