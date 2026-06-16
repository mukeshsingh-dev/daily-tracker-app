export function env(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value.replace(/\/$/, '');
}

export function accessToken(request) {
  const auth = request.headers.get('authorization') || '';
  if (auth.toLowerCase().startsWith('bearer ')) return auth.slice(7);
  const cookie = request.headers.get('cookie') || '';
  const match = cookie.match(/(?:^|;\s*)sb_access_token=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

export async function supabase(path, options = {}, token) {
  const base = env('SUPABASE_URL');
  const headers = new Headers(options.headers || {});
  headers.set('apikey', env('SUPABASE_ANON_KEY'));
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  return fetch(`${base}${path}`, { ...options, headers });
}

export async function currentUser(request) {
  const token = accessToken(request);
  if (!token) return { token: null, user: null };
  const response = await supabase('/auth/v1/user', {}, token);
  if (!response.ok) return { token, user: null };
  return { token, user: await response.json() };
}

export function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', ...extraHeaders } });
}

export function sessionCookie(token, maxAge = 60 * 60 * 24 * 30) {
  return `sb_access_token=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}`;
}
