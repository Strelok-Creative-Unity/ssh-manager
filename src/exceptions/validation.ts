export class ValidationError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'ValidationError';
    }
}

export class ValidationFieldError extends ValidationError {
    field: string;
    constructor(message: string, field?: string) {
        const vars: Record<string, string> = { field: field ?? '[placeholder]' };
        const result = message.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? `{${key}}`);
        super(result);
        this.field = vars.field;
        this.name = 'ValidationFieldError';
    }
}
