const SUPABASE_URL = window.VIBLEND_CONFIG?.SUPABASE_URL || 'https://your-project.supabase.co';
const SUPABASE_ANON_KEY = window.VIBLEND_CONFIG?.SUPABASE_ANON_KEY || 'your-anon-key';

function getSupabase() {
  if (!window.ViblendState.supabaseClient) {
    window.ViblendState.supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  return window.ViblendState.supabaseClient;
}

window.SupabaseDB = {
  initClient() {
    return getSupabase();
  },

  async getUser(userId) {
    try {
      const { data, error } = await getSupabase().from('users').select('*').eq('id', userId).single();
      if (error) return { success: false, error: error.message };
      return { success: true, data };
    } catch (e) { return { success: false, error: e.message }; }
  },

  async saveUser(userData) {
    try {
      const { data, error } = await getSupabase().from('users').upsert(userData, { onConflict: 'id' }).select().single();
      if (error) return { success: false, error: error.message };
      return { success: true, data };
    } catch (e) { return { success: false, error: e.message }; }
  },

  async createRoom(userId, vibe, coveragePercent) {
    try {
      const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      let code = '';
      for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
      const { data: existing } = await getSupabase().from('rooms').select('id').eq('code', code).single();
      if (existing) return this.createRoom(userId, vibe, coveragePercent);
      const room = { code, host_user_id: userId, vibe: vibe || 'hype', coverage_percent: coveragePercent || 75, status: 'waiting', current_song_index: 0 };
      const { data, error } = await getSupabase().from('rooms').insert(room).select().single();
      if (error) return { success: false, error: error.message };
      return { success: true, data };
    } catch (e) { return { success: false, error: e.message }; }
  },

  async joinRoom(code, userId) {
    try {
      const { data: room, error: rErr } = await getSupabase().from('rooms').select('*').eq('code', code).neq('status', 'ended').single();
      if (rErr || !room) return { success: false, error: 'Room not found' };
      const { error: mErr } = await getSupabase().from('room_members').insert({ room_id: room.id, user_id: userId });
      if (mErr) return { success: false, error: mErr.message };
      return { success: true, data: room };
    } catch (e) { return { success: false, error: e.message }; }
  },

  async getRoomMembers(roomId) {
    try {
      const { data, error } = await getSupabase().from('room_members').select('*, users(display_name, avatar_url, platform)').eq('room_id', roomId);
      if (error) return { success: false, error: error.message };
      return { success: true, data };
    } catch (e) { return { success: false, error: e.message }; }
  },

  async updateRoomMember(roomId, userId, data) {
    try {
      const { error } = await getSupabase().from('room_members').update(data).eq('room_id', roomId).eq('user_id', userId);
      if (error) return { success: false, error: error.message };
      return { success: true };
    } catch (e) { return { success: false, error: e.message }; }
  },

  async insertSongs(roomId, songsArray) {
    try {
      const songs = songsArray.map((s, i) => ({ ...s, room_id: roomId, queue_position: i, played: false }));
      const { error } = await getSupabase().from('songs').insert(songs);
      if (error) return { success: false, error: error.message };
      return { success: true };
    } catch (e) { return { success: false, error: e.message }; }
  },

  async getQueue(roomId) {
    try {
      const { data, error } = await getSupabase().from('songs').select('*').eq('room_id', roomId).eq('played', false).order('queue_position', { ascending: true });
      if (error) return { success: false, error: error.message };
      return { success: true, data };
    } catch (e) { return { success: false, error: e.message }; }
  },

  async getTasteProfiles(roomId) {
    try {
      const { data, error } = await getSupabase().from('taste_profiles').select('*').eq('room_id', roomId);
      if (error) return { success: false, error: error.message };
      return { success: true, data };
    } catch (e) { return { success: false, error: e.message }; }
  },

  async insertTasteProfile(userId, roomId, trackIds, platform) {
    try {
      const { error } = await getSupabase().from('taste_profiles').insert({ user_id: userId, room_id: roomId, track_ids: trackIds, platform, ingested_at: new Date().toISOString() });
      if (error) return { success: false, error: error.message };
      return { success: true };
    } catch (e) { return { success: false, error: e.message }; }
  },

  async updateRoom(roomId, data) {
    try {
      const { error } = await getSupabase().from('rooms').update(data).eq('id', roomId);
      if (error) return { success: false, error: error.message };
      return { success: true };
    } catch (e) { return { success: false, error: e.message }; }
  },

  async getRoomByCode(code) {
    try {
      const { data, error } = await getSupabase().from('rooms').select('*').eq('code', code).neq('status', 'ended').single();
      if (error) return { success: false, error: error.message };
      return { success: true, data };
    } catch (e) { return { success: false, error: e.message }; }
  },

  subscribeToRoom(roomId, callback) {
    return getSupabase().channel('room-' + roomId).on('postgres_changes', { event: '*', schema: 'public', table: 'rooms', filter: 'id=eq.' + roomId }, callback).subscribe();
  },

  subscribeToMembers(roomId, callback) {
    return getSupabase().channel('members-' + roomId).on('postgres_changes', { event: '*', schema: 'public', table: 'room_members', filter: 'room_id=eq.' + roomId }, callback).subscribe();
  },

  subscribeToSongs(roomId, callback) {
    return getSupabase().channel('songs-' + roomId).on('postgres_changes', { event: '*', schema: 'public', table: 'songs', filter: 'room_id=eq.' + roomId }, callback).subscribe();
  },

  async refreshTokens() {
    try {
      const { data: users } = await getSupabase().from('users').select('*').lt('token_expires_at', new Date(Date.now() + 5 * 60 * 1000).toISOString());
      if (!users) return;
      for (const user of users) {
        if (user.platform === 'spotify' && user.refresh_token) {
          const resp = await fetch('https://accounts.spotify.com/api/token', {
            method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: user.refresh_token, client_id: window.VIBLEND_CONFIG?.SPOTIFY_CLIENT_ID || '' })
          });
          if (resp.ok) {
            const json = await resp.json();
            const expires = new Date(Date.now() + json.expires_in * 1000).toISOString();
            await getSupabase().from('users').update({ access_token: json.access_token, token_expires_at: expires }).eq('id', user.id);
          }
        }
      }
    } catch (e) { console.error('Token refresh error:', e); }
  }
};
