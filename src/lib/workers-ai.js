import { buildTranslatePrompt, parseResponse, validateOutput } from './gemini.js';

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

function parseModelResponse(text) {
  const normalized = String(text || '').trim().replace(/^```(?:json)?\s*/iu, '').replace(/\s*```$/u, '');
  return parseResponse(normalized);
}

async function translateBatch(ai, items, mode, dictionary, model) {
  try {
    const response = await ai.run(model, {
      messages: [{ role: 'user', content: buildTranslatePrompt(mode, items, dictionary) }],
      temperature: 0,
      max_tokens: 4096
    });
    const parsed = parseModelResponse(response?.response);
    const byId = new Map(parsed.map((result) => [result.id, result]));
    return items.map((item) => {
      const output = byId.get(item.id)?.output;
      if (!validateOutput(mode, item.text, output, dictionary)) {
        return { id: item.id, status: 'error', output: '', errorCode: 'validation' };
      }
      return { id: item.id, status: 'ok', output: String(output).trimEnd(), errorCode: null };
    });
  } catch {
    return items.map((item) => ({ id: item.id, status: 'error', output: '', errorCode: 'service' }));
  }
}

export async function translateWithWorkersAI(ai, items, { mode = 'romaji', dictionary = [], model = DEFAULT_WORKERS_AI_MODEL } = {}) {
  const batches = createBatches(items);
  const results = await Promise.all(batches.map((batch) => translateBatch(ai, batch, mode, dictionary, model)));
  return results.flat();
}
