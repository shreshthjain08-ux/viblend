window.UI = {
  showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const target = document.getElementById(screenId);
    if (target) { target.classList.add('active'); target.style.animation = 'slideLeft 0.3s ease-out'; }
    window.ViblendState.currentScreen = screenId;
    try { window.ViblendState.audioContext?.resume(); } catch (e) {}
  },

  renderHome() {
    this.showScreen('home-screen');
    const user = window.ViblendState.currentUser;
    const avatar = document.getElementById('home-avatar');
    const name = document.getElementById('home-name');
    if (user) {
      name.textContent = user.display_name || 'User';
      if (user.avatar_url) { avatar.innerHTML = `<img src="${user.avatar_url}" alt="">`; }
      else { avatar.textContent = (user.display_name || 'U').charAt(0).toUpperCase(); }
    } else { name.textContent = 'Guest'; avatar.textContent = 'G'; }
  },

  renderWaitingRoom(room) {
    this.showScreen('waiting-room-screen');
    document.getElementById('room-code-display').textContent = room.code || '------';
    const qrContainer = document.getElementById('qr-container');
    qrContainer.innerHTML = '';
    try {
      new QRCode(qrContainer, { text: `https://viblend.app/join/${room.code}`, width: 160, height: 160, colorDark: '#5B4DDE', colorLight: '#0F0E1A' });
    } catch (e) { qrContainer.innerHTML = '<div style="width:160px;height:160px;background:#1A1A2E;display:flex;align-items:center;justify-content:center;border-radius:12px;color:#8888AA;font-size:12px;">QR Code</div>'; }
    const isHost = window.ViblendState.isHost;
    document.getElementById('host-controls').style.display = isHost ? 'block' : 'none';
    document.getElementById('guest-waiting').style.display = isHost ? 'none' : 'flex';
    this.renderVibeTiles(room.vibe || 'hype');
    this.updateCoverageUI(room.coverage_percent || 75);
  },

  renderMemberList(members) {
    const list = document.getElementById('member-list');
    list.innerHTML = '';
    members.forEach(m => {
      const user = m.users || {};
      const div = document.createElement('div'); div.className = 'member-item';
      div.innerHTML = `<div class="member-avatar">${user.avatar_url ? `<img src="${user.avatar_url}" alt="">` : (user.display_name || 'U').charAt(0).toUpperCase()}</div><div class="member-name">${user.display_name || 'User'}</div><div class="member-platform">${m.users?.platform || ''}</div>`;
      list.appendChild(div);
    });
  },

  renderVibeTiles(currentVibe) {
    document.querySelectorAll('.vibe-tile').forEach(t => {
      t.classList.toggle('active', t.dataset.vibe === currentVibe);
    });
  },

  selectVibe(vibe) {
    const room = window.ViblendState.currentRoom;
    if (!room) return;
    window.ViblendState.currentRoom.vibe = vibe;
    this.renderVibeTiles(vibe);
    window.SupabaseDB.updateRoom(room.id, { vibe });
    if (window.CrowdAlgorithm) window.CrowdAlgorithm.recalculateQueue();
  },

  onCoverageSliderChange(value) {
    this.updateCoverageUI(value);
    clearTimeout(this._coverageDebounce);
    this._coverageDebounce = setTimeout(() => {
      const room = window.ViblendState.currentRoom;
      if (!room) return;
      window.ViblendState.currentRoom.coverage_percent = parseInt(value);
      window.SupabaseDB.updateRoom(room.id, { coverage_percent: parseInt(value) });
      if (window.CrowdAlgorithm) window.CrowdAlgorithm.recalculateQueue();
    }, 500);
  },

  updateCoverageUI(value) {
    document.getElementById('coverage-value').textContent = value + '%';
    const desc = document.getElementById('coverage-desc');
    const v = parseInt(value);
    if (v <= 25) desc.textContent = 'niche picks, real heads only';
    else if (v <= 50) desc.textContent = 'half the room will vibe';
    else if (v <= 75) desc.textContent = 'most of the room knows this';
    else if (v < 100) desc.textContent = 'crowd pleasers only';
    else desc.textContent = 'everyone in this room knows it';
    document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
    if (v === 25) document.querySelector('.preset-btn:nth-child(1)')?.classList.add('active');
    else if (v === 75) document.querySelector('.preset-btn:nth-child(2)')?.classList.add('active');
    else if (v === 100) document.querySelector('.preset-btn:nth-child(3)')?.classList.add('active');
  },

  setCoveragePreset(value) {
    document.getElementById('coverage-slider').value = value;
    this.onCoverageSliderChange(value);
  },

  renderNowPlaying() {
    this.showScreen('now-playing-screen');
    const isHost = window.ViblendState.isHost;
    document.getElementById('mic-fab').style.display = 'block';
    this.renderQueue();
  },

  renderQueue() {
    const list = document.getElementById('up-next-list');
    list.innerHTML = '';
    const queue = window.ViblendState.currentQueue || [];
    const currentIdx = (window.ViblendState.currentRoom?.current_song_index || 0);
    const nextSongs = queue.slice(currentIdx + 1, currentIdx + 6);
    nextSongs.forEach(song => {
      const div = document.createElement('div'); div.className = 'queue-item';
      div.innerHTML = `<div class="qi-thumb">${song.album_art_url ? `<img src="${song.album_art_url}" alt="">` : '🎵'}</div><div class="qi-info"><div class="qi-title">${song.title || 'Unknown'}</div><div class="qi-artist">${song.artist || ''}</div></div><div class="qi-coverage">${Math.round((song.coverage_score || 0) * 100)}%</div>`;
      list.appendChild(div);
    });
  },

  updateNowPlaying(song) {
    const art = document.getElementById('np-album-art');
    const title = document.getElementById('np-title');
    const artist = document.getElementById('np-artist');
    const coverage = document.getElementById('np-coverage-label');
    const fill = document.getElementById('np-coverage-fill');
    if (song) {
      title.textContent = song.title || 'Unknown';
      artist.textContent = song.artist || '';
      art.innerHTML = song.album_art_url ? `<img src="${song.album_art_url}" alt="">` : '<div class="album-art-placeholder">🎵</div>';
      const cov = Math.round((song.coverage_score || 0) * 100);
      coverage.textContent = cov + '% of the room knows this';
      fill.style.width = cov + '%';
      document.getElementById('np-total-time').textContent = this.formatTime((song.duration_ms || 0) / 1000);
    }
  },

  updateProgressBar(currentMs, totalMs) {
    const progress = document.getElementById('np-progress');
    const currentTime = document.getElementById('np-current-time');
    const totalTime = document.getElementById('np-total-time');
    if (!progress || !totalMs) return;
    progress.max = totalMs;
    progress.value = currentMs;
    progress.disabled = false;
    currentTime.textContent = this.formatTime(currentMs / 1000);
    totalTime.textContent = this.formatTime(totalMs / 1000);
  },

  formatTime(seconds) {
    if (!seconds || isNaN(seconds)) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return m + ':' + (s < 10 ? '0' : '') + s;
  },

  renderKaraokePanel() {
    const isHost = window.ViblendState.isHost;
    document.getElementById('host-karaoke-view').style.display = isHost ? 'block' : 'none';
    document.getElementById('guest-karaoke-view').style.display = isHost ? 'none' : 'block';
    if (isHost) this.renderHostKaraokeControls();
  },

  renderHostKaraokeControls() {
    const container = document.getElementById('karaoke-members');
    container.innerHTML = '';
    const members = window.ViblendState.roomMembers || [];
    members.forEach(m => {
      const user = m.users || {};
      const div = document.createElement('div'); div.className = 'karaoke-member-row';
      div.innerHTML = `<div class="karaoke-member-info"><div class="karaoke-member-avatar">${(user.display_name || 'U').charAt(0)}</div><span>${user.display_name || 'User'}</span></div><div class="toggle-switch ${m.is_mic_active ? 'on' : ''}" onclick="window.Karaoke.toggleMemberMic('${m.user_id}')"></div><input type="range" class="slider" min="0" max="2" step="0.05" value="${m.mic_volume || 1}" oninput="window.Karaoke.setMicVolume('${m.peer_id}', this.value)" style="width:80px">`;
      container.appendChild(div);
    });
  },

  renderRecap() {
    this.showScreen('recap-screen');
    const room = window.ViblendState.currentRoom;
    const songs = window.ViblendState.playedSongs || [];
    document.getElementById('recap-songs-count').textContent = songs.length;
    const top3 = [...songs].sort((a, b) => (b.coverage_score || 0) - (a.coverage_score || 0)).slice(0, 3);
    const container = document.getElementById('recap-top-3');
    container.innerHTML = '';
    const medals = ['🥇', '🥈', '🥉'];
    top3.forEach((s, i) => {
      const div = document.createElement('div'); div.className = 'recap-song-row';
      div.innerHTML = `<div class="recap-medal">${medals[i]}</div><div class="recap-song-info"><div class="recap-song-title">${s.title || 'Unknown'}</div><div class="recap-song-artist">${s.artist || ''}</div></div><div class="recap-song-coverage">${Math.round((s.coverage_score || 0) * 100)}%</div>`;
      container.appendChild(div);
    });
    if (room?.created_at) {
      const duration = Math.floor((Date.now() - new Date(room.created_at).getTime()) / 60000);
      const h = Math.floor(duration / 60); const m = duration % 60;
      document.getElementById('recap-duration').textContent = h > 0 ? `${h}h ${m}m` : `${m}m`;
    }
  },

  async shareRecap() {
    const room = window.ViblendState.currentRoom;
    const songs = window.ViblendState.playedSongs || [];
    const text = `Just finished a Viblend party! 🎉 ${songs.length} songs played. Join the next one at viblend.app`;
    if (navigator.share) { try { await navigator.share({ title: 'Viblend Party', text }); } catch (e) {} }
    else { try { await navigator.clipboard.writeText(text); this.showToast('Copied to clipboard!'); } catch (e) {} }
  },

  showToast(msg, duration = 3000) {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div'); toast.className = 'toast'; toast.textContent = msg;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), duration);
  },

  showOfflineBanner() { const el = document.getElementById('offline-banner'); if (el) el.style.display = 'block'; },
  hideOfflineBanner() { const el = document.getElementById('offline-banner'); if (el) el.style.display = 'none'; },

  showLoading() { document.getElementById('loading-overlay').classList.remove('hidden'); },
  hideLoading() { document.getElementById('loading-overlay').classList.add('hidden'); },

  showJoinModal() {
    const modal = document.getElementById('join-modal');
    modal.style.display = 'flex';
    const inputs = modal.querySelectorAll('.code-inputs input');
    inputs.forEach((input, i) => {
      input.value = '';
      input.addEventListener('input', () => {
        input.value = input.value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
        if (input.value && i < inputs.length - 1) inputs[i + 1].focus();
      });
      input.addEventListener('keydown', (e) => { if (e.key === 'Backspace' && !input.value && i > 0) inputs[i - 1].focus(); });
    });
    setTimeout(() => inputs[0]?.focus(), 100);
  },

  hideJoinModal() { document.getElementById('join-modal').style.display = 'none'; },

  submitJoinCode() {
    const inputs = document.querySelectorAll('#modal-code-inputs input');
    let code = ''; inputs.forEach(i => code += i.value.toUpperCase());
    if (code.length === 6) { window.RoomManager.joinRoom(code); this.hideJoinModal(); }
    else { this.showToast('Enter a 6-digit code'); }
  }
};
