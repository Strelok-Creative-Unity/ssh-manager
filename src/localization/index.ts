import { Language, Translations, LocalizationData } from './types/data-types';

export class Localization {
    private language: Language;
    private translations: Translations;

    constructor(language: Language = 'ru') {
        this.language = language;
        this.translations = {};
    }

    loadFromData(data: LocalizationData): Localization {
        const keys = new Set<string>();

        Object.keys(data).forEach((lang) => {
            Object.keys(data[lang]).forEach((key) => {
                keys.add(key);
            });
        });

        keys.forEach((key) => {
            const translations: { [lang: string]: string } = {};
            Object.keys(data).forEach((lang) => {
                if (data[lang][key]) {
                    translations[lang] = data[lang][key];
                }
            });
            this.addPhrase(key, translations);
        });

        return this;
    }

    setLanguage(language: Language): void {
        this.language = language;
    }

    getLanguage(): Language {
        return this.language;
    }

    addPhrase(key: string, translations: { [lang: string]: string }): void {
        this.translations[key] = translations;
    }

    getGeneric(key: string, params: { [key: string]: string }): string {
        let text = this.get(key);
        Object.keys(params).forEach((param) => {
            text = text.replace(`{${param}}`, params[param] || '');
        });
        return text;
    }

    get(key: string): string {
        const translation = this.translations[key];
        if (!translation) {
            return key;
        }

        return translation[this.language] || translation['en'] || translation['ru'] || key;
    }

    /**
     * Получает доступные языки
     */
    getAvailableLanguages(): Array<{ name: string; value: Language }> {
        return [
            { name: 'Русский', value: 'ru' },
            { name: 'English', value: 'en' },
        ];
    }
}
