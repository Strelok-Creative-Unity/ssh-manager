export enum LogLevel {
    DEBUG = 0,
    INFO = 1,
    WARN = 2,
    ERROR = 3,
}

export interface LogEntry {
    timestamp: Date;
    level: LogLevel;
    message: string;
    data?: any;
    error?: Error;
}

// Реализовать след. возможности. Пока не востребован
export class Logger {
    private static instance: Logger;
    private logLevel: LogLevel = LogLevel.INFO;
    private logs: LogEntry[] = [];
    private maxLogs: number = 1000;

    private constructor() {}

    static getInstance(): Logger {
        if (!Logger.instance) {
            Logger.instance = new Logger();
        }
        return Logger.instance;
    }

    setLogLevel(level: LogLevel): void {
        this.logLevel = level;
    }

    private addLog(level: LogLevel, message: string, data?: any, error?: Error): void {
        if (level < this.logLevel) {
            return;
        }

        const logEntry: LogEntry = {
            timestamp: new Date(),
            level,
            message,
            data,
            error,
        };

        this.logs.push(logEntry);
        if (this.logs.length > this.maxLogs) {
            this.logs = this.logs.slice(-this.maxLogs);
        }
        this.printLog(logEntry);
    }

    private printLog(entry: LogEntry): void {
        const timestamp = entry.timestamp.toISOString();
        const levelStr = LogLevel[entry.level].padEnd(5);

        let output = `[${timestamp}] ${levelStr} ${entry.message}`;

        if (entry.data) {
            output += ` ${JSON.stringify(entry.data)}`;
        }

        if (entry.error) {
            output += `\nError: ${entry.error.message}`;
            if (entry.error.stack) {
                output += `\nStack: ${entry.error.stack}`;
            }
        }

        return void 0;

        switch (entry.level) {
            case LogLevel.DEBUG:
                console.debug(output);
                break;
            case LogLevel.INFO:
                console.info(output);
                break;
            case LogLevel.WARN:
                console.warn(output);
                break;
            case LogLevel.ERROR:
                console.error(output);
                break;
        }
    }

    debug(message: string, data?: any): void {
        this.addLog(LogLevel.DEBUG, message, data);
    }

    info(message: string, data?: any): void {
        this.addLog(LogLevel.INFO, message, data);
    }

    warn(message: string, data?: any): void {
        this.addLog(LogLevel.WARN, message, data);
    }

    error(message: string, error?: Error, data?: any): void {
        this.addLog(LogLevel.ERROR, message, data, error);
    }

    getLogs(): LogEntry[] {
        return [...this.logs];
    }

    getLogsByLevel(level: LogLevel): LogEntry[] {
        return this.logs.filter((log) => log.level === level);
    }

    clearLogs(): void {
        this.logs = [];
    }

    getRecentLogs(count: number): LogEntry[] {
        return this.logs.slice(-count);
    }
}

// Общий экземпляр логгера
export const logger = Logger.getInstance();
