import { GoogleGenerativeAI } from '@google/generative-ai';
import { LRUCache } from 'lru-cache';
import { getLanguageName } from '../../shared/types.js';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

// 翻譯快取：最多 500 筆，TTL 1 小時
const translationCache = new LRUCache<string, string>({
  max: 500,
  ttl: 1000 * 60 * 60,
});

async function attemptTranslation(
  text: string,
  sourceLangName: string,
  targetLangName: string
): Promise<string> {
  const systemPrompt = `You are a real-time chat translator. Rules:
1. Translate from ${sourceLangName} to ${targetLangName}
2. Keep the tone natural and conversational
3. Preserve emojis, numbers, and proper nouns as-is
4. If already in target language, return unchanged
5. Return ONLY the translated text, no explanations, no quotes
6. For ambiguous phrases, use the most common conversational meaning`;

  const model = genAI.getGenerativeModel({
    model: 'gemini-2.0-flash',
    systemInstruction: systemPrompt,
  });

  // 5 秒逾時
  const result = await Promise.race([
    model.generateContent(text),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Translation timeout')), 5000)
    ),
  ]);

  return result.response.text().trim();
}

export async function translate(
  text: string,
  sourceLang: string,
  targetLang: string
): Promise<string> {
  // 相同語言不需要翻譯
  if (sourceLang === targetLang) return text;

  // 空白文字直接回傳
  if (!text || !text.trim()) return text;

  // 查快取
  const cacheKey = `${sourceLang}:${targetLang}:${text}`;
  const cached = translationCache.get(cacheKey);
  if (cached) return cached;

  const sourceLangName = getLanguageName(sourceLang);
  const targetLangName = getLanguageName(targetLang);

  try {
    const translated = await attemptTranslation(text, sourceLangName, targetLangName);
    translationCache.set(cacheKey, translated);
    return translated;
  } catch (error) {
    console.error('[Translator] First attempt failed:', error);

    // 自動重試 1 次
    try {
      const translated = await attemptTranslation(text, sourceLangName, targetLangName);
      translationCache.set(cacheKey, translated);
      return translated;
    } catch (retryError) {
      console.error('[Translator] Retry also failed, returning original text:', retryError);
      // 重試也失敗，回傳原文而非 null
      return text;
    }
  }
}
