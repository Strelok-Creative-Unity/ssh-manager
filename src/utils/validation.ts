import { ValidationError } from '../exceptions/validation';
import { Config, Server, Tunnel } from '../types';
import { ConfigManager } from './config';

export class ServerValidator {
    static validate(server: Partial<Server>): void {
        if (!server.host) {
            throw new ValidationError(global.localization.get('validation.hostRequired'));
        }

        if (!server.username) {
            throw new ValidationError(global.localization.get('validation.usernameRequired'));
        }

        if (server.port !== undefined) {
            if (!Number.isInteger(server.port) || server.port < 1 || server.port > 65535) {
                throw new ValidationError(global.localization.get('validation.portRange'));
            }
        }

        // Проверяем, что есть либо пароль, либо приватный ключ
        if (!server.password && !server.privateKey) {
            throw new ValidationError(global.localization.get('validation.passwordOrKeyRequired'));
        }

        if (server.tunnels) {
            server.tunnels.forEach((tunnel, index) => {
                TunnelValidator.validate(tunnel);
            });
        }
    }

    static validateServerName(name: string): void {
        if (!name || name.trim().length === 0) {
            throw new ValidationError(global.localization.get('validation.serverNameRequired'));
        }

        if (name.length > 28) {
            throw new ValidationError(global.localization.get('validation.serverNameTooLong'));
        }

        if (ConfigManager.getConfig().servers[name]) {
            throw new ValidationError(global.localization.get('validation.serverNameExists'));
        }

        const invalidChars = /[<>:"/\\|?*]/;
        if (invalidChars.test(name)) {
            throw new ValidationError(global.localization.get('validation.serverNameInvalidChars'));
        }
    }

    static validateHost(host: string): void {
        if (!host || host.trim().length === 0) {
            throw new ValidationError(global.localization.get('validation.hostRequired'));
        }

        if (host.length > 253) {
            throw new ValidationError(global.localization.get('validation.hostTooLong'));
        }

        const hostRegex = /^[a-zA-Z0-9.-]+$/;
        const ipRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;

        if (!hostRegex.test(host) && !ipRegex.test(host)) {
            throw new ValidationError(global.localization.get('validation.hostInvalidFormat'));
        }
    }

    static validateUsername(username: string): void {
        if (!username || username.trim().length === 0) {
            throw new ValidationError(global.localization.get('validation.usernameRequired'));
        }

        if (username.length > 32) {
            throw new ValidationError(global.localization.get('validation.usernameTooLong'));
        }

        // Проверяем на недопустимые символы
        const invalidChars = /[<>:"/\\|?*]/;
        if (invalidChars.test(username)) {
            throw new ValidationError(global.localization.get('validation.usernameInvalidChars'));
        }
    }

    static validatePort(port: number): void {
        if (!Number.isInteger(port) || port < 1 || port > 65535) {
            throw new ValidationError(global.localization.get('validation.portRange'));
        }
    }
}

export class TunnelValidator {
    static validate(tunnel: Partial<Tunnel>): void {
        if (!tunnel.srcPort) {
            throw new ValidationError(global.localization.get('validation.sourcePortRequired'));
        }

        if (!tunnel.dstHost) {
            throw new ValidationError(global.localization.get('validation.destinationHostRequired'));
        }

        if (!tunnel.dstPort) {
            throw new ValidationError(global.localization.get('validation.destinationPortRequired'));
        }

        const srcPort = +tunnel.srcPort;
        if (isNaN(srcPort) || srcPort < 1 || srcPort > 65535) {
            throw new ValidationError(global.localization.get('validation.sourcePortRange'));
        }

        const dstPort = +tunnel.dstPort;
        if (isNaN(dstPort) || dstPort < 1 || dstPort > 65535) {
            throw new ValidationError(global.localization.get('validation.destinationPortRange'));
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
            throw new ValidationError(
                global.localization.getGeneric('validation.tunnelAlreadyExists', {
                    srcPort: newTunnel.srcPort,
                    dstHost: newTunnel.dstHost,
                    dstPort: newTunnel.dstPort,
                    serverName: serverName,
                }),
            );
        }
    }
}

export class ConfigValidator {
    static validate(config: Config): void {
        if (!config || typeof config !== 'object') {
            throw new ValidationError(global.localization.get('validation.configInvalid'));
        }

        if (!config.servers || typeof config.servers !== 'object') {
            throw new ValidationError(global.localization.get('validation.serversRequired'));
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
            throw new ValidationError(global.localization.get('validation.passwordRequired'));
        }

        if (password.length < 4) {
            throw new ValidationError(global.localization.get('validation.passwordTooShort'));
        }

        if (password.length > 128) {
            throw new ValidationError(global.localization.get('validation.passwordTooLong'));
        }
    }
}
