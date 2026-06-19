window.ViblendState = window.ViblendState || {
  currentUser: null,
  currentRoom: null,
  isHost: false,
  supabaseClient: null,
  peer: null,
  audioContext: null,
  currentScreen: null,
  currentQueue: [],
  roomMembers: [],
  playedSongs: [],
  spotifyDeviceId: null,
  spotifyPlayer: null,
  youtubePlayer: null,
  masterGain: null,
  musicGain: null,
  activeMics: {},
  peerId: null
};

window.VIBLEND_CONFIG = window.VIBLEND_CONFIG || {
  SUPABASE_URL: typeof __SUPABASE_URL__ !== 'undefined' ? __SUPABASE_URL__ : '',
  SUPABASE_ANON_KEY: typeof __SUPABASE_ANON_KEY__ !== 'undefined' ? __SUPABASE_ANON_KEY__ : '',
  SPOTIFY_CLIENT_ID: typeof __SPOTIFY_CLIENT_ID__ !== 'undefined' ? __SPOTIFY_CLIENT_ID__ : '',
  SPOTIFY_REDIRECT_URI: typeof __SPOTIFY_REDIRECT_URI__ !== 'undefined' ? __SPOTIFY_REDIRECT_URI__ : window.location.origin + '/',
  YOUTUBE_CLIENT_ID: typeof __YOUTUBE_CLIENT_ID__ !== 'undefined' ? __YOUTUBE_CLIENT_ID__ : '',
  YOUTUBE_API_KEY: typeof __YOUTUBE_API_KEY__ !== 'undefined' ? __YOUTUBE_API_KEY__ : '',
  APPLE_MUSIC_DEVELOPER_TOKEN: typeof __APPLE_MUSIC_DEVELOPER_TOKEN__ !== 'undefined' ? __APPLE_MUSIC_DEVELOPER_TOKEN__ : '',
  RAZORPAY_KEY_ID: typeof __RAZORPAY_KEY_ID__ !== 'undefined' ? __RAZORPAY_KEY_ID__ : ''
};

window.addEventListener('DOMContentLoaded', () => {
  window.UI.hideLoading();
  const user = window.ViblendState.currentUser;
  if (!user) {
    if (window.location.pathname !== '/' && !window.location.pathname.startsWith('/join/')) {
      window.location.href = '/';
      return;
    }
  }
  if (user) {
    window.UI.renderHome();
  }
  window.PWA.registerSW();
  window.SupabaseDB.initClient();
});

window.addEventListener('beforeunload', () => {
  window.Karaoke.cleanup();
});
