import { SSHConnection } from '../connection';
import { Server } from '../../types';

export async function testSSHConnection(server: Server, password: string, timeout: number = 10000): Promise<boolean> {
    const connection = new SSHConnection(server, password, { timeout });

    try {
        await connection.connect();
        connection.disconnect();
        return true;
    } catch (error) {
        return false;
    }
}
