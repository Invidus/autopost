import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/index.js";
import input from "input";
import dotenv from "dotenv";
import fs from "fs";

dotenv.config();

// Проверка наличия .env файла
if (!fs.existsSync(".env")) {
  console.error("❌ Файл .env не найден! Скопируйте env.example в .env и заполните данные.");
  process.exit(1);
}

const API_ID = parseInt(process.env.API_ID);
const API_HASH = process.env.API_HASH;
const TARGET_CHANNEL_ID = process.env.TARGET_CHANNEL_ID;
const SOURCE_CHANNELS = process.env.SOURCE_CHANNELS.split(",").map(s => s.trim());
const POST_DELAY = parseInt(process.env.POST_DELAY) || 60;
const KEYWORDS_FILTER = process.env.KEYWORDS_FILTER
  ? process.env.KEYWORDS_FILTER.split(",").map(s => s.trim().toLowerCase())
  : [];
const EXCLUDE_WORDS = process.env.EXCLUDE_WORDS
  ? process.env.EXCLUDE_WORDS.split(",").map(s => s.trim().toLowerCase())
  : [];
const FOOTER_TEXT = process.env.FOOTER_TEXT || "Смотреть больше приколов 👉 ";
const FOOTER_LINK_TEXT = process.env.FOOTER_LINK_TEXT || "кликай";
const FOOTER_LINK_URL = process.env.FOOTER_LINK_URL || "https://t.me/memeitochka";

// Проверка обязательных переменных
if (!API_ID || !API_HASH || !TARGET_CHANNEL_ID || !SOURCE_CHANNELS.length) {
  console.error("❌ Заполните все обязательные поля в .env файле!");
  process.exit(1);
}

// Сессия для сохранения авторизации
const stringSession = new StringSession(
  fs.existsSync("session.txt") ? fs.readFileSync("session.txt", "utf-8") : ""
);

const client = new TelegramClient(stringSession, API_ID, API_HASH, {
  connectionRetries: 5,
});

// Хранилище для отслеживания уже отправленных сообщений
const postedMessages = new Set();

// Функция для проверки ключевых слов
function matchesFilter(text) {
  if (!text) return KEYWORDS_FILTER.length === 0;

  const lowerText = text.toLowerCase();

  // Проверка исключающих слов
  if (EXCLUDE_WORDS.length > 0) {
    for (const word of EXCLUDE_WORDS) {
      if (lowerText.includes(word)) {
        return false;
      }
    }
  }

  // Если фильтр не задан, принимаем все
  if (KEYWORDS_FILTER.length === 0) {
    return true;
  }

  // Проверка ключевых слов
  for (const keyword of KEYWORDS_FILTER) {
    if (lowerText.includes(keyword)) {
      return true;
    }
  }

  return false;
}

// Функция для получения текста сообщения
function getMessageText(message) {
  if (message.text) return message.text;
  if (message.message) return message.message;
  return "";
}

// Функция для очистки текста от ссылок
function cleanTextFromLinks(text) {
  if (!text) return "";

  // Удаляем markdown ссылки [текст](url)
  text = text.replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1');

  // Удаляем HTML ссылки <a href="url">текст</a>
  text = text.replace(/<a[^>]+href=["']([^"']+)["'][^>]*>([^<]+)<\/a>/gi, '$2');

  // Удаляем простые URL (http://, https://, t.me/)
  text = text.replace(/https?:\/\/[^\s\)]+/gi, '');
  text = text.replace(/t\.me\/[^\s\)]+/gi, '');

  // Удаляем упоминания каналов @channel
  text = text.replace(/@[a-zA-Z0-9_]+/g, '');

  // Удаляем лишние пробелы (но сохраняем переносы строк)
  text = text.replace(/[ \t]+/g, ' ');
  text = text.replace(/\n\s*\n\s*\n/g, '\n\n'); // Максимум 2 переноса подряд
  text = text.trim();

  return text;
}

// Функция для форматирования текста с добавлением ссылки внизу
function formatTextWithFooter(originalText) {
  // Очищаем текст от ссылок
  let cleanedText = cleanTextFromLinks(originalText);

  // Если текст пустой, возвращаем только футер
  if (!cleanedText || cleanedText.trim() === '') {
    return `${FOOTER_TEXT}[${FOOTER_LINK_TEXT}](${FOOTER_LINK_URL})`;
  }

  // Добавляем футер внизу с markdown ссылкой (без пробела между текстом и ссылкой)
  return `${cleanedText}\n\n${FOOTER_TEXT}[${FOOTER_LINK_TEXT}](${FOOTER_LINK_URL})`;
}

// Функция для создания нового сообщения с копированием медиа и текста
async function forwardMessage(message, sourceChannel) {
  try {
    const messageId = message.id;
    const messageKey = `${sourceChannel}_${messageId}`;

    // Проверка, не было ли уже отправлено
    if (postedMessages.has(messageKey)) {
      return;
    }

    const originalText = getMessageText(message);

    // Проверка фильтров (по оригинальному тексту)
    if (!matchesFilter(originalText)) {
      console.log(`⏭️  Пропущено (не соответствует фильтру): ${originalText.substring(0, 50)}...`);
      return;
    }

    // Форматируем текст: очищаем от ссылок и добавляем футер
    const formattedText = formatTextWithFooter(originalText);

    // Проверяем наличие медиа в сообщении
    const hasMedia = message.media && !message.media.className?.includes("MessageMediaEmpty");

    if (hasMedia) {
      try {
        // Скачиваем медиа в буфер
        const mediaBuffer = await client.downloadMedia(message, {
          workers: 1,
        });

        // Отправляем медиа с отформатированным текстом
        await client.sendFile(TARGET_CHANNEL_ID, {
          file: mediaBuffer,
          caption: formattedText,
          parseMode: "markdown", // Используем markdown для ссылок
        });

        const mediaType = message.media.className || "медиа";
        console.log(`✅ Отправлено (${mediaType}) из ${sourceChannel}: ${originalText ? originalText.substring(0, 50) + "..." : "медиа без текста"}`);
      } catch (mediaError) {
        console.error(`❌ Ошибка при обработке медиа:`, mediaError.message);
        // Если не удалось отправить с медиа, отправляем только текст
        if (formattedText) {
          try {
            await client.sendMessage(TARGET_CHANNEL_ID, {
              message: formattedText,
              parseMode: "markdown",
            });
            console.log(`✅ Отправлено (только текст, медиа не удалось) из ${sourceChannel}: ${originalText.substring(0, 50)}...`);
          } catch (textError) {
            // Если markdown не работает, отправляем без форматирования
            await client.sendMessage(TARGET_CHANNEL_ID, {
              message: formattedText.replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1'),
            });
            console.log(`✅ Отправлено (только текст, без markdown) из ${sourceChannel}: ${originalText.substring(0, 50)}...`);
          }
        }
      }
    } else {
      // Только текст без медиа
      if (formattedText) {
        try {
          await client.sendMessage(TARGET_CHANNEL_ID, {
            message: formattedText,
            parseMode: "markdown",
          });
          console.log(`✅ Отправлено (текст) из ${sourceChannel}: ${originalText.substring(0, 50)}...`);
        } catch (textError) {
          // Если markdown не работает, отправляем без форматирования
          await client.sendMessage(TARGET_CHANNEL_ID, {
            message: formattedText.replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1'),
          });
          console.log(`✅ Отправлено (текст, без markdown) из ${sourceChannel}: ${originalText.substring(0, 50)}...`);
        }
      }
    }

    postedMessages.add(messageKey);

    // Ограничение размера Set (чтобы не занимать много памяти)
    if (postedMessages.size > 10000) {
      const firstKey = postedMessages.values().next().value;
      postedMessages.delete(firstKey);
    }

    // Задержка между постами
    await new Promise(resolve => setTimeout(resolve, POST_DELAY * 1000));

  } catch (error) {
    console.error(`❌ Ошибка при отправке сообщения:`, error.message);
  }
}

// Функция для мониторинга канала
async function monitorChannel(channelId) {
  try {
    console.log(`👀 Начинаю мониторинг канала: ${channelId}`);

    // Получаем последние сообщения
    const messages = await client.getMessages(channelId, {
      limit: 10,
    });

    // Обрабатываем сообщения в обратном порядке (от старых к новым)
    for (const message of messages.reverse()) {
      await forwardMessage(message, channelId);
    }

    // Подписываемся на новые сообщения
    client.addEventHandler(async (event) => {
      const message = event.message;
      if (message && message.peerId && message.peerId.channelId) {
        const channel = await client.getEntity(message.peerId);
        if (channel.username === channelId.replace("@", "") ||
            channel.id.toString() === channelId.replace("-100", "")) {
          await forwardMessage(message, channelId);
        }
      }
    }, { chats: [channelId] });

  } catch (error) {
    console.error(`❌ Ошибка при мониторинге канала ${channelId}:`, error.message);
  }
}

// Основная функция
async function main() {
  console.log("🚀 Запуск бота автопостинга...\n");

  await client.start({
    phoneNumber: async () => await input.text("Введите номер телефона: "),
    password: async () => await input.text("Введите пароль (если есть): "),
    phoneCode: async () => await input.text("Введите код из Telegram: "),
    onError: (err) => console.log(err),
  });

  // Сохранение сессии
  const sessionString = client.session.save();
  fs.writeFileSync("session.txt", sessionString);
  console.log("✅ Сессия сохранена\n");

  // Получение информации о себе
  const me = await client.getMe();
  console.log(`✅ Авторизован как: ${me.firstName} ${me.lastName || ""} (@${me.username || "без username"})\n`);

  // Проверка доступа к целевому каналу
  try {
    const targetChannel = await client.getEntity(TARGET_CHANNEL_ID);
    console.log(`✅ Целевой канал: ${targetChannel.title || targetChannel.username || TARGET_CHANNEL_ID}\n`);
  } catch (error) {
    console.error(`❌ Ошибка доступа к целевому каналу ${TARGET_CHANNEL_ID}. Убедитесь, что бот добавлен как администратор!`);
    process.exit(1);
  }

  console.log(`📋 Мониторинг каналов: ${SOURCE_CHANNELS.join(", ")}\n`);
  console.log(`⏱️  Задержка между постами: ${POST_DELAY} секунд\n`);

  if (KEYWORDS_FILTER.length > 0) {
    console.log(`🔍 Фильтр ключевых слов: ${KEYWORDS_FILTER.join(", ")}\n`);
  }

  if (EXCLUDE_WORDS.length > 0) {
    console.log(`🚫 Исключающие слова: ${EXCLUDE_WORDS.join(", ")}\n`);
  }

  console.log("🎯 Бот запущен и работает...\n");

  // Мониторинг всех каналов-источников
  for (const channel of SOURCE_CHANNELS) {
    try {
      await monitorChannel(channel);
    } catch (error) {
      console.error(`❌ Не удалось подключиться к каналу ${channel}:`, error.message);
    }
  }

  // Обработка новых сообщений в реальном времени
  client.addEventHandler(async (event) => {
    const message = event.message;
    if (!message) return;

    try {
      const chat = await message.getChat();
      let chatId = null;

      if (chat.username) {
        chatId = `@${chat.username}`;
      } else if (chat.id) {
        // Для супергрупп и каналов ID начинается с -100
        const chatIdStr = chat.id.toString();
        chatId = chatIdStr.startsWith('-100') ? chatIdStr : `-100${chatIdStr}`;
      }

      if (chatId && (SOURCE_CHANNELS.includes(chatId) || SOURCE_CHANNELS.includes(`@${chat.username}`))) {
        await forwardMessage(message, chatId);
      }
    } catch (error) {
      // Игнорируем ошибки для сообщений не из отслеживаемых каналов
    }
  }, { chats: SOURCE_CHANNELS });
}

// Обработка ошибок
process.on("unhandledRejection", (error) => {
  console.error("❌ Необработанная ошибка:", error);
});

// Запуск
main().catch(console.error);

