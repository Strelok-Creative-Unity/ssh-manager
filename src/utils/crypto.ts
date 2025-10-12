import crypto from 'crypto';

const ALGO = 'aes-256-gcm'; // Рассмотреть возможность использования других алгоритмов -Ka
const IV_LEN = 12; // стандарт для GCM

export class CryptoManager {
    /**
     * Шифрует текст
     */
    static encrypt(text: string, password: string, salt: string): string {
        const key = crypto.scryptSync(password, salt, 32);
        const iv = crypto.randomBytes(IV_LEN);
        const cipher = crypto.createCipheriv(ALGO, key, iv);

        const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
        const tag = cipher.getAuthTag();

        return [iv.toString('hex'), tag.toString('hex'), encrypted.toString('hex')].join(':');
    }

    /**
     * Расшифровывает текст
     */
    static decrypt(encrypted: string, password: string, salt: string): string {
        const [ivHex, tagHex, dataHex] = encrypted.split(':');
        const key = crypto.scryptSync(password, salt, 32);
        const iv = Buffer.from(ivHex, 'hex');
        const tag = Buffer.from(tagHex, 'hex');
        const data = Buffer.from(dataHex, 'hex');

        const decipher = crypto.createDecipheriv(ALGO, key, iv);
        decipher.setAuthTag(tag);

        const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
        return decrypted.toString('utf8');
    }

    /**
     * Создает хеш пароля
     */
    static createPasswordHash(password: string): string {
        return crypto.createHash('sha256').update(password).digest('hex');
    }

    /**
     * Проверяет пароль по хешу
     */
    static verifyPassword(password: string, hash: string): boolean {
        return this.createPasswordHash(password) === hash;
    }

    /**
     * Генерирует случайную соль
     */
    static generateSalt(): string {
        return crypto.randomBytes(16).toString('hex');
    }
}
