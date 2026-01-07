import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/index.js";
import input from "input";
import dotenv from "dotenv";
import fs from "fs";
import crypto from "crypto";

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
const postedContentHashes = new Set();

// Файл для сохранения хешей отправленных сообщений
const POSTED_HASHES_FILE = "posted_hashes.json";

// Загрузка сохраненных хешей при старте
function loadPostedHashes() {
  try {
    if (fs.existsSync(POSTED_HASHES_FILE)) {
      const data = fs.readFileSync(POSTED_HASHES_FILE, "utf-8");
      const hashes = JSON.parse(data);
      hashes.forEach(hash => postedContentHashes.add(hash));
      console.log(`📋 Загружено ${hashes.length} хешей отправленных сообщений`);
    }
  } catch (error) {
    console.error(`⚠️  Ошибка при загрузке хешей:`, error.message);
  }
}

// Сохранение хешей в файл
function savePostedHash(hash) {
  try {
    postedContentHashes.add(hash);
    const hashesArray = Array.from(postedContentHashes);
    // Ограничиваем размер файла (последние 10000 хешей)
    const limitedHashes = hashesArray.slice(-10000);
    fs.writeFileSync(POSTED_HASHES_FILE, JSON.stringify(limitedHashes, null, 2));
  } catch (error) {
    console.error(`⚠️  Ошибка при сохранении хеша:`, error.message);
  }
}

// Функция для проверки существующих сообщений в целевом канале
async function checkExistingMessagesInChannel() {
  try {
    console.log("🔍 Проверяю существующие сообщения в целевом канале...");
    const messages = await client.getMessages(TARGET_CHANNEL_ID, {
      limit: 100, // Проверяем последние 100 сообщений
    });

    let foundHashes = 0;
    for (const msg of messages) {
      const hash = createContentHash(msg);
      if (hash && !postedContentHashes.has(hash)) {
        postedContentHashes.add(hash);
        foundHashes++;
      }
    }

    if (foundHashes > 0) {
      console.log(`✅ Найдено ${foundHashes} существующих сообщений в канале`);
      // Сохраняем найденные хеши
      const hashesArray = Array.from(postedContentHashes);
      const limitedHashes = hashesArray.slice(-10000);
      fs.writeFileSync(POSTED_HASHES_FILE, JSON.stringify(limitedHashes, null, 2));
    } else {
      console.log(`✅ Дубликатов в канале не найдено`);
    }
  } catch (error) {
    console.error(`⚠️  Ошибка при проверке существующих сообщений:`, error.message);
  }
}

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

// Функция для создания уникального хеша из содержимого сообщения
function createContentHash(message) {
  const text = getMessageText(message) || "";
  const cleanedText = cleanTextFromLinks(text).toLowerCase().trim();

  let mediaId = "";
  if (message.media && !message.media.className?.includes("MessageMediaEmpty")) {
    // Пытаемся получить уникальный ID медиа
    try {
      if (message.media.photo) {
        // Для фото используем file_id или photo_id
        mediaId = message.media.photo.id?.toString() || "";
      } else if (message.media.document) {
        // Для документов используем file_id
        mediaId = message.media.document.id?.toString() || "";
      } else if (message.media.video) {
        // Для видео
        mediaId = message.media.video.id?.toString() || "";
      }

      // Если есть file_unique_id, используем его (более надежно)
      if (message.media.fileUniqueId) {
        mediaId = message.media.fileUniqueId;
      }
    } catch (e) {
      // Если не удалось получить ID медиа, используем className
      mediaId = message.media.className || "";
    }
  }

  // Создаем хеш из текста и медиа
  const contentString = `${cleanedText}|${mediaId}`;
  return crypto.createHash("md5").update(contentString).digest("hex");
}

// Функция для форматирования текста с добавлением ссылки внизу
function formatTextWithFooter(originalText) {
  // Очищаем текст от ссылок
  let cleanedText = cleanTextFromLinks(originalText);

  // Формируем HTML ссылку для футера
  const footerLink = `<a href="${FOOTER_LINK_URL}">${FOOTER_LINK_TEXT}</a>`;

  // Если текст пустой, возвращаем только футер
  if (!cleanedText || cleanedText.trim() === '') {
    return `${FOOTER_TEXT}${footerLink}`;
  }

  // Добавляем футер внизу с HTML ссылкой (без пробела между текстом и ссылкой)
  return `${cleanedText}\n\n${FOOTER_TEXT}${footerLink}`;
}

// Функция для создания нового сообщения с копированием медиа и текста
async function forwardMessage(message, sourceChannel) {
  try {
    const messageId = message.id;
    const messageKey = `${sourceChannel}_${messageId}`;

    // Проверка, не было ли уже отправлено по ID сообщения
    if (postedMessages.has(messageKey)) {
      return;
    }

    const originalText = getMessageText(message);

    // Создаем хеш содержимого для проверки дубликатов
    const contentHash = createContentHash(message);

    // Проверка на дубликат по содержимому
    if (postedContentHashes.has(contentHash)) {
      console.log(`⏭️  Пропущено (дубликат по содержимому): ${originalText ? originalText.substring(0, 50) + "..." : "медиа"}`);
      return;
    }

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
        // Используем медиа напрямую из исходного сообщения (без скачивания)
        // Это создаст новое сообщение без метки "Переслано"
        await client.sendFile(TARGET_CHANNEL_ID, {
          file: message.media,
          caption: formattedText,
          parseMode: "html", // Используем HTML для ссылок (более надежно)
        });

        const mediaType = message.media.className || "медиа";
        console.log(`✅ Отправлено (${mediaType}) из ${sourceChannel}: ${originalText ? originalText.substring(0, 50) + "..." : "медиа без текста"}`);
      } catch (mediaError) {
        console.error(`❌ Ошибка при обработке медиа:`, mediaError.message);
        // Если не удалось отправить с медиа напрямую, пробуем скачать
        try {
          const mediaBuffer = await client.downloadMedia(message, {
            workers: 1,
          });
          await client.sendFile(TARGET_CHANNEL_ID, {
            file: mediaBuffer,
            caption: formattedText,
            parseMode: "html",
          });
          console.log(`✅ Отправлено (медиа скачано) из ${sourceChannel}: ${originalText ? originalText.substring(0, 50) + "..." : "медиа без текста"}`);
        } catch (downloadError) {
          // Если и скачивание не помогло, отправляем только текст
          if (formattedText) {
            try {
              await client.sendMessage(TARGET_CHANNEL_ID, {
                message: formattedText,
                parseMode: "html",
              });
              console.log(`✅ Отправлено (только текст, медиа не удалось) из ${sourceChannel}: ${originalText.substring(0, 50)}...`);
            } catch (textError) {
              // Если HTML не работает, отправляем без форматирования (убираем HTML теги)
              await client.sendMessage(TARGET_CHANNEL_ID, {
                message: formattedText.replace(/<a[^>]+href=["']([^"']+)["'][^>]*>([^<]+)<\/a>/gi, '$2'),
              });
              console.log(`✅ Отправлено (только текст, без HTML) из ${sourceChannel}: ${originalText.substring(0, 50)}...`);
            }
          }
        }
      }
    } else {
      // Только текст без медиа
      if (formattedText) {
        try {
          await client.sendMessage(TARGET_CHANNEL_ID, {
            message: formattedText,
            parseMode: "html",
          });
          console.log(`✅ Отправлено (текст) из ${sourceChannel}: ${originalText.substring(0, 50)}...`);
        } catch (textError) {
          // Если HTML не работает, отправляем без форматирования (убираем HTML теги)
          await client.sendMessage(TARGET_CHANNEL_ID, {
            message: formattedText.replace(/<a[^>]+href=["']([^"']+)["'][^>]*>([^<]+)<\/a>/gi, '$2'),
          });
          console.log(`✅ Отправлено (текст, без HTML) из ${sourceChannel}: ${originalText.substring(0, 50)}...`);
        }
      }
    }

    // Сохраняем информацию об отправленном сообщении
    postedMessages.add(messageKey);
    savePostedHash(contentHash);

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

// Функция для нормализации ID канала (приведение к единому формату)
function normalizeChannelId(channelId) {
  if (!channelId) return null;

  // Если это username (начинается с @)
  if (channelId.startsWith('@')) {
    return channelId.toLowerCase();
  }

  // Если это числовой ID
  if (channelId.startsWith('-100')) {
    return channelId;
  }

  // Если это просто число, добавляем префикс -100
  if (/^-?\d+$/.test(channelId)) {
    return channelId.startsWith('-') ? channelId : `-100${channelId}`;
  }

  return channelId;
}

// Функция для получения реального ID канала из сообщения
async function getChannelIdFromMessage(message) {
  try {
    if (!message || !message.peerId) return null;

    // Получаем информацию о чате
    const chat = await message.getChat();

    if (chat.username) {
      return `@${chat.username}`.toLowerCase();
    }

    if (chat.id) {
      const chatIdStr = chat.id.toString();
      return chatIdStr.startsWith('-100') ? chatIdStr : `-100${chatIdStr}`;
    }

    return null;
  } catch (error) {
    return null;
  }
}

// Функция для получения сообщения с медиа из канала (с учетом смещения)
async function getMessageFromChannel(channelId, offset = 0) {
  try {
    // Нормализуем ID канала
    const normalizedChannelId = normalizeChannelId(channelId);

    if (offset === 0) {
      console.log(`📡 Проверяю последнее сообщение в канале: ${channelId} (нормализован: ${normalizedChannelId})`);
    } else {
      console.log(`📡 Проверяю сообщение #${offset + 1} в канале: ${channelId} (нормализован: ${normalizedChannelId})`);
    }

    // Получаем entity канала для проверки доступа
    let channelEntity;
    try {
      channelEntity = await client.getEntity(normalizedChannelId);
      if (offset === 0) {
        console.log(`✅ Канал найден: ${channelEntity.title || channelEntity.username || normalizedChannelId}`);
      }
    } catch (entityError) {
      console.error(`❌ Не удалось получить доступ к каналу ${normalizedChannelId}:`, entityError.message);
      return null;
    }

    // Получаем сообщения с учетом смещения (берем больше, чтобы найти с медиа)
    const messages = await client.getMessages(normalizedChannelId, {
      limit: 50, // Берем до 50, чтобы найти сообщение с медиа
    });

    if (messages && messages.length > 0) {
      // Ищем сообщение с медиа, начиная с позиции offset
      let checkedCount = 0;
      for (let i = offset; i < messages.length && checkedCount < 10; i++) {
        const message = messages[i];
        checkedCount++;

        // Проверяем, что сообщение действительно из нужного канала
        const messageChannelId = await getChannelIdFromMessage(message);
        const normalizedMessageChannelId = normalizeChannelId(messageChannelId);

        if (normalizedMessageChannelId !== normalizedChannelId) {
          continue;
        }

        // Проверяем наличие медиа (фото, видео, документ)
        const hasMedia = message.media && !message.media.className?.includes("MessageMediaEmpty");

        if (hasMedia) {
          // Проверяем, что это фото или видео (не только документ)
          const mediaType = message.media.className || "";

          // Принимаем: фото, видео, документы (GIF, видео файлы)
          if (mediaType.includes("Photo") ||
              mediaType.includes("Video") ||
              mediaType.includes("Document")) {

            // Проверяем на дубликат (по хешу содержимого и ID)
            const contentHash = createContentHash(message);
            const messageKey = `${normalizedChannelId}_${message.id}`;

            // Проверяем по ID сообщения
            if (postedMessages.has(messageKey)) {
              // Это дубликат, продолжаем поиск
              continue;
            }

            // Проверяем по хешу содержимого
            if (postedContentHashes.has(contentHash)) {
              // Это дубликат, продолжаем поиск
              continue;
            }

            // Нашли новое сообщение с медиа, которое еще не публиковалось
            console.log(`✅ Найдено новое сообщение с медиа (${mediaType}) из канала ${normalizedChannelId}, ID: ${message.id}, позиция: ${i}`);
            return { message, nextOffset: i + 1 };
          }
        }
      }

      // Не нашли новое сообщение с медиа в этом диапазоне
      if (offset === 0) {
        console.log(`⚠️  Последнее сообщение в канале ${normalizedChannelId} уже опубликовано или не содержит медиа`);
      } else {
        console.log(`⚠️  Не найдено новых сообщений с медиа в канале ${normalizedChannelId} начиная с позиции ${offset}`);
      }
      return null;
    }

    console.log(`⚠️  В канале ${normalizedChannelId} нет сообщений`);
    return null;
  } catch (error) {
    console.error(`❌ Ошибка при получении сообщения из канала ${channelId}:`, error.message);
    return null;
  }
}

// Основная функция
async function main() {
  console.log("🚀 Запуск бота автопостинга...\n");

  // Загружаем сохраненные хеши отправленных сообщений
  loadPostedHashes();

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

  // Проверяем существующие сообщения в целевом канале для предотвращения дубликатов
  await checkExistingMessagesInChannel();

  console.log(`📋 Мониторинг каналов: ${SOURCE_CHANNELS.join(", ")}\n`);
  console.log(`⏱️  Задержка между постами: ${POST_DELAY} секунд\n`);

  if (KEYWORDS_FILTER.length > 0) {
    console.log(`🔍 Фильтр ключевых слов: ${KEYWORDS_FILTER.join(", ")}\n`);
  }

  if (EXCLUDE_WORDS.length > 0) {
    console.log(`🚫 Исключающие слова: ${EXCLUDE_WORDS.join(", ")}\n`);
  }

  console.log("🎯 Бот запущен и работает...\n");
  console.log("📝 Режим работы: поочередная обработка каналов, 1 пост за раз\n");

  // Нормализуем все ID каналов-источников
  const normalizedSourceChannels = SOURCE_CHANNELS.map(ch => normalizeChannelId(ch));
  console.log(`📋 Нормализованные каналы-источники: ${normalizedSourceChannels.join(", ")}\n`);

  // Функция для поочередной обработки каналов
  async function processChannelsSequentially() {
    let currentChannelIndex = 0;
    // Храним смещение для каждого канала (сколько сообщений уже проверили)
    const channelOffsets = new Map();

    while (true) {
      // Получаем текущий канал по кругу
      const channelId = SOURCE_CHANNELS[currentChannelIndex];
      const normalizedChannelId = normalizedSourceChannels[currentChannelIndex];

      // Получаем текущее смещение для этого канала (или 0, если еще не проверяли)
      const currentOffset = channelOffsets.get(normalizedChannelId) || 0;

      try {
        console.log(`\n🔍 Проверяю канал: ${channelId} (нормализован: ${normalizedChannelId})`);

        // Получаем сообщение с медиа из канала (с учетом смещения)
        const result = await getMessageFromChannel(channelId, currentOffset);

        if (result && result.message) {
          const message = result.message;

          // Дополнительная проверка: убеждаемся, что сообщение из нужного канала
          const messageChannelId = await getChannelIdFromMessage(message);
          const normalizedMessageChannelId = normalizeChannelId(messageChannelId);

          if (normalizedMessageChannelId !== normalizedChannelId) {
            console.error(`❌ ОШИБКА: Сообщение из канала ${normalizedMessageChannelId}, а ожидался ${normalizedChannelId}! Пропускаю.`);
            // Увеличиваем смещение для этого канала
            channelOffsets.set(normalizedChannelId, result.nextOffset || currentOffset + 1);
          } else {
            console.log(`✅ Подтверждено: новое сообщение из канала ${normalizedChannelId}, отправляю...`);
            // Отправляем сообщение (функция сама сохранит хеш)
            await forwardMessage(message, normalizedChannelId);
            // Обновляем смещение для этого канала (следующий раз начнем с этой позиции)
            channelOffsets.set(normalizedChannelId, result.nextOffset || currentOffset + 1);
          }
        } else {
          // Не нашли новое сообщение, увеличиваем смещение для следующего прохода
          channelOffsets.set(normalizedChannelId, currentOffset + 1);
          console.log(`⏭️  Сообщение из канала ${normalizedChannelId} уже опубликовано или не содержит медиа, перехожу к следующему каналу...`);
        }
      } catch (error) {
        console.error(`❌ Ошибка при обработке канала ${normalizedChannelId}:`, error.message);
        // При ошибке тоже увеличиваем смещение, чтобы не застрять
        channelOffsets.set(normalizedChannelId, currentOffset + 1);
      }

      // Переходим к следующему каналу
      currentChannelIndex = (currentChannelIndex + 1) % SOURCE_CHANNELS.length;

      // Если прошли все каналы, сбрасываем смещения для нового цикла (начинаем с более старых сообщений)
      if (currentChannelIndex === 0) {
        console.log(`\n🔄 Завершен цикл по всем каналам, начинаю новый цикл с более старыми сообщениями...\n`);
      }

      // Небольшая задержка перед проверкой следующего канала (POST_DELAY уже учтен в forwardMessage)
      await new Promise(resolve => setTimeout(resolve, 2000)); // 2 секунды между проверками каналов
    }
  }

  // Запускаем поочередную обработку каналов
  processChannelsSequentially().catch(console.error);
}

// Обработка ошибок
process.on("unhandledRejection", (error) => {
  console.error("❌ Необработанная ошибка:", error);
});

// Запуск
main().catch(console.error);

