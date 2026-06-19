window.CrowdAlgorithm = {
  async buildQueue(roomId, vibe, coveragePercent) {
    const profiles = await window.SupabaseDB.getTasteProfiles(roomId);
    if (!profiles.success || !profiles.data.length) return [];
    const allTrackIds = new Set();
    const memberCount = profiles.data.length;
    const trackKnownBy = new Map();
    for (const p of profiles.data) {
      for (const tid of (p.track_ids || [])) {
        allTrackIds.add(tid);
        trackKnownBy.set(tid, (trackKnownBy.get(tid) || 0) + 1);
      }
    }
    const songsResult = await window.SupabaseDB.getQueue(roomId);
    const existingSongs = songsResult.success ? (songsResult.data || []) : [];
    const songMap = new Map();
    for (const s of existingSongs) songMap.set(s.platform_track_id, s);
    const candidates = [];
    for (const tid of allTrackIds) {
      const song = songMap.get(tid) || { platform_track_id: tid, title: 'Unknown', artist: 'Unknown', album_art_url: '', duration_ms: 0, energy: 0.5, valence: 0.5, tempo: 120, danceability: 0.5 };
      const coverageScore = (trackKnownBy.get(tid) || 0) / memberCount;
      const moodScore = this.calculateMoodScore(song, vibe);
      candidates.push({ ...song, coverage_score: coverageScore, mood_score: moodScore });
    }
    const threshold = coveragePercent / 100;
    const filtered = candidates.filter(c => c.coverage_score >= threshold);
    filtered.sort((a, b) => {
      const scoreA = (0.6 * (a.mood_score || 0)) + (0.4 * (a.coverage_score || 0));
      const scoreB = (0.6 * (b.mood_score || 0)) + (0.4 * (b.coverage_score || 0));
      return scoreB - scoreA;
    });
    const top30 = filtered.slice(0, 30);
    return top30.map((s, i) => ({ ...s, queue_position: i }));
  },

  calculateMoodScore(song, vibe) {
    const e = song.energy || 0.5;
    const v = song.valence || 0.5;
    const d = song.danceability || 0.5;
    const t = this.tempoNormalized(song.tempo || 120);
    const r = this.releaseYearScore(song.release_year);
    switch (vibe) {
      case 'hype': return 0.4 * e + 0.3 * d + 0.3 * t;
      case 'chill': return 0.5 * (1 - e) + 0.3 * v + 0.2 * (1 - t);
      case 'bollywood': return 0.3 * d + 0.3 * v + 0.4 * e;
      case 'nostalgia': return 0.5 * v + 0.3 * (1 - e) + 0.2 * r;
      case 'rnb': return 0.4 * v + 0.4 * d + 0.2 * (1 - e);
      case 'indie': return 0.5 * (1 - d) + 0.3 * v + 0.2 * (1 - e);
      default: return 0.5;
    }
  },

  tempoNormalized(tempo) {
    const t = (tempo - 60) / 120;
    return Math.max(0, Math.min(1, t));
  },

  releaseYearScore(year) {
    if (!year) return 0.5;
    return year < 2010 ? 1 : 0.3;
  },

  async generateQueue() {
    const room = window.ViblendState.currentRoom;
    if (!room) return;
    const queue = await this.buildQueue(room.id, room.vibe, room.coverage_percent);
    await window.SupabaseDB.insertSongs(room.id, queue);
    window.ViblendState.currentQueue = queue;
    window.UI.renderQueue();
  },

  async recalculateQueue() {
    const room = window.ViblendState.currentRoom;
    if (!room || room.status === 'ended') return;
    const currentIdx = room.current_song_index || 0;
    const queue = await this.buildQueue(room.id, room.vibe, room.coverage_percent);
    const played = (window.ViblendState.playedSongs || []);
    const playedTrackIds = new Set(played.map(s => s.platform_track_id));
    const newQueue = queue.filter(s => !playedTrackIds.has(s.platform_track_id));
    await window.SupabaseDB.insertSongs(room.id, newQueue);
    window.ViblendState.currentQueue = newQueue;
    window.UI.renderQueue();
  },

  async advanceQueue() {
    const room = window.ViblendState.currentRoom;
    if (!room) return null;
    const queue = window.ViblendState.currentQueue || [];
    const currentIdx = room.current_song_index || 0;
    const currentSong = queue[currentIdx];
    if (currentSong) {
      if (!window.ViblendState.playedSongs) window.ViblendState.playedSongs = [];
      window.ViblendState.playedSongs.push(currentSong);
      await window.SupabaseDB.updateRoom(room.id, { current_song_index: currentIdx + 1 });
    }
    const nextSong = queue[currentIdx + 1];
    return nextSong || null;
  }
};
