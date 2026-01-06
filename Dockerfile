# Dockerfile для автопостинг бота
FROM node:18-alpine

# Установка рабочей директории
WORKDIR /app

# Копирование package файлов
COPY package*.json ./

# Установка зависимостей
RUN npm ci --only=production

# Копирование исходного кода
COPY . .

# Создание директории для логов
RUN mkdir -p logs

# Пользователь для безопасности (не root)
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001
USER nodejs

# Запуск приложения
CMD ["node", "index.js"]

