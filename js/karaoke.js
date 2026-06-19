window.Karaoke = {
  peer: null,
  micStream: null,
  activeCalls: {},
  _meterRAF: null,
  _hostPeerId: null,

  async initPeer() {
    if (this.peer) return;
    this.peer = new Peer(undefined, {
      host: '0.peerjs.com', port: 443, secure: true,
      config: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
          { urls: 'stun:global.xirsys.net', username: 'YOUR_XIRSYS_USER', credential: 'YOUR_XIRSYS_CRED' }
        ]
      }
    });
    this.peer.on('open', (id) => {
      window.ViblendState.peerId = id;
      const room = window.ViblendState.currentRoom;
      const user = window.ViblendState.currentUser;
      if (room && user) window.SupabaseDB.updateRoomMember(room.id, user.id, { peer_id: id });
    });
    this.peer.on('call', (call) => {
      const silentStream = this.createSilentStream();
      call.answer(silentStream);
      call.on('stream', (stream) => { this.addGuestMicToMixer(stream, call.peer); });
      call.on('close', () => { this.removeGuestMic(call.peer); });
    });
    this.peer.on('disconnected', () => this.cleanup());
    this.peer.on('close', () => this.cleanup());
    window.ViblendState.peer = this.peer;
    if (window.ViblendState.isHost) this.initMixer();
  },

  createSilentStream() {
    const ctx = new AudioContext();
    const dest = ctx.createMediaStreamDestination();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    gain.gain.value = 0;
    osc.connect(gain);
    gain.connect(dest);
    osc.start();
    return dest.stream;
  },

  connectToHost(hostPeerId) {
    this._hostPeerId = hostPeerId;
  },

  callGuest(guestPeerId) {
    if (!this.peer || !window.ViblendState.isHost) return;
    const silentStream = this.createSilentStream();
    const call = this.peer.call(guestPeerId, silentStream);
    call.on('stream', (stream) => { this.addGuestMicToMixer(stream, guestPeerId); });
    call.on('close', () => { this.removeGuestMic(guestPeerId); });
  },

  async startMic() {
    try {
      this.micStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1, sampleRate: 48000 }, video: false
      });
      const room = window.ViblendState.currentRoom;
      const user = window.ViblendState.currentUser;
      if (room && user) {
        await window.SupabaseDB.updateRoomMember(room.id, user.id, { is_mic_active: true });
      }
      const hostId = this._hostPeerId;
      if (hostId && this.peer) {
        const call = this.peer.call(hostId, this.micStream);
        this.activeCalls[hostId] = call;
      }
      const btn = document.getElementById('karaoke-mic-btn');
      const label = document.getElementById('mic-label');
      if (btn) { btn.classList.add('active'); }
      if (label) { label.textContent = 'LIVE'; }
      this._startAudioMeter();
    } catch (e) { console.error('Mic error:', e); window.UI.showToast('Mic access denied'); }
  },

  stopMic() {
    if (this.micStream) { this.micStream.getTracks().forEach(t => t.stop()); this.micStream = null; }
    const room = window.ViblendState.currentRoom;
    const user = window.ViblendState.currentUser;
    if (room && user) window.SupabaseDB.updateRoomMember(room.id, user.id, { is_mic_active: false });
    Object.values(this.activeCalls).forEach(c => c.close());
    this.activeCalls = {};
    const btn = document.getElementById('karaoke-mic-btn');
    const label = document.getElementById('mic-label');
    if (btn) { btn.classList.remove('active'); }
    if (label) { label.textContent = 'Tap to sing'; }
    if (this._meterRAF) { cancelAnimationFrame(this._meterRAF); this._meterRAF = null; }
  },

  toggleMic() {
    const room = window.ViblendState.currentRoom;
    const user = window.ViblendState.currentUser;
    const isActive = this.micStream && this.micStream.active;
    if (isActive) this.stopMic(); else this.startMic();
  },

  toggleMemberMic(userId) {
    const members = window.ViblendState.roomMembers || [];
    const member = members.find(m => m.user_id === userId);
    if (!member) return;
    const newState = !member.is_mic_active;
    window.SupabaseDB.updateRoomMember(window.ViblendState.currentRoom.id, userId, { is_mic_active: newState });
  },

  initMixer() {
    if (window.ViblendState.audioContext) return;
    const audioContext = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive', sampleRate: 48000 });
    const masterGain = audioContext.createGain();
    masterGain.gain.value = 1.0;
    masterGain.connect(audioContext.destination);
    const musicGain = audioContext.createGain();
    musicGain.gain.value = 0.75;
    musicGain.connect(masterGain);
    window.ViblendState.audioContext = audioContext;
    window.ViblendState.masterGain = masterGain;
    window.ViblendState.musicGain = musicGain;
    window.ViblendState.activeMics = {};
    document.addEventListener('click', () => audioContext.resume(), { once: true });
  },

  async addGuestMicToMixer(guestStream, peerId) {
    const ctx = window.ViblendState.audioContext;
    if (!ctx) return;
    const source = ctx.createMediaStreamSource(guestStream);
    const highPass = ctx.createBiquadFilter();
    highPass.type = 'highpass';
    highPass.frequency.value = 80;
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -24;
    compressor.knee.value = 30;
    compressor.ratio.value = 12;
    compressor.attack.value = 0.003;
    compressor.release.value = 0.25;
    const reverb = ctx.createConvolver();
    reverb.buffer = await this.generateReverbImpulse(ctx, 1.5, 2, false);
    const dryGain = ctx.createGain();
    dryGain.gain.value = 0.7;
    const wetGain = ctx.createGain();
    wetGain.gain.value = 0.3;
    const micGain = ctx.createGain();
    micGain.gain.value = 1.0;
    const masterGain = window.ViblendState.masterGain;
    source.connect(highPass);
    highPass.connect(compressor);
    compressor.connect(dryGain);
    compressor.connect(reverb);
    reverb.connect(wetGain);
    dryGain.connect(micGain);
    wetGain.connect(micGain);
    micGain.connect(masterGain);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 64;
    micGain.connect(analyser);
    window.ViblendState.activeMics[peerId] = { source, highPass, compressor, reverb, dryGain, wetGain, micGain, analyser };
  },

  removeGuestMic(peerId) {
    const nodes = window.ViblendState.activeMics[peerId];
    if (!nodes) return;
    try {
      nodes.source.disconnect();
      nodes.highPass.disconnect();
      nodes.compressor.disconnect();
      nodes.reverb.disconnect();
      nodes.dryGain.disconnect();
      nodes.wetGain.disconnect();
      nodes.micGain.disconnect();
      nodes.analyser.disconnect();
    } catch (e) {}
    delete window.ViblendState.activeMics[peerId];
  },

  setMicVolume(peerId, volume) {
    const nodes = window.ViblendState.activeMics[peerId];
    if (nodes && nodes.micGain) nodes.micGain.gain.value = parseFloat(volume);
  },

  setMasterMicVolume(volume) {
    Object.values(window.ViblendState.activeMics || {}).forEach(n => {
      if (n.micGain) n.micGain.gain.value = parseFloat(volume) * (n.micGain.gain.value || 1);
    });
  },

  setMusicVolume(volume) {
    const gain = window.ViblendState.musicGain;
    if (gain) gain.gain.value = parseFloat(volume);
  },

  async generateReverbImpulse(context, duration, decay, reverse) {
    const sampleRate = context.sampleRate;
    const length = sampleRate * duration;
    const impulse = context.createBuffer(2, length, sampleRate);
    for (let channel = 0; channel < 2; channel++) {
      const channelData = impulse.getChannelData(channel);
      for (let i = 0; i < length; i++) {
        const n = reverse ? length - i : i;
        channelData[i] = (Math.random() * 2 - 1) * Math.pow(1 - n / length, decay);
      }
    }
    return impulse;
  },

  getMicLevel(peerId) {
    const nodes = window.ViblendState.activeMics[peerId];
    if (!nodes || !nodes.analyser) return 0;
    const data = new Uint8Array(nodes.analyser.frequencyBinCount);
    nodes.analyser.getByteFrequencyData(data);
    let sum = 0;
    for (const v of data) sum += v;
    return sum / (data.length * 255);
  },

  _startAudioMeter() {
    if (this._meterRAF) cancelAnimationFrame(this._meterRAF);
    const loop = () => {
      const bars = document.querySelectorAll('#audio-meter .meter-bar');
      if (bars.length && this.micStream) {
        const ctx = window.ViblendState.audioContext;
        if (ctx) {
          const source = ctx.createMediaStreamSource(this.micStream);
          const analyser = ctx.createAnalyser();
          analyser.fftSize = 64;
          source.connect(analyser);
          const data = new Uint8Array(analyser.frequencyBinCount);
          analyser.getByteFrequencyData(data);
          bars.forEach((bar, i) => {
            const val = data[i % data.length] || 0;
            const h = Math.max(4, (val / 255) * 48);
            bar.style.height = h + 'px';
          });
          source.disconnect();
          analyser.disconnect();
        }
      }
      this._meterRAF = requestAnimationFrame(loop);
    };
    this._meterRAF = requestAnimationFrame(loop);
  },

  showKaraokePanel() {
    document.getElementById('karaoke-panel').classList.add('active');
    window.UI.renderKaraokePanel();
  },

  hideKaraokePanel() {
    document.getElementById('karaoke-panel').classList.remove('active');
    if (this._meterRAF) { cancelAnimationFrame(this._meterRAF); this._meterRAF = null; }
  },

  cleanup() {
    this.stopMic();
    Object.keys(window.ViblendState.activeMics || {}).forEach(id => this.removeGuestMic(id));
    if (this.peer) { this.peer.destroy(); this.peer = null; }
    window.ViblendState.activeMics = {};
    window.ViblendState.peer = null;
  }
};
