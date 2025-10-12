import net from 'net';
import { Server, Tunnel } from '../../types';
import { SSHConnection } from '../../ssh/connection';

export interface TunnelInfo {
    tunnel: Tunnel;
    netServer: net.Server;
    isActive: boolean;
}

export interface ServerTunnelInfo {
    sshConnection: SSHConnection;
    tunnels: TunnelInfo[];
}

export class TunnelManager {
    private activeTunnels: Map<string, ServerTunnelInfo> = new Map();

    async startTunnel(serverName: string, server: Server, password: string, tunnel: Tunnel): Promise<void> {
        if (!this.activeTunnels.has(serverName)) {
            const sshConnection = new SSHConnection(server, password);
            await sshConnection.connect();

            const serverInfo = {
                sshConnection,
                tunnels: [],
            };

            this.activeTunnels.set(serverName, serverInfo);
        }
        const serverInfo = this.activeTunnels.get(serverName)!;

        const existingTunnel = serverInfo.tunnels.find(
            (t) => t.tunnel.srcPort === tunnel.srcPort && t.tunnel.dstHost === tunnel.dstHost && t.tunnel.dstPort === tunnel.dstPort,
        );

        if (existingTunnel && existingTunnel.isActive) {
            throw new Error(`Tunnel ${tunnel.srcPort} -> ${tunnel.dstHost}:${tunnel.dstPort} is already active`);
        }

        // Сокет
        const netServer = net.createServer((localSocket) => {
            serverInfo!.sshConnection.client.forwardOut(
                localSocket.remoteAddress || '127.0.0.1',
                localSocket.remotePort || 0,
                tunnel.dstHost,
                parseInt(tunnel.dstPort),
                (err, remoteStream) => {
                    if (err) {
                        console.error(`Error creating tunnel ${tunnel.srcPort} -> ${tunnel.dstHost}:${tunnel.dstPort}:`, err);
                        localSocket.end();
                        return;
                    }

                    // Соединяем потоки
                    localSocket.pipe(remoteStream).pipe(localSocket);
                },
            );
        });

        await new Promise<void>((resolve, reject) => {
            netServer.listen(parseInt(tunnel.srcPort), () => {
                resolve();
            });

            netServer.on('error', (err) => {
                reject(err);
            });
        });

        const tunnelInfo: TunnelInfo = {
            tunnel,
            netServer,
            isActive: true,
        };

        serverInfo.tunnels.push(tunnelInfo);

        console.log(`Tunnel started: ${tunnel.srcPort} -> ${tunnel.dstHost}:${tunnel.dstPort}`);
    }

    /**
     * Останавливает туннель
     */
    stopTunnel(serverName: string, tunnel: Tunnel): void {
        const serverInfo = this.activeTunnels.get(serverName);
        if (!serverInfo) {
            console.log(`No active tunnels for server: ${serverName}`);
            return;
        }

        const tunnelInfo = serverInfo.tunnels.find(
            (t) => t.tunnel.srcPort === tunnel.srcPort && t.tunnel.dstHost === tunnel.dstHost && t.tunnel.dstPort === tunnel.dstPort,
        );

        if (!tunnelInfo) {
            console.log(`Tunnel not found: ${tunnel.srcPort} -> ${tunnel.dstHost}:${tunnel.dstPort}`);
            return;
        }

        tunnelInfo.netServer.close();
        tunnelInfo.isActive = false;

        serverInfo.tunnels = serverInfo.tunnels.filter((t) => t !== tunnelInfo);

        if (serverInfo.tunnels.length === 0) {
            serverInfo.sshConnection.disconnect();
            this.activeTunnels.delete(serverName);
        }

        console.log(`Tunnel stopped: ${tunnel.srcPort} -> ${tunnel.dstHost}:${tunnel.dstPort}`);
    }

    /**
     * Получает список активных туннелей для сервера
     */
    getActiveTunnels(serverName: string): Tunnel[] {
        const serverInfo = this.activeTunnels.get(serverName);
        if (!serverInfo) {
            return [];
        }

        return serverInfo.tunnels.filter((t) => t.isActive).map((t) => t.tunnel);
    }

    /**
     * Получает список всех активных туннелей
     */
    getAllActiveTunnels(): Record<string, Tunnel[]> {
        const result: Record<string, Tunnel[]> = {};

        for (const [serverName, serverInfo] of this.activeTunnels) {
            result[serverName] = this.getActiveTunnels(serverName);
        }

        return result;
    }

    /**
     * Останавливает все туннели для сервера
     */
    stopAllTunnelsForServer(serverName: string): void {
        const serverInfo = this.activeTunnels.get(serverName);
        if (!serverInfo) {
            return;
        }

        // Останавливаем все туннели
        for (const tunnelInfo of serverInfo.tunnels) {
            tunnelInfo.netServer.close();
            tunnelInfo.isActive = false;
        }

        serverInfo.sshConnection.disconnect();
        this.activeTunnels.delete(serverName);

        console.log(`All tunnels stopped for server: ${serverName}`);
    }

    /**
     * Останавливает все туннели
     */
    stopAllTunnels(): void {
        for (const serverName of this.activeTunnels.keys()) {
            this.stopAllTunnelsForServer(serverName);
        }
    }

    /**
     * Проверяет, активен ли туннель
     */
    isTunnelActive(serverName: string, tunnel: Tunnel): boolean {
        const serverInfo = this.activeTunnels.get(serverName);
        if (!serverInfo) {
            return false;
        }

        return serverInfo.tunnels.some(
            (t) => t.tunnel.srcPort === tunnel.srcPort && t.tunnel.dstHost === tunnel.dstHost && t.tunnel.dstPort === tunnel.dstPort && t.isActive,
        );
    }
}
