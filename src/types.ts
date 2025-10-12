export interface Tunnel {
    srcPort: string;
    dstHost: string;
    dstPort: string;
}

export interface Password {
    hash: string;
    salt: string;
}

export interface Server {
    host: string;
    username: string;
    port?: number;
    password?: Password | string;
    privateKey?: string;
    privateKeyPath?: string;
    tunnels?: Tunnel[];
}

export interface NormalizedServer extends Server {
    password: string;
}

export interface Config {
    servers: Record<string, Server>;
}
