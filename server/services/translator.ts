import { GoogleGenerativeAI } from '@google/generative-ai';
import { getLanguageName } from '../../shared/types.js';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

export async function translate(
  text: string,
  sourceLang: string,
  targetLang: string
): Promise<string | null> {
  // 相同語言不需要翻譯
  if (sourceLang === targetLang) return text;

  // 空白文字直接回傳
  if (!text || !text.trim()) return text;

  const sourceLangName = getLanguageName(sourceLang);
  const targetLangName = getLanguageName(targetLang);

  const systemPrompt = `You are a real-time chat translator. Rules:
1. Translate from ${sourceLangName} to ${targetLangName}
2. Keep the tone natural and conversational
3. Preserve emojis, numbers, and proper nouns as-is
4. If already in target language, return unchanged
5. Return ONLY the translated text, no explanations, no quotes
6. For ambiguous phrases, use the most common conversational meaning`;

  try {
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

    const translated = result.response.text().trim();
    return translated;
  } catch (error) {
    console.error('[Translator] Error:', error);
    return null;
  }
}
