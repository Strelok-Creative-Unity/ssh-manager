import { AsyncSocket, AsyncSocketPackageRestData, AsyncSocketServer, Engine, IncomingDataPackage, JSONValue, ServerEngine } from 'asyncsocket';
import { EventEmitter } from 'events';
import * as net from 'net';

function JSONParse(message: string) {
    try {
        return JSON.parse(message);
    } catch (err) {
        return null;
    }
}

//!!! Вынести в библиотеку -Ka
type NetEngineOptions = { address: string; port: number; options?: net.TcpNetConnectOpts } | net.Socket;

export class NetIncomingDataStore implements IncomingDataPackage {
    data: JSONValue;
    waitId?: string;
    isEvent = false;
    as!: AsyncSocket;
    constructor(packageData: IncomingDataPackage) {
        this.waitId = packageData.waitId;
        this.data = packageData.data;
    }
    accept(as: AsyncSocket) {
        this.as = as;
        return this;
    }
    async send<d extends JSONValue = JSONValue>(
        data: AsyncSocketPackageRestData & {
            [key: string]: JSONValue;
        },
    ): Promise<IncomingDataPackage<d>> {
        return this.as.send({
            ...data,
            waitId: typeof data.waitId === 'string' ? data.waitId : this.waitId!,
        });
    }
    async sendNoReply(
        data: AsyncSocketPackageRestData & {
            [key: string]: JSONValue;
        },
    ) {
        return this.as.sendNoReply({
            data,
            waitId: typeof data.waitId === 'string' ? data.waitId : this.waitId!,
        });
    }
}

export class NetEngine extends EventEmitter implements Engine {
    public socket: net.Socket;
    constructor(netOptions: NetEngineOptions) {
        super();
        if (netOptions instanceof net.Socket) {
            this.socket = netOptions;
        } else {
            if (netOptions.address === null) {
                throw new Error(global.localization.get('error.netAddressNull'));
            }

            this.socket = net.createConnection(netOptions.port, netOptions.address);
        }

        this.listen();
    }
    listen() {
        let buffer = '';
        this.socket.on('data', (data) => {
            buffer += data.toString();
            const lines = buffer.split('\n');
            buffer = lines.pop() || ''; // Keep incomplete line in buffer

            for (const line of lines) {
                if (line.trim()) {
                    const parsedData = JSONParse(line);
                    if (parsedData === null) continue;
                    this.emit('message', new NetIncomingDataStore(parsedData));
                }
            }
        });
    }
    send(data: JSONValue) {
        this.socket.write(JSON.stringify(data) + '\n');
    }
}

export class NetServerEngine extends EventEmitter implements ServerEngine {
    public server: net.Server;
    constructor(serverOptions?: net.ServerOpts) {
        super();
        this.server = net.createServer(serverOptions);
        this.listen();
    }
    listen() {
        this.server.on('connection', (socket) => {
            const netSocket = new AsyncSocket(new NetEngine(socket));
            this.emit('connection', netSocket);
        });
    }
}

export function AsyncSocketNetClient(socket: net.Socket): Promise<AsyncSocket> {
    return new Promise((resolve, reject) => {
        socket.on('connect', async () => {
            const engine = new NetEngine(socket);
            const netSocket = new AsyncSocket(engine);
            resolve(netSocket);
        });
    });
}

export function AsyncSocketNetServer(serverOptions?: net.ServerOpts) {
    const engine = new NetServerEngine(serverOptions);
    return new AsyncSocketServer(engine);
}
