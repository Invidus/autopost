# План развертывания на VPS

## Подготовка VPS

### Требования
- Ubuntu 20.04+ / Debian 11+ / CentOS 8+
- Минимум 512MB RAM
- Node.js 18+ или выше
- Git (для клонирования репозитория)

## Вариант 1: Развертывание через PM2 (Рекомендуется)

### Преимущества PM2:
- Автоматический перезапуск при сбоях
- Управление несколькими ботами одновременно
- Логирование
- Мониторинг процессов
- Не конфликтует с другими ботами

### Шаги установки:

1. **Установка Node.js и PM2**
```bash
# Обновление системы
sudo apt update && sudo apt upgrade -y

# Установка Node.js 18+
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Установка PM2 глобально
sudo npm install -g pm2
```

2. **Клонирование проекта**
```bash
cd /opt  # или любая другая директория
git clone <ваш-репозиторий> autoposting-bot
cd autoposting-bot
```

3. **Установка зависимостей**
```bash
npm install
```

4. **Настройка .env файла**
```bash
cp env.example .env
nano .env  # или используйте vi/vim
# Заполните все необходимые поля
```

5. **Первый запуск для авторизации**
```bash
npm start
# Введите номер телефона, код подтверждения и пароль
# После успешной авторизации нажмите Ctrl+C
```

6. **Запуск через PM2**
```bash
pm2 start index.js --name autoposting-bot
pm2 save
pm2 startup
```

7. **Проверка статуса**
```bash
pm2 status
pm2 logs autoposting-bot
```

## Вариант 2: Развертывание через Systemd

### Шаги установки:

1. **Установка Node.js** (см. выше)

2. **Клонирование и настройка проекта** (см. выше)

3. **Создание systemd сервиса**
```bash
sudo cp autoposting-bot.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable autoposting-bot
sudo systemctl start autoposting-bot
```

4. **Проверка статуса**
```bash
sudo systemctl status autoposting-bot
sudo journalctl -u autoposting-bot -f
```

## Вариант 3: Docker (Опционально)

### Создание Dockerfile:
```bash
docker build -t autoposting-bot .
docker run -d --name autoposting-bot --restart unless-stopped -v $(pwd)/.env:/app/.env -v $(pwd)/session.txt:/app/session.txt autoposting-bot
```

## Защита от конфликтов с другими ботами

### ✅ Почему конфликтов не будет:

1. **Разные директории**
   - Каждый бот в своей папке
   - Разные `.env` файлы
   - Разные `session.txt` файлы

2. **PM2 процессы**
   - Каждый бот с уникальным именем: `pm2 start index.js --name bot1`
   - Изолированные процессы

3. **Systemd сервисы**
   - Разные имена сервисов: `autoposting-bot.service`, `other-bot.service`
   - Разные unit файлы

4. **Порты**
   - Боты не используют сетевые порты (только исходящие соединения к Telegram)

### Рекомендации:

1. **Используйте разные директории:**
```bash
/opt/autoposting-bot/
/opt/other-bot/
```

2. **Используйте разные имена в PM2:**
```bash
pm2 start /opt/autoposting-bot/index.js --name autoposting-bot
pm2 start /opt/other-bot/index.js --name other-bot
```

3. **Используйте разные имена systemd сервисов:**
```bash
autoposting-bot.service
other-bot.service
```

## Управление ботом

### PM2 команды:
```bash
pm2 start autoposting-bot      # Запуск
pm2 stop autoposting-bot       # Остановка
pm2 restart autoposting-bot    # Перезапуск
pm2 delete autoposting-bot     # Удаление из PM2
pm2 logs autoposting-bot       # Просмотр логов
pm2 monit                      # Мониторинг
```

### Systemd команды:
```bash
sudo systemctl start autoposting-bot
sudo systemctl stop autoposting-bot
sudo systemctl restart autoposting-bot
sudo systemctl status autoposting-bot
```

## Обновление бота

```bash
cd /opt/autoposting-bot
git pull
npm install
pm2 restart autoposting-bot  # или systemctl restart autoposting-bot
```

## Мониторинг и логи

### PM2:
```bash
pm2 logs autoposting-bot --lines 100
pm2 monit
```

### Systemd:
```bash
sudo journalctl -u autoposting-bot -f
sudo journalctl -u autoposting-bot --since "1 hour ago"
```

## Безопасность

1. **Ограничьте доступ к .env файлу:**
```bash
chmod 600 .env
```

2. **Ограничьте доступ к session.txt:**
```bash
chmod 600 session.txt
```

3. **Используйте firewall:**
```bash
sudo ufw allow ssh
sudo ufw enable
```

4. **Регулярные обновления:**
```bash
sudo apt update && sudo apt upgrade -y
```

## Устранение неполадок

### Бот не запускается:
1. Проверьте логи: `pm2 logs` или `journalctl -u autoposting-bot`
2. Проверьте .env файл
3. Проверьте права доступа к файлам
4. Проверьте подключение к интернету

### Бот падает:
1. Проверьте логи на ошибки
2. Проверьте доступность Telegram API
3. Проверьте валидность session.txt

### Конфликты с другими ботами:
1. Убедитесь, что используются разные директории
2. Убедитесь, что разные имена в PM2/systemd
3. Проверьте, что разные .env файлы

