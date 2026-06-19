window.MusicPlayer = {
  _platform: null,
  _spotifyPlayer: null,
  _spotifyDeviceId: null,
  _youtubePlayer: null,
  _pollInterval: null,
  _isPlaying: false,
  _currentSong: null,

  detectHostPlatform() {
    const user = window.ViblendState.currentUser;
    if (!user) return 'youtube';
    if (user.platform === 'spotify') return 'spotify';
    if (user.platform === 'apple' && /Safari/.test(navigator.userAgent) && !/Chrome/.test(navigator.userAgent)) return 'apple';
    return 'youtube';
  },

  async initSpotifyPlayer(token) {
    return new Promise((resolve) => {
      const existing = document.getElementById('spotify-sdk');
      if (existing) { resolve(); return; }
      const script = document.createElement('script');
      script.id = 'spotify-sdk';
      script.src = 'https://sdk.scdn.co/spotify-player.js';
      document.body.appendChild(script);
      window.onSpotifyWebPlaybackSDKReady = () => {
        const player = new Spotify.Player({
          name: 'Viblend Party',
          getOAuthToken: cb => cb(token),
          volume: 0.75
        });
        player.addListener('ready', ({ device_id }) => {
          this._spotifyDeviceId = device_id;
          window.ViblendState.spotifyDeviceId = device_id;
        });
        player.addListener('player_state_changed', state => {
          if (!state) return;
          this._isPlaying = !state.paused;
          window.UI.updateProgressBar(state.position, state.duration);
          if (state.position >= state.duration - 2000 && state.duration > 0) {
            this.onTrackEnded();
          }
        });
        player.connect();
        this._spotifyPlayer = player;
        window.ViblendState.spotifyPlayer = player;
        resolve();
      };
    });
  },

  async initYouTubePlayer() {
    return new Promise((resolve) => {
      const existing = document.getElementById('youtube-sdk');
      if (existing && this._youtubePlayer) { resolve(); return; }
      const script = document.createElement('script');
      script.id = 'youtube-sdk';
      script.src = 'https://www.youtube.com/iframe_api';
      document.body.appendChild(script);
      const div = document.createElement('div');
      div.id = 'youtube-player';
      div.style.cssText = 'width:1px;height:1px;position:absolute;left:-9999px;';
      document.body.appendChild(div);
      window.onYouTubeIframeAPIReady = () => {
        const player = new YT.Player('youtube-player', {
          events: {
            onStateChange: (event) => {
              if (event.data === YT.PlayerState.ENDED) this.onTrackEnded();
              if (event.data === YT.PlayerState.PLAYING) this._isPlaying = true;
              if (event.data === YT.PlayerState.PAUSED) this._isPlaying = false;
            }
          }
        });
        this._youtubePlayer = player;
        window.ViblendState.youtubePlayer = player;
        resolve();
      };
    });
  },

  async initApplePlayer() {
    const music = window.MusicKit?.getInstance();
    if (!music) return;
    music.addEventListener('playbackStateDidChange', (event) => {
      if (event.state === MusicKit.PlaybackStates.ended) this.onTrackEnded();
      this._isPlaying = (event.state === MusicKit.PlaybackStates.playing);
    });
    music.addEventListener('nowPlayingItemDidChange', () => {
      const item = music.player.nowPlayingItem;
      if (item) {
        window.UI.updateNowPlaying({
          title: item.title || 'Unknown',
          artist: item.artistName || '',
          album_art_url: item.artworkURL || '',
          duration_ms: (item.playbackDuration || 0) * 1000
        });
      }
    });
  },

  async playTrack(song) {
    this._currentSong = song;
    window.UI.updateNowPlaying(song);
    const platform = song.platform || this.detectHostPlatform();
    if (platform === 'spotify') {
      const token = window.Auth.getSpotifyToken();
      if (!this._spotifyPlayer) await this.initSpotifyPlayer(token);
      await fetch('https://api.spotify.com/v1/me/player/play' + (this._spotifyDeviceId ? '?device_id=' + this._spotifyDeviceId : ''), {
        method: 'PUT', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ uris: ['spotify:track:' + song.platform_track_id] })
      });
    } else if (platform === 'youtube') {
      if (!this._youtubePlayer) await this.initYouTubePlayer();
      this._youtubePlayer.loadVideoById(song.platform_track_id);
      this._youtubePlayer.playVideo();
    } else if (platform === 'apple') {
      const music = window.MusicKit?.getInstance();
      if (music) {
        await music.setQueue({ song: song.platform_track_id });
        music.play();
      }
    }
    this._isPlaying = true;
    this._startPolling();
  },

  pause() {
    this._isPlaying = false;
    const platform = this._platform || this.detectHostPlatform();
    if (platform === 'spotify' && this._spotifyPlayer) this._spotifyPlayer.pause();
    else if (platform === 'youtube' && this._youtubePlayer) this._youtubePlayer.pauseVideo();
    else if (platform === 'apple') { const music = window.MusicKit?.getInstance(); if (music) music.pause(); }
  },

  resume() {
    this._isPlaying = true;
    const platform = this._platform || this.detectHostPlatform();
    if (platform === 'spotify' && this._spotifyPlayer) this._spotifyPlayer.resume();
    else if (platform === 'youtube' && this._youtubePlayer) this._youtubePlayer.playVideo();
    else if (platform === 'apple') { const music = window.MusicKit?.getInstance(); if (music) music.play(); }
    this._startPolling();
  },

  togglePlay() {
    if (this._isPlaying) { this.pause(); document.getElementById('np-play-btn').textContent = '▶'; }
    else { this.resume(); document.getElementById('np-play-btn').textContent = '⏸'; }
  },

  async skip() {
    const nextSong = await window.CrowdAlgorithm.advanceQueue();
    if (nextSong) { this.playTrack(nextSong); }
    else { this._isPlaying = false; document.getElementById('np-play-btn').textContent = '▶'; window.UI.showToast('Party complete!'); }
  },

  previous() {
    const room = window.ViblendState.currentRoom;
    if (!room || (room.current_song_index || 0) <= 0) return;
    const newIdx = (room.current_song_index || 0) - 1;
    window.SupabaseDB.updateRoom(room.id, { current_song_index: newIdx });
    const queue = window.ViblendState.currentQueue || [];
    const song = queue[newIdx];
    if (song) this.playTrack(song);
  },

  onTrackEnded() {
    this.skip();
  },

  _startPolling() {
    if (this._pollInterval) clearInterval(this._pollInterval);
    this._pollInterval = setInterval(() => this._pollProgress(), 2000);
  },

  async _pollProgress() {
    if (!this._isPlaying) return;
    const platform = this._platform || this.detectHostPlatform();
    let position = 0, duration = 0;
    if (platform === 'spotify' && this._spotifyPlayer) {
      const state = await this._spotifyPlayer.getCurrentState();
      if (state) { position = state.position; duration = state.duration; }
    } else if (platform === 'youtube' && this._youtubePlayer) {
      position = (this._youtubePlayer.getCurrentTime() || 0) * 1000;
      duration = (this._youtubePlayer.getDuration() || 0) * 1000;
    } else if (platform === 'apple') {
      const music = window.MusicKit?.getInstance();
      if (music) { position = (music.player.currentPlaybackTime || 0) * 1000; duration = (music.player.currentPlaybackDuration || 0) * 1000; }
    }
    window.UI.updateProgressBar(position, duration);
  },

  getPosition() {
    const platform = this._platform || this.detectHostPlatform();
    if (platform === 'youtube' && this._youtubePlayer) return (this._youtubePlayer.getCurrentTime() || 0) * 1000;
    if (platform === 'apple') { const music = window.MusicKit?.getInstance(); return music ? (music.player.currentPlaybackTime || 0) * 1000 : 0; }
    return 0;
  },

  getDuration() {
    const platform = this._platform || this.detectHostPlatform();
    if (platform === 'youtube' && this._youtubePlayer) return (this._youtubePlayer.getDuration() || 0) * 1000;
    if (platform === 'apple') { const music = window.MusicKit?.getInstance(); return music ? (music.player.currentPlaybackDuration || 0) * 1000 : 0; }
    return 0;
  },

  setVolume(v) {
    const platform = this._platform || this.detectHostPlatform();
    if (platform === 'spotify' && this._spotifyPlayer) this._spotifyPlayer.setVolume(v);
    else if (platform === 'youtube' && this._youtubePlayer) this._youtubePlayer.setVolume(Math.round(v * 100));
    else if (platform === 'apple') { const music = window.MusicKit?.getInstance(); if (music) music.player.volume = v; }
  },

  getPlatform() { return this._platform || this.detectHostPlatform(); },

  destroy() {
    this._isPlaying = false;
    if (this._pollInterval) { clearInterval(this._pollInterval); this._pollInterval = null; }
    if (this._spotifyPlayer) { this._spotifyPlayer.disconnect(); this._spotifyPlayer = null; }
    if (this._youtubePlayer) { this._youtubePlayer.destroy(); this._youtubePlayer = null; }
  },

  init() {
    this._platform = this.detectHostPlatform();
  }
};

window.MusicPlayer.init();
