# Быстрый старт на VPS

## 🚀 Установка за 5 минут

### 1. Подключитесь к VPS
```bash
ssh user@your-vps-ip
```

### 2. Установите зависимости
```bash
# Обновление системы
sudo apt update && sudo apt upgrade -y

# Установка Node.js 18+
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Установка PM2
sudo npm install -g pm2
```

### 3. Клонируйте проект
```bash
cd /opt
git clone https://github.com/Invidus/autopost.git autoposting-bot
cd autoposting-bot
```

### 4. Запустите скрипт установки
```bash
bash install.sh
```

### 5. Настройте .env файл
```bash
nano .env
# Заполните:
# - API_ID и API_HASH (получите на https://my.telegram.org)
# - TARGET_CHANNEL_ID (ID вашего канала)
# - SOURCE_CHANNELS (каналы-источники через запятую)
```

### 6. Первая авторизация
```bash
npm start
# Введите номер телефона, код и пароль
# После успешной авторизации нажмите Ctrl+C
```

### 7. Запуск через PM2
```bash
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup
```

### 8. Проверка работы
```bash
pm2 status
pm2 logs autoposting-bot
```

## ✅ Готово! Бот работает

## 📊 Управление

```bash
pm2 status              # Статус
pm2 logs autoposting-bot # Логи
pm2 restart autoposting-bot # Перезапуск
pm2 stop autoposting-bot    # Остановка
```

## 🔒 Защита от конфликтов

**Не будет конфликтов**, если:
- ✅ Каждый бот в отдельной папке: `/opt/bot1/`, `/opt/bot2/`
- ✅ Разные имена в PM2: `pm2 start index.js --name bot1`
- ✅ Разные .env и session.txt файлы

**Пример запуска нескольких ботов:**
```bash
# Бот 1
cd /opt/autoposting-bot
pm2 start index.js --name autoposting-bot

# Бот 2
cd /opt/other-bot
pm2 start index.js --name other-bot

# Проверка всех ботов
pm2 list
```

## 🆘 Проблемы?

### Ошибка `ERR_UNSUPPORTED_DIR_IMPORT` при запуске?

Эта ошибка исправлена в текущей версии. Если возникла:
```bash
# Обновите код
git pull

# Переустановите зависимости
npm install
```

### Другие проблемы:

- **Развертывание с существующим ботом?** См. [DEPLOYMENT_WITH_EXISTING_BOT.md](./DEPLOYMENT_WITH_EXISTING_BOT.md)
- **Общая инструкция:** См. [DEPLOYMENT.md](./DEPLOYMENT.md)

