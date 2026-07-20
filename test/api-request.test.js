import test from 'node:test';
import assert from 'node:assert/strict';
import { API_LIMITS, validateTranslateRequest } from '../src/lib/api-request.js';

test('API validation preserves inputs exactly at their limits', () => {
  const id = 'i'.repeat(API_LIMITS.maxIdLength);
  const text = 't'.repeat(API_LIMITS.maxItemLength);
  const result = validateTranslateRequest({ mode: 'romaji', items: [{ id, text }] });
  assert.equal(result.ok, true);
  assert.equal(result.items[0].id, id);
  assert.equal(result.items[0].text, text);
});

test('API validation rejects an oversized item instead of truncating it', () => {
  const result = validateTranslateRequest({
    mode: 'romaji',
    items: [{ id: 'one', text: 't'.repeat(API_LIMITS.maxItemLength + 1) }]
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, 400);
});

test('API validation rejects an oversized ID instead of truncating it', () => {
  const result = validateTranslateRequest({
    mode: 'romaji',
    items: [{ id: 'i'.repeat(API_LIMITS.maxIdLength + 1), text: 'one' }]
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, 400);
});

test('API validation rejects duplicate item IDs', () => {
  const result = validateTranslateRequest({
    mode: 'japanese',
    items: [{ id: 'same', text: '一つ' }, { id: 'same', text: '二つ' }]
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, 400);
});
