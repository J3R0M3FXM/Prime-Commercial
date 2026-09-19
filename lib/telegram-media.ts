// lib/telegram-media.ts
// Helper library for interacting with Telegram Bot API for media storage and streaming

export interface TelegramFileResult {
  file_id: string;
  file_unique_id: string;
  file_size?: number;
  file_path?: string;
}

export interface TelegramVideoUploadResult {
  success: boolean;
  fileId?: string;
  fileUniqueId?: string;
  duration?: number;
  width?: number;
  height?: number;
  fileSize?: number;
  messageId?: number;
  chatId?: string | number;
  thumbnailFileId?: string;
  error?: string;
}

export function getTelegramBotToken(): string {
  return (
    process.env.TELEGRAM_BOT_TOKEN ||
    process.env.BOT_TOKEN ||
    process.env.TELEGRAM_TOKEN ||
    ''
  ).trim();
}

export function getTelegramStorageChatId(): string {
  return (
    process.env.TELEGRAM_STORAGE_CHAT_ID ||
    process.env.TELEGRAM_CHAT_ID ||
    process.env.CHAT_ID ||
    process.env.TELEGRAM_CHANNEL_ID ||
    process.env.ADMIN_TELEGRAM_USER_ID ||
    process.env.STORAGE_CHAT_ID ||
    ''
  ).trim();
}

/**
 * Upload a video buffer or file to Telegram via sendVideo
 */
export async function uploadVideoToTelegram(
  fileBuffer: Buffer,
  fileName: string,
  options: {
    caption?: string;
    duration?: number;
    width?: number;
    height?: number;
    chatId?: string | number;
  } = {}
): Promise<TelegramVideoUploadResult> {
  const token = getTelegramBotToken();
  if (!token) {
    return { success: false, error: 'TELEGRAM_BOT_TOKEN is not configured in server environment' };
  }

  const targetChatId = options.chatId || getTelegramStorageChatId();
  if (!targetChatId) {
    return {
      success: false,
      error: 'No target Telegram Chat/Channel ID found. Set TELEGRAM_STORAGE_CHAT_ID or ADMIN_TELEGRAM_USER_ID in settings.'
    };
  }

  try {
    const formData = new FormData();
    formData.append('chat_id', String(targetChatId));
    formData.append('supports_streaming', 'true');
    if (options.caption) {
      formData.append('caption', options.caption.slice(0, 1024));
    }
    if (options.duration) {
      formData.append('duration', String(options.duration));
    }
    if (options.width) {
      formData.append('width', String(options.width));
    }
    if (options.height) {
      formData.append('height', String(options.height));
    }

    const uint8Array = new Uint8Array(fileBuffer);
    const blob = new Blob([uint8Array], { type: 'video/mp4' });
    formData.append('video', blob, fileName || 'video.mp4');

    const res = await fetch(`https://api.telegram.org/bot${token}/sendVideo`, {
      method: 'POST',
      body: formData,
    });

    const data = await res.json();
    if (!res.ok || !data.ok) {
      return {
        success: false,
        error: data.description || `Telegram API responded with code ${res.status}`
      };
    }

    const videoMsg = data.result;
    const videoData = videoMsg.video || videoMsg.document;

    return {
      success: true,
      fileId: videoData?.file_id,
      fileUniqueId: videoData?.file_unique_id,
      duration: videoData?.duration || options.duration || 0,
      width: videoData?.width || options.width || 0,
      height: videoData?.height || options.height || 0,
      fileSize: videoData?.file_size || fileBuffer.length,
      messageId: videoMsg.message_id,
      chatId: videoMsg.chat?.id || targetChatId,
      thumbnailFileId: videoData?.thumbnail?.file_id,
    };
  } catch (err: any) {
    console.error('Error uploading video to Telegram:', err);
    return { success: false, error: err.message || 'Failed to upload video to Telegram' };
  }
}

/**
 * Retrieve the file path from Telegram using getFile
 */
export async function getTelegramFilePath(fileId: string): Promise<{ success: boolean; filePath?: string; fileSize?: number; error?: string }> {
  const token = getTelegramBotToken();
  if (!token) {
    return { success: false, error: 'TELEGRAM_BOT_TOKEN is missing' };
  }

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/getFile?file_id=${encodeURIComponent(fileId)}`);
    const data = await res.json();
    if (!res.ok || !data.ok) {
      return { success: false, error: data.description || 'Failed to retrieve file from Telegram' };
    }

    return {
      success: true,
      filePath: data.result.file_path,
      fileSize: data.result.file_size,
    };
  } catch (err: any) {
    return { success: false, error: err.message || 'Network error retrieving Telegram file' };
  }
}

/**
 * Build the direct download/stream URL for Telegram file path
 */
export function getTelegramDownloadUrl(filePath: string): string {
  const token = getTelegramBotToken();
  return `https://api.telegram.org/file/bot${token}/${filePath}`;
}
