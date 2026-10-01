import { buildTranslatePrompt, validateOutput } from './gemini.js';

export const DEFAULT_WORKERS_AI_MODEL = '@cf/google/gemma-4-26b-a4b-it';

const BATCH_SIZE = 8;
const BATCH_CHAR_LIMIT = 3000;

function createBatches(items) {
  const batches = [];
  let batch = [];
  let length = 0;
  for (const item of items) {
    if (batch.length && (batch.length >= BATCH_SIZE || length + item.text.length > BATCH_CHAR_LIMIT)) {
      batches.push(batch);
      batch = [];
      length = 0;
    }
    batch.push(item);
    length += item.text.length;
  }
  if (batch.length) batches.push(batch);
  return batches;
}

function parseModelResponse(value, depth = 0) {
  if (depth > 3) throw new Error('invalid_json');
  if (typeof value === 'string') {
    const normalized = value.trim().replace(/^```(?:json)?\s*/iu, '').replace(/\s*```$/u, '');
    return parseModelResponse(JSON.parse(normalized), depth + 1);
  }
  if (Array.isArray(value)) {
    return value.map((item) => typeof item === 'string' ? { output: item } : item);
  }
  if (value && typeof value === 'object') {
    if (Array.isArray(value.results)) return value.results.map((item) => typeof item === 'string' ? { output: item } : item);
    // Some chat models wrap the requested JSON in a `response` or `output` field.
    for (const key of ['response', 'output', 'content', 'text']) {
      if (value[key] !== undefined) return parseModelResponse(value[key], depth + 1);
    }
  }
  throw new Error('invalid_json');
}

function classifyWorkersAIError(error) {
  const status = Number(error?.status ?? error?.statusCode ?? error?.cause?.status ?? 0);
  const message = String(error?.message || '');
  const documentedCode = String(error?.code ?? error?.cause?.code ?? message.match(/\b(?:3003|3006|3007|3008|3023|3036|3040|3041|3042|5007|5016|5018|5035)\b/u)?.[0] ?? '');
  if (documentedCode === '3036') return 'rate_limit';
  if (documentedCode === '3040' || documentedCode === '3007' || documentedCode === '3008') return 'transient_service';
  if (documentedCode === '5016') return 'model_terms';
  if (documentedCode === '5035') return 'paid_plan_required';
  if (['3023', '3041', '5018'].includes(documentedCode)) return 'account_access';
  if (['5007', '3042'].includes(documentedCode)) return 'model_unavailable';
  if (['3003', '3006'].includes(documentedCode)) return 'request_invalid';
  const cloudflareCode = message.match(/\b(\d{4})\b/u)?.[1];
  if (cloudflareCode) return `cloudflare_${cloudflareCode}`;
  if (error?.name === 'TypeError') return 'ai_binding_error';
  if (error?.name === 'AbortError') return 'timeout';
  if (status === 408) return 'timeout';
  if (status === 429) return 'rate_limit';
  if ([400, 404].includes(status)) return 'model_unavailable';
  if (status === 403) return 'account_access';
  if (status >= 500) return 'transient_service';
  const normalizedMessage = message.toLowerCase();
  if (/daily allocation|quota|neurons/u.test(normalizedMessage)) return 'rate_limit';
  if (/agreement/u.test(normalizedMessage)) return 'model_terms';
  if (/no such model|invalid model/u.test(normalizedMessage)) return 'model_unavailable';
  if (/not allowed|binding/u.test(normalizedMessage)) return 'account_access';
  return 'service';
}

async function translateBatch(ai, items, mode, dictionary, model) {
  try {
    const response = await ai.run(model, {
      messages: [{ role: 'user', content: buildTranslatePrompt(mode, items, dictionary) }],
      temperature: 0,
      max_tokens: 4096
    });
    const parsed = parseModelResponse(response?.response ?? response?.output ?? response);
    const byId = new Map(parsed.filter((result) => typeof result.id === 'string').map((result) => [result.id, result]));
    return items.map((item, index) => {
      // Some hosted models omit or alter the echoed IDs; the prompt also requires
      // preserving item order, so use the corresponding position when counts match.
      const result = byId.get(item.id) || (parsed.length === items.length ? parsed[index] : undefined);
      const output = result?.output ?? result?.translation ?? result?.text ?? result?.converted;
      if (!validateOutput(mode, item.text, output, dictionary)) {
        return { id: item.id, status: 'error', output: '', errorCode: 'validation' };
      }
      return { id: item.id, status: 'ok', output: String(output).trimEnd(), errorCode: null };
    });
  } catch (error) {
    const errorCode = error?.message === 'invalid_json' || error instanceof SyntaxError
      ? 'invalid_json'
      : classifyWorkersAIError(error);
    return items.map((item) => ({ id: item.id, status: 'error', output: '', errorCode }));
  }
}

export async function translateWithWorkersAI(ai, items, { mode = 'romaji', dictionary = [], model = DEFAULT_WORKERS_AI_MODEL } = {}) {
  const batches = createBatches(items);
  const results = await Promise.all(batches.map((batch) => translateBatch(ai, batch, mode, dictionary, model)));
  return results.flat();
}
