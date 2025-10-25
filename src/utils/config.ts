import path from 'path';
import fs from 'fs';
import os from 'os';
import { Config, NormalizedServer, Server } from '../types';
import { CryptoManager } from './crypto';
import { ConfigValidator, ServerValidator } from './validation';
import { logger } from './logger';

export class ConfigManager {
    private static readonly configDir = path.join(os.homedir(), '.ssh-manager');
    private static readonly configFile = path.join(this.configDir, 'config.json');
    private static readonly passwordFile = path.join(this.configDir, 'password.sha256');

    private static _config: Config | null = null;

    static {
        this.initializeConfig();
    }

    private static initializeConfig(): void {
        if (!fs.existsSync(this.configDir)) {
            fs.mkdirSync(this.configDir, { recursive: true });
        }

        if (!fs.existsSync(this.configFile)) {
            const initialConfig: Config = { servers: {} };
            fs.writeFileSync(this.configFile, JSON.stringify(initialConfig, null, 2));
        }

        if (!fs.existsSync(this.passwordFile)) {
            fs.writeFileSync(this.passwordFile, '', 'utf8');
        }
    }

    /**
     * Получает конфигурацию (с кэшированием)
     */
    static getConfig(): Config {
        if (!this._config) {
            try {
                const configData = JSON.parse(fs.readFileSync(this.configFile, 'utf8'));
                // ConfigValidator.validate(configData);
                this._config = configData;
                logger.debug('Configuration loaded and validated');
            } catch (error) {
                logger.error('Failed to load or validate configuration', error as Error);
                throw error;
            }
        }
        return this._config!;
    }

    /**
     * Сохраняет конфигурацию
     */
    static saveConfig(): void {
        if (this._config) {
            fs.writeFileSync(this.configFile, JSON.stringify(this._config, null, 2));
        }
    }

    /**
     * Обновляет конфигурацию из файла
     */
    static reloadConfig(): Config {
        this._config = JSON.parse(fs.readFileSync(this.configFile, 'utf8'));
        return this._config!;
    }

    /**
     * Получает хеш пароля
     */
    static getPasswordHash(): string {
        return fs.readFileSync(this.passwordFile, 'utf8');
    }

    /**
     * Устанавливает хеш пароля
     */
    static setPasswordHash(hash: string): void {
        fs.writeFileSync(this.passwordFile, hash, 'utf8');
    }

    /**
     * Проверяет пароль
     */
    static checkPassword(password: string): boolean {
        const hash = this.getPasswordHash();
        return hash !== '' && CryptoManager.verifyPassword(password, hash);
    }

    /**
     * Нормализует сервер (расшифровывает пароль, загружает ключи)
     */
    static normalizeServer(server: Server, password: string): NormalizedServer {
        const normalizedServer = { ...server };

        // Обработка приватного ключа
        if (normalizedServer.privateKey && typeof normalizedServer.privateKey === 'string') {
            const keyPath = normalizedServer.privateKey.startsWith('~')
                ? path.join(os.homedir(), normalizedServer.privateKey.slice(1))
                : normalizedServer.privateKey;

            normalizedServer.privateKeyPath = keyPath;

            if (fs.existsSync(keyPath)) {
                normalizedServer.privateKey = fs.readFileSync(keyPath, 'utf8');
            } else {
                throw new Error(`Private key file not found: ${keyPath}`);
            }
        }

        // Обработка пароля
        if (normalizedServer.password && typeof normalizedServer.password === 'object') {
            normalizedServer.password = CryptoManager.decrypt(normalizedServer.password.hash, password, normalizedServer.password.salt);
        }

        return normalizedServer as NormalizedServer;
    }

    /**
     * Добавляет сервер в конфигурацию
     */
    static addServer(name: string, server: Server): void {
        try {
            ServerValidator.validateServerName(name);
            ServerValidator.validate(server);

            const config = this.getConfig();
            config.servers[name] = server;
            this.saveConfig();

            logger.info(`Server added: ${name}`);
        } catch (error) {
            logger.error(`Failed to add server ${name}`, error as Error);
            throw error;
        }
    }

    /**
     * Удаляет сервер из конфигурации
     */
    static removeServer(name: string): void {
        const config = this.getConfig();
        delete config.servers[name];
        this.saveConfig();
    }

    /**
     * Получает сервер по имени
     */
    static getServer(name: string): Server | undefined {
        const config = this.getConfig();
        return config.servers[name];
    }

    /**
     * Получает список всех серверов
     */
    static getServerNames(): string[] {
        const config = this.getConfig();
        return Object.keys(config.servers);
    }
}
