import { currentUser, json, supabase } from './_supabase.js';

export default async function handler(request) {
  try {
    const { token, user } = await currentUser(request);
    if (!user) return json({ error: 'Please sign in first.' }, 401);
    if (request.method === 'GET') {
      const response = await supabase(`/rest/v1/user_state?user_id=eq.${user.id}&select=state`, {}, token);
      const rows = await response.json();
      return json(rows[0]?.state || { profile: { name: 'Alex', tone: 'supportive', checkInTime: '08:00' }, habits: [], messages: [], streak: 0 });
    }
    if (request.method === 'PUT') {
      const state = await request.json();
      const response = await supabase('/rest/v1/user_state', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=representation' }, body: JSON.stringify({ user_id: user.id, state, updated_at: new Date().toISOString() }) }, token);
      if (!response.ok) return json({ error: await response.text() }, response.status);
      return json(state);
    }
    return json({ error: 'Method not allowed' }, 405);
  } catch (error) { return json({ error: error.message || 'State request failed.' }, 500); }
}
