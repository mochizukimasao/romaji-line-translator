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
  if (status === 408) return 'timeout';
  if (status === 429) return 'rate_limit';
  if ([400, 403, 404].includes(status)) return 'configuration';
  if (status >= 500) return 'transient_service';
  const message = String(error?.message || '').toLowerCase();
  if (/daily allocation|quota|neurons/u.test(message)) return 'rate_limit';
  if (/no such model|invalid model|not allowed|agreement|binding/u.test(message)) return 'configuration';
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
