import { getAllowedEmails } from '../../lib/google-auth.js';

export function onRequestGet({ env }) {
  const secretLength = new TextEncoder().encode(String(env.GOOGLE_SESSION_SECRET || '')).byteLength;
  if (!env.GOOGLE_CLIENT_ID || !getAllowedEmails(env).length || secretLength < 32) {
    return Response.json({ error: 'Googleログインの設定が完了していません。' }, {
      status: 503,
      headers: { 'Cache-Control': 'no-store' }
    });
  }
  return Response.json({ clientId: env.GOOGLE_CLIENT_ID }, {
    headers: { 'Cache-Control': 'no-store' }
  });
}
