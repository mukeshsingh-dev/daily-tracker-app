import http from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const root = fileURLToPath(new URL('.', import.meta.url));
const port = Number(process.env.PORT || 3000);
const apiKey = process.env.OPENAI_API_KEY;
const model = process.env.OPENAI_MODEL || 'gpt-4.1-mini';
const dataDir = join(root, 'data');
const dataFile = join(dataDir, 'state.json');
const usersFile = join(dataDir, 'users.json');
const sessions = new Map();
const defaultState = { profile: { name: 'Alex', tone: 'supportive', checkInTime: '08:00' }, habits: [
  { name: 'Drink 8 glasses of water', meta: 'Health · daily', done: true },
  { name: 'Code for 30 minutes', meta: 'Growth · daily', done: false },
  { name: 'Move your body', meta: 'Energy · 3x this week', done: false }
], messages: [], streak: 7 };

async function readState() {
  try { return JSON.parse(await readFile(dataFile, 'utf8')); }
  catch { await mkdir(dataDir, { recursive: true }); await writeFile(dataFile, JSON.stringify(defaultState, null, 2)); return defaultState; }
}

async function writeState(state) {
  await mkdir(dataDir, { recursive: true });
  await writeFile(dataFile, JSON.stringify({ ...defaultState, ...state }, null, 2));
  return readState();
}

async function readUsers() {
  try { return JSON.parse(await readFile(usersFile, 'utf8')); }
  catch { await mkdir(dataDir, { recursive: true }); await writeFile(usersFile, '[]'); return []; }
}

async function writeUsers(users) {
  await mkdir(dataDir, { recursive: true });
  await writeFile(usersFile, JSON.stringify(users, null, 2));
}

function hashPassword(password, salt = randomBytes(16).toString('hex')) {
  return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
}

function validPassword(password, stored) {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const candidate = scryptSync(password, salt, 64);
  return timingSafeEqual(candidate, Buffer.from(hash, 'hex'));
}

function parseCookies(req) {
  return Object.fromEntries((req.headers.cookie || '').split(';').filter(Boolean).map((part) => {
    const [key, ...value] = part.trim().split('='); return [key, decodeURIComponent(value.join('='))];
  }));
}

async function currentUser(req) {
  const sessionId = parseCookies(req).ritual_session;
  const userId = sessionId && sessions.get(sessionId);
  if (!userId) return null;
  return (await readUsers()).find((user) => user.id === userId) || null;
}

function setSession(res, userId) {
  const sessionId = randomBytes(32).toString('hex');
  sessions.set(sessionId, userId);
  res.setHeader('Set-Cookie', `ritual_session=${encodeURIComponent(sessionId)}; HttpOnly; SameSite=Lax; Path=/`);
}

async function readBody(req) {
  let body = '';
  for await (const chunk of req) body += chunk;
  return JSON.parse(body || '{}');
}

async function userState(user) {
  const userFile = join(dataDir, `user-${user.id}.json`);
  try { return JSON.parse(await readFile(userFile, 'utf8')); }
  catch {
    let initial = defaultState;
    try { if ((await readFile(dataFile, 'utf8')).trim()) initial = JSON.parse(await readFile(dataFile, 'utf8')); } catch {}
    await writeFile(userFile, JSON.stringify(initial, null, 2));
    return initial;
  }
}

async function writeUserState(user, state) {
  await mkdir(dataDir, { recursive: true });
  const value = { ...defaultState, ...state };
  await writeFile(join(dataDir, `user-${user.id}.json`), JSON.stringify(value, null, 2));
  return value;
}

const fallback = (message) => {
  const text = message.toLowerCase();
  if (text.includes('struggle') || text.includes('bad') || text.includes('miss')) return 'Thank you for being honest. A missed day is data, not a verdict. Pick one tiny promise you can still keep before bed.';
  if (text.includes('plan')) return 'Let’s make it almost too easy: 10 minutes of coding, one glass of water, and a short walk. Which one will you start with?';
  if (text.includes('great') || text.includes('done')) return 'That is worth noticing. You kept a promise to yourself today — let’s protect that momentum tomorrow.';
  return 'I hear you. What is one small action that would make the next hour feel like a win?';
};

async function getReply({ message, habits = [], history = [], profile = {} }) {
  if (!apiKey) return { reply: fallback(message), mode: 'demo' };
  const habitContext = habits.map((habit) => `- ${habit.name}: ${habit.done ? 'done today' : 'not done yet'}`).join('\n');
  const input = [
    ...history.map((item) => ({ role: item.type === 'user' ? 'user' : 'assistant', content: item.text })),
    { role: 'user', content: message }
  ];
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      instructions: `You are Ritual, a daily habit accountability coach. Be concise: 2-4 sentences. Celebrate effort, never shame the user, and suggest one concrete next step. Do not provide medical advice. The user's name is ${profile.name || 'Alex'} and their preferred coaching style is ${profile.tone || 'supportive'}. Their habits today are:\n${habitContext}`,
      input
    })
  });
  if (!response.ok) throw new Error(`OpenAI API error: ${response.status}`);
  const data = await response.json();
  return { reply: data.output_text || fallback(message), mode: 'openai' };
}

function sendJson(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(payload));
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'GET' && req.url === '/api/auth/me') {
      const user = await currentUser(req); return user ? sendJson(res, 200, { user: { id: user.id, email: user.email } }) : sendJson(res, 401, { error: 'Not signed in' });
    }
    if (req.method === 'POST' && (req.url === '/api/auth/register' || req.url === '/api/auth/login')) {
      const { email, password } = await readBody(req);
      if (!email || !password || password.length < 8) return sendJson(res, 400, { error: 'Use an email and a password with at least 8 characters.' });
      const normalizedEmail = email.trim().toLowerCase();
      const users = await readUsers();
      let user = users.find((item) => item.email === normalizedEmail);
      if (req.url.endsWith('register')) {
        if (user) return sendJson(res, 409, { error: 'An account with that email already exists.' });
        user = { id: randomBytes(12).toString('hex'), email: normalizedEmail, passwordHash: hashPassword(password), createdAt: new Date().toISOString() };
        users.push(user); await writeUsers(users);
      } else if (!user || !validPassword(password, user.passwordHash)) return sendJson(res, 401, { error: 'Incorrect email or password.' });
      setSession(res, user.id); return sendJson(res, 200, { user: { id: user.id, email: user.email } });
    }
    if (req.method === 'POST' && req.url === '/api/auth/logout') { const sessionId = parseCookies(req).ritual_session; if (sessionId) sessions.delete(sessionId); res.setHeader('Set-Cookie', 'ritual_session=; Max-Age=0; HttpOnly; SameSite=Lax; Path=/'); return sendJson(res, 200, { ok: true }); }
    if (req.url.startsWith('/api/state') || req.url.startsWith('/api/chat')) {
      const user = await currentUser(req);
      if (!user) return sendJson(res, 401, { error: 'Please sign in first.' });
      if (req.method === 'GET' && req.url === '/api/state') return sendJson(res, 200, await userState(user));
      if (req.method === 'PUT' && req.url === '/api/state') return sendJson(res, 200, await writeUserState(user, await readBody(req)));
      if (req.method === 'POST' && req.url === '/api/chat') {
        const payload = await readBody(req);
        if (!payload.message) return sendJson(res, 400, { error: 'message is required' });
        try { return sendJson(res, 200, await getReply(payload)); }
        catch (error) { console.error(error); return sendJson(res, 502, { error: 'The coach is temporarily unavailable.' }); }
      }
    }
    if (req.method !== 'GET') return sendJson(res, 405, { error: 'Method not allowed' });
    const requested = req.url === '/' ? '/index.html' : req.url.split('?')[0];
    const filePath = normalize(join(root, requested));
    if (!filePath.startsWith(root)) return sendJson(res, 403, { error: 'Forbidden' });
    const file = await readFile(filePath);
    const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css' };
    res.writeHead(200, { 'Content-Type': types[extname(filePath)] || 'application/octet-stream' });
    res.end(file);
  } catch { sendJson(res, 404, { error: 'Not found' }); }
});

server.listen(port, () => console.log(`Ritual is running at http://localhost:${port}`));
