import { currentUser, env, json } from './_supabase.js';

export default async function handler(request) {
  try {
    const { user } = await currentUser(request);
    if (!user) return json({ error: 'Please sign in first.' }, 401);
    if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
    const { message, habits = [], history = [], profile = {} } = await request.json();
    if (!message) return json({ error: 'message is required' }, 400);
    const habitContext = habits.map((habit) => `- ${habit.name}: ${habit.done ? 'done today' : 'not done yet'}`).join('\n');
    const response = await fetch('https://api.openai.com/v1/responses', { method: 'POST', headers: { Authorization: `Bearer ${env('OPENAI_API_KEY')}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: process.env.OPENAI_MODEL || 'gpt-4.1-mini', instructions: `You are Ritual, a daily habit accountability coach. Be concise: 2-4 sentences. Celebrate effort, never shame the user, and suggest one concrete next step. Do not provide medical advice. The user's name is ${profile.name || 'Alex'} and their preferred coaching style is ${profile.tone || 'supportive'}. Their habits today are:\n${habitContext}`, input: [...history.map((item) => ({ role: item.type === 'user' ? 'user' : 'assistant', content: item.text })), { role: 'user', content: message }] }) });
    const data = await response.json();
    if (!response.ok) return json({ error: data.error?.message || 'LLM request failed.' }, response.status);
    return json({ reply: data.output_text || 'I hear you. What is one small action that would make the next hour feel like a win?', mode: 'openai' });
  } catch (error) { return json({ error: error.message || 'Chat request failed.' }, 500); }
}
