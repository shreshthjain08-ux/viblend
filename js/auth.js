const SPOTIFY_CLIENT_ID = window.VIBLEND_CONFIG?.SPOTIFY_CLIENT_ID || '';
const SPOTIFY_REDIRECT_URI = window.VIBLEND_CONFIG?.SPOTIFY_REDIRECT_URI || window.location.origin + '/';
const YOUTUBE_CLIENT_ID = window.VIBLEND_CONFIG?.YOUTUBE_CLIENT_ID || '';
const APPLE_DEV_TOKEN = window.VIBLEND_CONFIG?.APPLE_MUSIC_DEVELOPER_TOKEN || '';

function generateRandomString(length) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  let result = '';
  for (let i = 0; i < length; i++) result += chars[Math.floor(Math.random() * chars.length)];
  return result;
}

async function sha256(plain) {
  const encoder = new TextEncoder();
  const data = encoder.encode(plain);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return hash;
}

function base64urlencode(buffer) {
  const bytes = new Uint8Array(buffer);
  let str = '';
  for (const b of bytes) str += String.fromCharCode(b);
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function pkceChallenge() {
  const verifier = generateRandomString(128);
  const challenge = base64urlencode(await sha256(verifier));
  return { verifier, challenge };
}

window.Auth = {
  async initSpotifyAuth() {
    const { verifier, challenge } = await pkceChallenge();
    sessionStorage.setItem('spotify_code_verifier', verifier);
    const state = 'spotify_' + generateRandomString(16);
    sessionStorage.setItem('spotify_state', state);
    const params = new URLSearchParams({
      client_id: SPOTIFY_CLIENT_ID, response_type: 'code', redirect_uri: SPOTIFY_REDIRECT_URI,
      scope: 'user-read-private user-read-email user-top-read user-read-recently-played user-library-read streaming user-modify-playback-state user-read-playback-state',
      state, code_challenge_method: 'S256', code_challenge: challenge
    });
    window.location.href = 'https://accounts.spotify.com/authorize?' + params.toString();
  },

  async handleSpotifyCallback(code, state) {
    const savedState = sessionStorage.getItem('spotify_state');
    if (state !== savedState) { console.error('State mismatch'); return; }
    const verifier = sessionStorage.getItem('spotify_code_verifier');
    if (!verifier) { console.error('No verifier'); return; }
    const resp = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: SPOTIFY_REDIRECT_URI, client_id: SPOTIFY_CLIENT_ID, code_verifier: verifier })
    });
    if (!resp.ok) { console.error('Token exchange failed'); return; }
    const token = await resp.json();
    const expiresAt = new Date(Date.now() + token.expires_in * 1000).toISOString();
    const profileResp = await fetch('https://api.spotify.com/v1/me', { headers: { Authorization: 'Bearer ' + token.access_token } });
    const profile = await profileResp.json();
    const userData = {
      id: crypto.randomUUID(), platform: 'spotify', platform_user_id: profile.id,
      display_name: profile.display_name || 'Spotify User', avatar_url: profile.images?.[0]?.url || '',
      access_token: token.access_token, refresh_token: token.refresh_token, token_expires_at: expiresAt, created_at: new Date().toISOString()
    };
    const saved = await window.SupabaseDB.saveUser(userData);
    if (saved.success) {
      window.ViblendState.currentUser = saved.data;
      sessionStorage.setItem('viblend_user', JSON.stringify(saved.data));
      window.location.href = '/app.html';
    }
  },

  initYouTubeAuth() {
    const tokenClient = window.google?.accounts?.oauth2?.initTokenClient({
      client_id: YOUTUBE_CLIENT_ID, scope: 'https://www.googleapis.com/auth/youtube.readonly',
      callback: (tokenResponse) => window.Auth.handleYouTubeCallback(tokenResponse)
    });
    if (tokenClient) tokenClient.requestAccessToken();
    else window.UI.showToast('Google Sign-In not ready. Please retry.');
  },

  async handleYouTubeCallback(tokenResponse) {
    const accessToken = tokenResponse.access_token;
    const resp = await fetch('https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true', { headers: { Authorization: 'Bearer ' + accessToken } });
    const json = await resp.json();
    const channel = json.items?.[0];
    if (!channel) { console.error('No channel found'); return; }
    const userData = {
      id: crypto.randomUUID(), platform: 'youtube', platform_user_id: channel.id,
      display_name: channel.snippet.title, avatar_url: channel.snippet.thumbnails?.default?.url || '',
      access_token: accessToken, refresh_token: '', token_expires_at: new Date(Date.now() + 3600 * 1000).toISOString(), created_at: new Date().toISOString()
    };
    const saved = await window.SupabaseDB.saveUser(userData);
    if (saved.success) {
      window.ViblendState.currentUser = saved.data;
      sessionStorage.setItem('viblend_user', JSON.stringify(saved.data));
      window.location.href = '/app.html';
    }
  },

  async initAppleAuth() {
    if (!window.MusicKit) {
      const script = document.createElement('script');
      script.src = 'https://js-cdn.music.apple.com/musickit/v3/musickit.js';
      script.onload = () => window.Auth.initAppleAuth();
      document.head.appendChild(script);
      return;
    }
    try {
      await MusicKit.configure({ developerToken: APPLE_DEV_TOKEN, app: { name: 'Viblend', build: '1.0' } });
      const music = MusicKit.getInstance();
      const token = await music.authorize();
      await window.Auth.handleAppleCallback(token, music);
    } catch (e) { console.error('Apple auth error:', e); window.UI.showToast('Apple Music auth failed'); }
  },

  async handleAppleCallback(musicUserToken, music) {
    try {
      const storefront = await music.api.music('/v1/me/storefront');
      const sf = storefront.data?.data?.[0]?.id || 'us';
      const userData = {
        id: crypto.randomUUID(), platform: 'apple', platform_user_id: 'apple_' + musicUserToken.slice(0, 16),
        display_name: 'Apple Music User', avatar_url: '',
        access_token: musicUserToken, refresh_token: '', token_expires_at: new Date(Date.now() + 86400 * 1000).toISOString(), created_at: new Date().toISOString()
      };
      const saved = await window.SupabaseDB.saveUser(userData);
      if (saved.success) {
        window.ViblendState.currentUser = saved.data;
        sessionStorage.setItem('viblend_user', JSON.stringify(saved.data));
        window.location.href = '/app.html';
      }
    } catch (e) { console.error('Apple callback error:', e); }
  },

  async handleOAuthCallback() {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const state = params.get('state');
    if (!code || !state) return;
    if (state.startsWith('spotify_')) await this.handleSpotifyCallback(code, state);
  },

  getCurrentUser() { return window.ViblendState.currentUser || null; },

  async saveUserToDB(userData) { return window.SupabaseDB.saveUser(userData); },

  logout() {
    window.ViblendState.currentUser = null;
    sessionStorage.removeItem('viblend_user');
    window.location.href = '/';
  },

  async refreshSpotifyToken(userId) {
    const { data: user } = await window.SupabaseDB.getUser(userId);
    if (!user || !user.refresh_token) return null;
    const fiveMin = Date.now() + 5 * 60 * 1000;
    if (new Date(user.token_expires_at).getTime() > fiveMin) return user.access_token;
    const resp = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: user.refresh_token, client_id: SPOTIFY_CLIENT_ID })
    });
    if (!resp.ok) return null;
    const json = await resp.json();
    const expires = new Date(Date.now() + json.expires_in * 1000).toISOString();
    await window.SupabaseDB.saveUser({ ...user, access_token: json.access_token, token_expires_at: expires });
    return json.access_token;
  },

  getSpotifyToken() {
    const user = window.ViblendState.currentUser;
    return user?.platform === 'spotify' ? user.access_token : null;
  },

  getYouTubeToken() {
    const user = window.ViblendState.currentUser;
    return user?.platform === 'youtube' ? user.access_token : null;
  },

  getAppleToken() {
    const user = window.ViblendState.currentUser;
    return user?.platform === 'apple' ? user.access_token : null;
  },

  init() {
    const saved = sessionStorage.getItem('viblend_user');
    if (saved) { try { window.ViblendState.currentUser = JSON.parse(saved); } catch (e) {} }
    this.handleOAuthCallback();
    setInterval(() => window.SupabaseDB.refreshTokens(), 45 * 60 * 1000);
  }
};

window.Auth.init();
