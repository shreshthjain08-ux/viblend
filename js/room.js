window.RoomManager = {
  async generateRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
    const existing = await window.SupabaseDB.getRoomByCode(code);
    if (existing.success && existing.data) return this.generateRoomCode();
    return code;
  },

  async createRoom() {
    const user = window.ViblendState.currentUser;
    if (!user) { window.UI.showToast('Please log in first'); return; }
    window.UI.showLoading();
    try {
      const code = await this.generateRoomCode();
      const result = await window.SupabaseDB.createRoom(user.id, 'hype', 75);
      if (!result.success) { window.UI.showToast('Failed to create room: ' + result.error); window.UI.hideLoading(); return; }
      const room = result.data;
      window.ViblendState.currentRoom = room;
      window.ViblendState.isHost = true;
      await window.SupabaseDB.updateRoomMember(room.id, user.id, { joined_at: new Date().toISOString() });
      window.UI.renderWaitingRoom(room);
      window.TasteIngestion.runIngestion();
      this._subscribeToRoom(room.id);
      this._subscribeToMembers(room.id);
      window.Karaoke.initPeer();
    } catch (e) { console.error('Create room error:', e); window.UI.showToast('Something went wrong'); }
    window.UI.hideLoading();
  },

  async joinRoom(code) {
    const user = window.ViblendState.currentUser;
    if (!user) { window.UI.showToast('Please log in first'); return; }
    window.UI.showLoading();
    try {
      const result = await window.SupabaseDB.getRoomByCode(code);
      if (!result.success || !result.data) { window.UI.showToast('Room not found'); window.UI.hideLoading(); return; }
      const room = result.data;
      if (room.status === 'ended') { window.UI.showToast('This party has ended'); window.UI.hideLoading(); return; }
      await window.SupabaseDB.joinRoom(code, user.id);
      window.ViblendState.currentRoom = room;
      window.ViblendState.isHost = (room.host_user_id === user.id);
      window.UI.renderWaitingRoom(room);
      window.TasteIngestion.runIngestion();
      this._subscribeToRoom(room.id);
      this._subscribeToMembers(room.id);
      window.Karaoke.initPeer();
      if (!window.ViblendState.isHost) {
        const members = await window.SupabaseDB.getRoomMembers(room.id);
        if (members.success) {
          const host = members.data.find(m => m.user_id === room.host_user_id);
          if (host?.peer_id) window.Karaoke.connectToHost(host.peer_id);
        }
      }
    } catch (e) { console.error('Join room error:', e); window.UI.showToast('Something went wrong'); }
    window.UI.hideLoading();
  },

  async leaveRoom() {
    const room = window.ViblendState.currentRoom;
    const user = window.ViblendState.currentUser;
    if (room && user && window.ViblendState.isHost) {
      await window.SupabaseDB.updateRoom(room.id, { status: 'ended' });
    }
    this._unsubscribeAll();
    window.Karaoke.cleanup();
    window.ViblendState.currentRoom = null;
    window.ViblendState.isHost = false;
    window.ViblendState.currentQueue = [];
    window.ViblendState.roomMembers = [];
    window.ViblendState.playedSongs = [];
    window.UI.renderHome();
  },

  async startParty() {
    if (!window.ViblendState.isHost) return;
    window.UI.showLoading();
    try {
      await window.CrowdAlgorithm.generateQueue();
      const room = window.ViblendState.currentRoom;
      await window.SupabaseDB.updateRoom(room.id, { status: 'playing', current_song_index: 0 });
    } catch (e) { console.error('Start party error:', e); window.UI.showToast('Failed to start party'); }
    window.UI.hideLoading();
  },

  async endParty() {
    if (!window.ViblendState.isHost) return;
    const room = window.ViblendState.currentRoom;
    if (room) await window.SupabaseDB.updateRoom(room.id, { status: 'ended' });
    window.MusicPlayer.destroy();
    window.UI.renderRecap();
  },

  getCurrentRoom() { return window.ViblendState.currentRoom; },
  isHost() { return window.ViblendState.isHost; },

  handleRoomChange(payload) {
    const newRecord = payload.new;
    if (!newRecord) return;
    window.ViblendState.currentRoom = { ...window.ViblendState.currentRoom, ...newRecord };
    if (payload.eventType === 'UPDATE') {
      if (newRecord.status === 'playing' && window.ViblendState.currentScreen !== 'now-playing-screen') {
        window.UI.renderNowPlaying();
      }
      if (newRecord.status === 'ended' && window.ViblendState.currentScreen !== 'recap-screen') {
        window.UI.renderRecap();
      }
      if (newRecord.current_song_index !== undefined && window.ViblendState.isHost) {
        const queue = window.ViblendState.currentQueue || [];
        const song = queue[newRecord.current_song_index];
        if (song) window.MusicPlayer.playTrack(song);
      }
      if ((newRecord.vibe !== undefined || newRecord.coverage_percent !== undefined) && window.CrowdAlgorithm) {
        window.CrowdAlgorithm.recalculateQueue();
      }
    }
  },

  async handleMembersChange(payload) {
    const room = window.ViblendState.currentRoom;
    if (!room) return;
    const members = await window.SupabaseDB.getRoomMembers(room.id);
    if (members.success) {
      window.ViblendState.roomMembers = members.data;
      window.UI.renderMemberList(members.data);
      if (window.ViblendState.isHost && window.ViblendState.currentScreen === 'waiting-room-screen') {
        window.UI.renderMemberList(members.data);
      }
      if (window.ViblendState.isHost && payload.new?.peer_id && payload.new.user_id !== room.host_user_id) {
        window.Karaoke.callGuest(payload.new.peer_id);
      }
      if (payload.new?.is_mic_active !== undefined && window.ViblendState.isHost) {
        window.UI.renderHostKaraokeControls();
      }
    }
  },

  _roomChannel: null,
  _membersChannel: null,
  _songsChannel: null,

  _subscribeToRoom(roomId) {
    this._unsubscribeAll();
    this._roomChannel = window.SupabaseDB.subscribeToRoom(roomId, (payload) => this.handleRoomChange(payload));
    this._membersChannel = window.SupabaseDB.subscribeToMembers(roomId, (payload) => this.handleMembersChange(payload));
    this._songsChannel = window.SupabaseDB.subscribeToSongs(roomId, (payload) => {
      if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
        window.SupabaseDB.getQueue(roomId).then(r => { if (r.success) window.ViblendState.currentQueue = r.data; window.UI.renderQueue(); });
      }
    });
  },

  _unsubscribeAll() {
    if (this._roomChannel) { this._roomChannel.unsubscribe(); this._roomChannel = null; }
    if (this._membersChannel) { this._membersChannel.unsubscribe(); this._membersChannel = null; }
    if (this._songsChannel) { this._songsChannel.unsubscribe(); this._songsChannel = null; }
  },

  init() {
    const path = window.location.pathname;
    const match = path.match(/\/join\/(\w+)/);
    if (match) {
      const code = match[1].toUpperCase();
      if (window.ViblendState.currentUser) {
        setTimeout(() => this.joinRoom(code), 500);
      } else {
        window.UI.showToast('Please log in first');
        setTimeout(() => window.location.href = '/', 2000);
      }
    }
  }
};

window.RoomManager.init();
