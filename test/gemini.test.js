import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTranslatePrompt, translateItems, validateOutput } from '../src/lib/gemini.js';

test('prompt policy is shared by normal and isolated requests', () => {
  const prompt = buildTranslatePrompt('romaji', [{ id: 'a', text: 'LINE de okutte kudasai' }]);
  assert.match(prompt, /JSONオブジェクト/);
  assert.match(prompt, /LINE/);
  assert.match(prompt, /Latin文字/);
});

test('romaji validation protects known Latin tokens but rejects arbitrary Latin', () => {
  assert.equal(validateOutput('romaji', 'LINE de okutte kudasai', 'LINEで送ってください'), true);
  assert.equal(validateOutput('romaji', 'otukaresamadesu', 'お疲れ様です ok'), false);
});

test('romaji validation accepts an exact protected URL', () => {
  assert.equal(validateOutput('romaji', 'https://example.com wo mite', 'https://example.comを見て'), true);
});

test('romaji validation accepts an exact protected email address', () => {
  assert.equal(validateOutput('romaji', 'test@example.com ni okuru', 'test@example.comに送る'), true);
});

test('romaji validation accepts exact protected mention and hashtag tokens', () => {
  assert.equal(validateOutput('romaji', '@staff ni kakunin', '@staffに確認'), true);
  assert.equal(validateOutput('romaji', '#release wo tsukeru', '#releaseを付ける'), true);
});

test('romaji validation accepts a defined katakana product alias', () => {
  assert.equal(validateOutput('romaji', 'LINE de okutte kudasai', 'ラインで送ってください'), true);
});

test('romaji validation preserves existing Japanese runs', () => {
  assert.equal(validateOutput('romaji', '今日は ashita ikimasu.', '今日は明日行きます。'), true);
});

test('romaji validation rejects changed existing Japanese runs', () => {
  assert.equal(validateOutput('romaji', '今日は ashita ikimasu.', '明日は明日行きます。'), false);
});

test('successful batch maps outputs by response ID when response order differs', async () => {
  const originalFetch = globalThis.fetch;
  let callCount = 0;
  globalThis.fetch = async () => {
    callCount += 1;
    return new Response(JSON.stringify({
      candidates: [{
        content: {
          parts: [{
            text: JSON.stringify({
              results: [
                { id: 'second', output: '二つ' },
                { id: 'first', output: '一つ' }
              ]
            })
          }]
        }
      }]
    }), { status: 200 });
  };

  try {
    const results = await translateItems([
      { id: 'first', text: 'hitotsu' },
      { id: 'second', text: 'futatsu' }
    ], { apiKey: 'test-only', mode: 'romaji' });

    assert.equal(callCount, 1);
    assert.deepEqual(results, [
      { id: 'first', status: 'ok', output: '一つ', errorCode: null },
      { id: 'second', status: 'ok', output: '二つ', errorCode: null }
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('a failed batch is retried per item and successful items survive', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (_url, options) => {
    const payload = JSON.parse(options.body);
    const promptLines = payload.contents[0].parts[0].text.trim().split('\n');
    const items = JSON.parse(promptLines[promptLines.length - 1]).items;
    calls.push(items.map((item) => item.id));
    if (items.length > 1) return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '{bad json' }] } }] }), { status: 200 });
    const item = items[0];
    const output = item.id === 'bad' ? 'not valid' : 'お疲れ様です';
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ results: [{ id: item.id, output }] }) }] } }] }), { status: 200 });
  };
  try {
    const results = await translateItems([{ id: 'good', text: 'otukaresamadesu' }, { id: 'bad', text: 'otukaresamadesu' }], { apiKey: 'test-only', mode: 'romaji' });
    assert.deepEqual(results.map((result) => result.status), ['ok', 'error']);
    assert.deepEqual(calls, [['good', 'bad'], ['good'], ['bad']]);
    assert.equal(results[1].output, '');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
