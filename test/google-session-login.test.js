import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequestPost } from '../functions/api/auth/session.js';

const env = {
  GOOGLE_CLIENT_ID: 'test-client.apps.googleusercontent.com',
  GOOGLE_ALLOWED_EMAILS: 'allowed@example.com',
  GOOGLE_SESSION_SECRET: 'session-secret-long-enough-for-testing-123456'
};

function request(body, origin = 'https://translator.example') {
  return new Request('https://translator.example/api/auth/session', {
    method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
}

test('Google access-token login checks userinfo and creates a session', async () => {
  const originalFetch = globalThis.fetch;
  let forwardedToken;
  globalThis.fetch = async (url, options) => {
    assert.equal(url, 'https://openidconnect.googleapis.com/v1/userinfo');
    forwardedToken = options.headers.Authorization;
    return Response.json({ sub: 'google-sub', email: 'Allowed@example.com', email_verified: true });
  };
  try {
    const response = await onRequestPost({ request: request({ accessToken: 'access-token' }), env });
    assert.equal(response.status, 200);
    assert.equal(forwardedToken, 'Bearer access-token');
    assert.match(response.headers.get('Set-Cookie'), /__Host-romaji_session=/);
    assert.deepEqual(await response.json(), {
      authenticated: true,
      user: { email: 'allowed@example.com' }
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Google access-token login rejects accounts outside the allowlist', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({
    sub: 'other-sub', email: 'other@example.com', email_verified: true
  });
  try {
    const response = await onRequestPost({ request: request({ accessToken: 'access-token' }), env });
    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), { error: 'このGoogleアカウントには利用権限がありません。' });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Google access-token login rejects unverified email addresses', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({
    sub: 'google-sub', email: 'allowed@example.com', email_verified: false
  });
  try {
    const response = await onRequestPost({ request: request({ accessToken: 'access-token' }), env });
    assert.equal(response.status, 401);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
