import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDocument,
  canApplyResult,
  composeCopyText,
  getTranslationMessage,
  getTranslatableItems,
  reconcileDocument,
  splitLineIntoSegments
} from '../public/core.js';

test('romaji newline confirms the preceding line and final unpunctuated text stays draft', () => {
  const document = buildDocument('otukaresamadesu\nashita no yotei wo kakunin shitai', 'romaji', 1);
  assert.equal(document[0].segments[0].confirmed, true);
  assert.equal(document[1].segments[0].confirmed, false);
  assert.equal(document[1].segments[0].status, 'draft');
});

test('punctuation confirms segments including comma and period', () => {
  const segments = splitLineIntoSegments('otukaresamadesu. watashi wa,', 'romaji', true);
  assert.deepEqual(segments.map((segment) => [segment.text, segment.confirmed]), [
    ['otukaresamadesu.', true],
    ['watashi wa,', true]
  ]);
});

test('protected URL punctuation stays in one confirmed segment', () => {
  const segments = splitLineIntoSegments('https://example.com wo mite.', 'romaji', true);
  assert.deepEqual(segments.map((segment) => [segment.text, segment.confirmed]), [
    ['https://example.com wo mite.', true]
  ]);
});

test('protected email punctuation stays in one segment', () => {
  const segments = splitLineIntoSegments('test@example.com ni okuru.', 'romaji', true);
  assert.deepEqual(segments.map((segment) => [segment.text, segment.confirmed]), [
    ['test@example.com ni okuru.', true]
  ]);
});

test('protected decimal punctuation stays in one segment', () => {
  const segments = splitLineIntoSegments('3.14 wo tsukau.', 'romaji', true);
  assert.deepEqual(segments.map((segment) => [segment.text, segment.confirmed]), [
    ['3.14 wo tsukau.', true]
  ]);
});

test('newline confirms a trailing residual segment after punctuation', () => {
  const document = buildDocument('one. two\nnext', 'romaji', 1);
  assert.deepEqual(
    document[0].segments.map((segment) => [segment.source, segment.confirmed]),
    [['one.', true], ['two', true]]
  );
});

test('japanese mode confirms on newline only', () => {
  const document = buildDocument('これは一行目\nこれは二行目', 'japanese', 2);
  assert.equal(document[0].segments[0].confirmed, true);
  assert.equal(document[1].segments[0].confirmed, false);
});

test('blank lines are preserved while excluded from API items', () => {
  const document = buildDocument('one\n\ntwo\n', 'romaji', 3);
  assert.equal(document.length, 4);
  assert.equal(getTranslatableItems(document).length, 2);
  assert.equal(document[2].segments.length, 1);
});

test('copy requires every non-empty item to be done and keeps line order', () => {
  const document = buildDocument('one.\n\ntwo.', 'romaji', 4);
  const states = new Map(document.flatMap((line) => line.segments).map((item, index) => [item.id, { ...item, status: 'done', output: `out${index}` }]));
  let copied = composeCopyText(document, (item) => states.get(item.id));
  assert.equal(copied.ready, true);
  assert.equal(copied.text, 'out0\n\nout1');
  states.get(document[2].segments[0].id).status = 'error';
  copied = composeCopyText(document, (item) => states.get(item.id));
  assert.equal(copied.ready, false);
});

test('old response versions cannot be applied', () => {
  const item = buildDocument('one.', 'romaji', 8)[0].segments[0];
  const current = { ...item, status: 'loading', token: 12 };
  assert.equal(canApplyResult(item, { id: item.id, status: 'ok', output: '一つ' }, current, 12), true);
  assert.equal(canApplyResult(item, { id: item.id, status: 'ok', output: '古い' }, { ...current, requestVersion: 9 }, 12), false);
  assert.equal(canApplyResult(item, { id: item.id, status: 'ok', output: '古い' }, current, 13), false);
  assert.equal(canApplyResult(item, { id: 'other', status: 'ok', output: '違う' }, current, 12), false);
});

test('mode switch rejects an in-flight response from the previous mode', () => {
  const romajiDocument = buildDocument('one.', 'romaji', 20);
  const sentItem = romajiDocument[0].segments[0];
  const token = 91;
  const romajiState = new Map([
    [sentItem.id, { ...sentItem, status: 'loading', token }]
  ]);

  const japanese = reconcileDocument(
    romajiDocument,
    romajiState,
    'one.',
    'japanese',
    21
  );
  const currentJapaneseItem = japanese.document[0].segments[0];
  const oldResult = { id: sentItem.id, status: 'ok', output: '一つ。' };

  assert.notEqual(currentJapaneseItem.id, sentItem.id);
  assert.equal(japanese.state.has(sentItem.id), false);
  assert.equal(canApplyResult(sentItem, oldResult, japanese.state.get(sentItem.id), token), false);
});

test('stable item IDs do not contain request versions', () => {
  const first = buildDocument('one.', 'romaji', 1)[0].segments[0];
  const later = buildDocument('one.', 'romaji', 99)[0].segments[0];
  assert.equal(first.id, later.id);
  assert.equal(first.requestVersion, 1);
  assert.equal(later.requestVersion, 99);
});

test('reconcile preserves done state when only an unrelated draft changes', () => {
  const previousDocument = buildDocument('one.\nt', 'romaji', 1);
  const doneItem = previousDocument[0].segments[0];
  const previousState = new Map([
    [doneItem.id, { ...doneItem, status: 'done', output: '一つ。' }]
  ]);
  const next = reconcileDocument(previousDocument, previousState, 'one.\ntwo', 'romaji', 2);
  const preserved = next.state.get(doneItem.id);
  assert.equal(preserved.status, 'done');
  assert.equal(preserved.output, '一つ。');
  assert.equal(preserved.requestVersion, 1);
  assert.equal(next.document[1].segments[0].requestVersion, 2);
  assert.deepEqual(getTranslatableItems(next.document, (item) => next.state.get(item.id)), []);
});

test('reconcile preserves an in-flight item and its response token after an unrelated edit', () => {
  const previousDocument = buildDocument('one.\nt', 'romaji', 4);
  const sentItem = previousDocument[0].segments[0];
  const previousState = new Map([
    [sentItem.id, { ...sentItem, status: 'loading', token: 42 }]
  ]);
  const next = reconcileDocument(previousDocument, previousState, 'one.\ntwo', 'romaji', 5);
  const current = next.state.get(sentItem.id);
  assert.equal(current.status, 'loading');
  assert.equal(current.requestVersion, 4);
  assert.equal(current.token, 42);
  assert.equal(canApplyResult(sentItem, { id: sentItem.id, status: 'ok', output: '一つ。' }, current, 42), true);
});

test('reconcile resets draft-confirmed transitions to a new item version', () => {
  const draftDocument = buildDocument('one', 'romaji', 6);
  const confirmed = reconcileDocument(draftDocument, new Map(), 'one\n', 'romaji', 7);
  assert.equal(confirmed.document[0].segments[0].confirmed, true);
  assert.equal(confirmed.document[0].segments[0].status, 'pending');
  assert.equal(confirmed.document[0].segments[0].requestVersion, 7);

  const draftAgain = reconcileDocument(confirmed.document, confirmed.state, 'one', 'romaji', 8);
  assert.equal(draftAgain.document[0].segments[0].confirmed, false);
  assert.equal(draftAgain.document[0].segments[0].status, 'draft');
  assert.equal(draftAgain.document[0].segments[0].requestVersion, 8);
});

test('reconcile preserves errors and automatic targets include pending items only', () => {
  const previousDocument = buildDocument('one.\nt', 'romaji', 10);
  const failedItem = previousDocument[0].segments[0];
  const previousState = new Map([
    [failedItem.id, { ...failedItem, status: 'error', errorCode: 'service' }]
  ]);
  const next = reconcileDocument(previousDocument, previousState, 'one.\ntwo', 'romaji', 11);
  assert.equal(next.state.get(failedItem.id).status, 'error');
  assert.deepEqual(getTranslatableItems(next.document, (item) => next.state.get(item.id)), []);
});

test('completion message reports partial errors instead of success', () => {
  const document = buildDocument('one.\ntwo.', 'romaji', 12);
  const state = new Map(document.flatMap((line) => line.segments).map((item) => [
    item.id,
    { ...item, status: item.lineIndex === 0 ? 'done' : 'error', output: item.lineIndex === 0 ? '一つ。' : '' }
  ]));
  assert.deepEqual(getTranslationMessage(document, (item) => state.get(item.id), '全体を変換しました。'), {
    text: '一部の項目の変換に失敗しました。失敗項目を再試行してください。',
    isError: true
  });
});
