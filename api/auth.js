import { currentUser, env, json, sessionCookie, supabase } from './_supabase.js';

export default async function handler(request) {
  try {
    if (request.method === 'GET') {
      const { user } = await currentUser(request);
      return user ? json({ user: { id: user.id, email: user.email } }) : json({ error: 'Not signed in' }, 401);
    }
    if (request.method === 'POST' && request.url.endsWith('/logout')) {
      return json({ ok: true }, 200, { 'Set-Cookie': sessionCookie('', 0) });
    }
    if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
    const body = await request.json();
    const mode = body.mode || (new URL(request.url).pathname.endsWith('/register') ? 'register' : 'login');
    const { email, password } = body;
    if (!email || !password || password.length < 8) return json({ error: 'Use an email and a password with at least 8 characters.' }, 400);
    const base = env('SUPABASE_URL');
    const anon = env('SUPABASE_ANON_KEY');
    const endpoint = mode === 'register' ? `${base}/auth/v1/signup` : `${base}/auth/v1/token?grant_type=password`;
    const response = await fetch(endpoint, { method: 'POST', headers: { apikey: anon, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: email.trim().toLowerCase(), password }) });
    const data = await response.json();
    if (!response.ok) return json({ error: data.msg || data.message || data.error_description || 'Authentication failed.' }, response.status);
    if (!data.access_token) return json({ user: data.user, needsEmailConfirmation: true });
    return json({ user: { id: data.user.id, email: data.user.email } }, 200, { 'Set-Cookie': sessionCookie(data.access_token) });
  } catch (error) { return json({ error: error.message || 'Authentication failed.' }, 500); }
}
