import { Server, Tunnel } from '../types';

export class ValidationError extends Error {
    constructor(message: string, public field?: string) {
        super(message);
        this.name = 'ValidationError';
    }
}

export class ServerValidator {
    static validate(server: Partial<Server>): void {
        if (!server.host) {
            throw new ValidationError('Host is required', 'host');
        }

        if (!server.username) {
            throw new ValidationError('Username is required', 'username');
        }

        if (server.port !== undefined) {
            if (!Number.isInteger(server.port) || server.port < 1 || server.port > 65535) {
                throw new ValidationError('Port must be an integer between 1 and 65535', 'port');
            }
        }

        // Проверяем, что есть либо пароль, либо приватный ключ
        if (!server.password && !server.privateKey) {
            throw new ValidationError('Either password or privateKey must be provided');
        }

        if (server.tunnels) {
            server.tunnels.forEach((tunnel, index) => {
                try {
                    TunnelValidator.validate(tunnel);
                } catch (error) {
                    // Поправить, а в идеале уйти на свои ошибки полного плана
                    if (error instanceof ValidationError) {
                        throw new ValidationError(`Tunnel ${index}: ${error.message}`, `tunnels[${index}].${error.field}`);
                    }
                    throw error;
                }
            });
        }
    }

    static validateServerName(name: string): void {
        if (!name || name.trim().length === 0) {
            throw new ValidationError('Server name is required', 'name');
        }

        if (name.length > 28) {
            throw new ValidationError('Server name is too long (max 28 characters)', 'name');
        }

        const invalidChars = /[<>:"/\\|?*]/;
        if (invalidChars.test(name)) {
            throw new ValidationError('Server name contains invalid characters', 'name');
        }
    }

    static validateHost(host: string): void {
        if (!host || host.trim().length === 0) {
            throw new ValidationError('Host is required', 'host');
        }

        if (host.length > 253) {
            throw new ValidationError('Host is too long (max 253 characters)', 'host');
        }

        const hostRegex = /^[a-zA-Z0-9.-]+$/;
        const ipRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;

        if (!hostRegex.test(host) && !ipRegex.test(host)) {
            throw new ValidationError('Invalid host format', 'host');
        }
    }

    static validateUsername(username: string): void {
        if (!username || username.trim().length === 0) {
            throw new ValidationError('Username is required', 'username');
        }

        if (username.length > 32) {
            throw new ValidationError('Username is too long (max 32 characters)', 'username');
        }

        // Проверяем на недопустимые символы
        const invalidChars = /[<>:"/\\|?*]/;
        if (invalidChars.test(username)) {
            throw new ValidationError('Username contains invalid characters', 'username');
        }
    }

    static validatePort(port: number): void {
        if (!Number.isInteger(port) || port < 1 || port > 65535) {
            throw new ValidationError('Port must be an integer between 1 and 65535', 'port');
        }
    }
}

export class TunnelValidator {
    static validate(tunnel: Partial<Tunnel>): void {
        if (!tunnel.srcPort) {
            throw new ValidationError('Source port is required', 'srcPort');
        }

        if (!tunnel.dstHost) {
            throw new ValidationError('Destination host is required', 'dstHost');
        }

        if (!tunnel.dstPort) {
            throw new ValidationError('Destination port is required', 'dstPort');
        }

        const srcPort = parseInt(tunnel.srcPort);
        if (isNaN(srcPort) || srcPort < 1 || srcPort > 65535) {
            throw new ValidationError('Source port must be a number between 1 and 65535', 'srcPort');
        }

        const dstPort = parseInt(tunnel.dstPort);
        if (isNaN(dstPort) || dstPort < 1 || dstPort > 65535) {
            throw new ValidationError('Destination port must be a number between 1 and 65535', 'dstPort');
        }

        ServerValidator.validateHost(tunnel.dstHost);
    }
}

export class ConfigValidator {
    static validate(config: any): void {
        if (!config || typeof config !== 'object') {
            throw new ValidationError('Config must be an object');
        }

        if (!config.servers || typeof config.servers !== 'object') {
            throw new ValidationError('Config must have a servers object');
        }

        for (const [serverName, server] of Object.entries(config.servers)) {
            try {
                ServerValidator.validateServerName(serverName);
                ServerValidator.validate(server as Server);
            } catch (error) {
                if (error instanceof ValidationError) {
                    throw new ValidationError(`Server "${serverName}": ${error.message}`, `servers.${serverName}.${error.field}`);
                }
                throw error;
            }
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
