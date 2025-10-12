# SSH Manager

Менеджер SSH подключений и туннелей, написанный на TypeScript.

## Установка

```bash
npm install
```

## Использование

### Разработка

```bash
npm run dev
```

### Сборка и запуск

```bash
npm run build
npm start
```

### Режим наблюдения (автоматическая пересборка)

```bash
npm run watch
```

## Функции

-   Подключение к SSH серверам
-   Управление SSH туннелями
-   Сохранение конфигурации серверов
-   Поддержка аутентификации по паролю и ключам

## Конфигурация

Конфигурация серверов сохраняется в файле `config.json` в формате:

```json
{
    "servers": {
        "server-name": {
            "host": "example.com",
            "username": "user",
            "port": 22,
            "password": "password",
            "tunnels": [
                {
                    "srcPort": "8080",
                    "dstHost": "127.0.0.1",
                    "dstPort": "80"
                }
            ]
        }
    }
}
```


