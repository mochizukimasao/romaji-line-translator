const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta';

const PROTECTED_TOKEN = /https?:\/\/\S+|[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}|[@#][\w-]+|\b(?:AI|OK|LINE|Zoom|Google|ChatGPT)\b|\b\d+(?:[/:.-]\d+)*\b/g;
const PRODUCT_ALIASES = new Map([
  ['AI', ['AI', 'エーアイ']],
  ['OK', ['OK', 'オーケー', 'オーケイ']],
  ['LINE', ['LINE', 'ライン']],
  ['Zoom', ['Zoom', 'ズーム']],
  ['Google', ['Google', 'グーグル']],
  ['ChatGPT', ['ChatGPT', 'チャットジーピーティー']]
]);
const JAPANESE_RUN = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}ー]+/gu;

export function buildTranslatePrompt(mode, items) {
  const goal = mode === 'japanese'
    ? '日本語の意味、発言内容、固有名詞、数字、語調を保ったまま、助詞・句読点・明白な語順の崩れだけを最小限修正する。'
    : 'ローマ字を文脈に応じた自然な漢字かな交じり文へ変換し、意味、語順、語調、丁寧さ、断定の強さを変えない。';
  return [
    'あなたは正確な日本語変換エディタです。',
    `目的: ${goal}`,
    '要約、説明、情報追加、評価、装飾的な言い換えをしない。入力の順序と項目数を必ず保つ。',
    'URL、メールアドレス、@mention、#hashtag、数字、日時、元入力の日本語、LINE・Zoom・Google・ChatGPTなどの製品名・略語、人名・地名・組織名は勝手に別語へ置換しない。',
    '出力にLatin文字を残す場合は、元入力にある保護対象トークンと完全一致するものだけ許可する。',
    mode === 'romaji' ? '安全に断定できない固有名詞は原表記またはカタカナを優先し、ASCII句読点は必要に応じて日本語句読点へ正規化する。' : 'だ・である調とです・ます調を相互変換しない。内容を削除・統合しない。',
    'JSONオブジェクト {"results":[{"id":"入力id","output":"変換結果"}]} だけを返す。全項目を同じ順序で返す。',
    '',
    JSON.stringify({ mode, items: items.map(({ id, text }) => ({ id, text })) })
  ].join('\n');
}

function safeString(value) { return String(value ?? ''); }

export function parseResponse(text) {
  const parsed = JSON.parse(text);
  const results = Array.isArray(parsed) ? parsed : parsed?.results;
  if (!Array.isArray(results)) throw new Error('invalid_json');
  return results.map((item) => typeof item === 'string' ? { output: item } : item);
}

export function validateOutput(mode, source, output) {
  const value = safeString(output).trimEnd();
  if (!value.trim()) return false;
  if (mode === 'japanese' && value.replace(/\s/g, '').length < source.replace(/\s/g, '').length * 0.35) return false;
  if (mode === 'romaji') {
    let remainingJapanese = value;
    for (const run of source.match(JAPANESE_RUN) || []) {
      if (!remainingJapanese.includes(run)) return false;
      remainingJapanese = remainingJapanese.replace(run, '');
    }
  }
  const protectedTokens = source.match(PROTECTED_TOKEN) || [];
  let remaining = value;
  for (const token of protectedTokens) {
    const alternatives = PRODUCT_ALIASES.get(token) || [token];
    const matched = alternatives.find((candidate) => remaining.includes(candidate));
    if (!matched) return false;
    remaining = remaining.replace(matched, '');
  }
  if (mode === 'romaji' && /[A-Za-z]/.test(value)) {
    if (/[A-Za-z]/.test(remaining)) return false;
  }
  return mode === 'japanese' ||
    /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u.test(value) ||
    protectedTokens.length > 0;
}

async function requestBatch(items, { apiKey, model, mode }) {
  if (!apiKey) throw new Error('configuration');
  const response = await fetch(`${GEMINI_API_URL}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: buildTranslatePrompt(mode, items) }] }], generationConfig: { temperature: 0, maxOutputTokens: 4096, responseMimeType: 'application/json' } })
  });
  if (!response.ok) throw new Error('service');
  const data = await response.json().catch(() => { throw new Error('invalid_json'); });
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('invalid_json');
  const results = parseResponse(text);
  if (results.length !== items.length) throw new Error('count_mismatch');
  const byId = new Map(results.map((result) => [result.id, result]));
  return items.map((item) => {
    const result = byId.get(item.id);
    if (!result || !validateOutput(mode, item.text, result.output)) throw new Error('validation');
    return { id: item.id, status: 'ok', output: safeString(result.output).trimEnd(), errorCode: null };
  });
}

function errorCode(error) { return ['configuration', 'service', 'invalid_json', 'count_mismatch', 'validation'].includes(error?.message) ? error.message : 'service'; }

export async function translateItems(items, { apiKey, model = 'gemini-3.5-flash', mode = 'romaji' } = {}) {
  const results = [];
  for (let index = 0; index < items.length; index += 12) {
    const chunk = items.slice(index, index + 12);
    try {
      results.push(...await requestBatch(chunk, { apiKey, model, mode }));
    } catch (batchError) {
      for (const item of chunk) {
        try {
          results.push(...await requestBatch([item], { apiKey, model, mode }));
        } catch (itemError) {
          results.push({ id: item.id, status: 'error', output: '', errorCode: errorCode(itemError || batchError) });
        }
      }
    }
  }
  return results;
}
