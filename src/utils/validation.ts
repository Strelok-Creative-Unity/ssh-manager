import { ValidationError } from '../exceptions/validation';
import { Config, Server, Tunnel } from '../types';
import { ConfigManager } from './config';

export class ServerValidator {
    static validate(server: Partial<Server>): void {
        if (!server.host) {
            throw new ValidationError('Host is required');
        }

        if (!server.username) {
            throw new ValidationError('Username is required');
        }

        if (server.port !== undefined) {
            if (!Number.isInteger(server.port) || server.port < 1 || server.port > 65535) {
                throw new ValidationError('Port must be an integer between 1 and 65535');
            }
        }

        // Проверяем, что есть либо пароль, либо приватный ключ
        if (!server.password && !server.privateKey) {
            throw new ValidationError('Either password or privateKey must be provided');
        }

        if (server.tunnels) {
            server.tunnels.forEach((tunnel, index) => {
                TunnelValidator.validate(tunnel);
            });
        }
    }

    static validateServerName(name: string): void {
        if (!name || name.trim().length === 0) {
            throw new ValidationError('Server name is required');
        }

        if (name.length > 28) {
            throw new ValidationError('Server name is too long (max 28 characters)');
        }

        if (ConfigManager.getConfig().servers[name]) {
            throw new ValidationError('Server name already exists');
        }

        const invalidChars = /[<>:"/\\|?*]/;
        if (invalidChars.test(name)) {
            throw new ValidationError('Server name contains invalid characters');
        }
    }

    static validateHost(host: string): void {
        if (!host || host.trim().length === 0) {
            throw new ValidationError('Host is required');
        }

        if (host.length > 253) {
            throw new ValidationError('Host is too long (max 253 characters)');
        }

        const hostRegex = /^[a-zA-Z0-9.-]+$/;
        const ipRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;

        if (!hostRegex.test(host) && !ipRegex.test(host)) {
            throw new ValidationError('Invalid host format');
        }
    }

    static validateUsername(username: string): void {
        if (!username || username.trim().length === 0) {
            throw new ValidationError('Username is required');
        }

        if (username.length > 32) {
            throw new ValidationError('Username is too long (max 32 characters)');
        }

        // Проверяем на недопустимые символы
        const invalidChars = /[<>:"/\\|?*]/;
        if (invalidChars.test(username)) {
            throw new ValidationError('Username contains invalid characters');
        }
    }

    static validatePort(port: number): void {
        if (!Number.isInteger(port) || port < 1 || port > 65535) {
            throw new ValidationError('Port must be an integer between 1 and 65535');
        }
    }
}

export class TunnelValidator {
    static validate(tunnel: Partial<Tunnel>): void {
        if (!tunnel.srcPort) {
            throw new ValidationError('Source port is required');
        }

        if (!tunnel.dstHost) {
            throw new ValidationError('Destination host is required');
        }

        if (!tunnel.dstPort) {
            throw new ValidationError('Destination port is required');
        }

        const srcPort = parseInt(tunnel.srcPort);
        if (isNaN(srcPort) || srcPort < 1 || srcPort > 65535) {
            throw new ValidationError('Source port must be a number between 1 and 65535');
        }

        const dstPort = parseInt(tunnel.dstPort);
        if (isNaN(dstPort) || dstPort < 1 || dstPort > 65535) {
            throw new ValidationError('Destination port must be a number between 1 and 65535');
        }

        ServerValidator.validateHost(tunnel.dstHost);
    }

    static validateUnique(serverName: string, newTunnel: Tunnel): void {
        const server = ConfigManager.getServer(serverName);
        if (!server || !server.tunnels) {
            return; // Нет туннелей для проверки
        }

        const isDuplicate = server.tunnels.some(
            (existingTunnel) =>
                existingTunnel.srcPort === newTunnel.srcPort && existingTunnel.dstHost === newTunnel.dstHost && existingTunnel.dstPort === newTunnel.dstPort,
        );

        if (isDuplicate) {
            throw new ValidationError(`Tunnel ${newTunnel.srcPort} -> ${newTunnel.dstHost}:${newTunnel.dstPort} already exists on server ${serverName}`);
        }
    }
}

export class ConfigValidator {
    static validate(config: Config): void {
        if (!config || typeof config !== 'object') {
            throw new ValidationError('Config must be an object');
        }

        if (!config.servers || typeof config.servers !== 'object') {
            throw new ValidationError('Config must have a servers object');
        }

        for (const [serverName, server] of Object.entries(config.servers)) {
            ServerValidator.validateServerName(serverName);
            ServerValidator.validate(server as Server);
        }
    }
}

export class PasswordValidator {
    static validate(password: string): void {
        if (!password || password.length === 0) {
            throw new ValidationError('Password is required');
        }

        if (password.length < 4) {
            throw new ValidationError('Password must be at least 4 characters long');
        }

        if (password.length > 128) {
            throw new ValidationError('Password is too long (max 128 characters)');
        }
    }
}
