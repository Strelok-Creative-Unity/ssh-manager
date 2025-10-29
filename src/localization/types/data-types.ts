export type Language = 'en' | 'ru';

export interface Translations {
    [key: string]: {
        [lang: string]: string;
    };
}

export interface LocalizationData {
    [language: string]: {
        [key: string]: string;
    };
}
