window.TasteIngestion = {
  async runIngestion() {
    const user = window.ViblendState.currentUser;
    const room = window.ViblendState.currentRoom;
    if (!user || !room) return;
    try {
      if (user.platform === 'spotify') await this.ingestSpotify(user.id, room.id);
      else if (user.platform === 'youtube') await this.ingestYouTube(user.id, room.id);
      else if (user.platform === 'apple') await this.ingestAppleMusic(user.id, room.id);
      console.log('Taste ingestion complete for', user.platform);
    } catch (e) { console.error('Taste ingestion error:', e); }
  },

  async ingestSpotify(userId, roomId) {
    const token = window.Auth.getSpotifyToken();
    if (!token) return;
    const endpoints = [
      'https://api.spotify.com/v1/me/top/tracks?limit=50&time_range=long_term',
      'https://api.spotify.com/v1/me/top/tracks?limit=50&time_range=medium_term',
      'https://api.spotify.com/v1/me/player/recently-played?limit=50',
      'https://api.spotify.com/v1/me/tracks?limit=50'
    ];
    const allTracks = [];
    const trackMap = new Map();
    for (const url of endpoints) {
      try {
        const resp = await fetch(url, { headers: { Authorization: 'Bearer ' + token } });
        if (!resp.ok) continue;
        const data = await resp.json();
        const items = data.items || [];
        for (const item of items) {
          const track = item.track || item;
          if (track.id && !trackMap.has(track.id)) {
            trackMap.set(track.id, track);
            allTracks.push(track);
          }
        }
      } catch (e) { console.error('Spotify fetch error:', e); }
    }
    const trackIds = [];
    const songs = [];
    for (const track of allTracks) {
      trackIds.push(track.id);
      let features = { energy: 0.5, valence: 0.5, tempo: 120, danceability: 0.5 };
      try {
        const fResp = await fetch(`https://api.spotify.com/v1/audio-features/${track.id}`, { headers: { Authorization: 'Bearer ' + token } });
        if (fResp.ok) { const f = await fResp.json(); features = { energy: f.energy || 0.5, valence: f.valence || 0.5, tempo: f.tempo || 120, danceability: f.danceability || 0.5 }; }
      } catch (e) {}
      songs.push({
        platform: 'spotify', platform_track_id: track.id, title: track.name, artist: track.artists?.[0]?.name || 'Unknown',
        album_art_url: track.album?.images?.[0]?.url || '', duration_ms: track.duration_ms || 0,
        energy: features.energy, valence: features.valence, tempo: features.tempo, danceability: features.danceability
      });
    }
    await window.SupabaseDB.insertTasteProfile(userId, roomId, trackIds, 'spotify');
    await window.SupabaseDB.insertSongs(roomId, songs);
  },

  async ingestYouTube(userId, roomId) {
    const token = window.Auth.getYouTubeToken();
    if (!token) return;
    const videoIds = [];
    try {
      const likedResp = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails&myRating=like&maxResults=50`, { headers: { Authorization: 'Bearer ' + token } });
      if (likedResp.ok) {
        const data = await likedResp.json();
        for (const item of (data.items || [])) videoIds.push(item.id);
      }
    } catch (e) {}
    try {
      const channelResp = await fetch(`https://www.googleapis.com/youtube/v3/channels?part=contentDetails&mine=true`, { headers: { Authorization: 'Bearer ' + token } });
      if (channelResp.ok) {
        const cData = await channelResp.json();
        const wlId = cData.items?.[0]?.contentDetails?.relatedPlaylists?.watchLater;
        if (wlId) {
          const wlResp = await fetch(`https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&playlistId=${wlId}&maxResults=50`, { headers: { Authorization: 'Bearer ' + token } });
          if (wlResp.ok) {
            const wlData = await wlResp.json();
            for (const item of (wlData.items || [])) { const vid = item.snippet?.resourceId?.videoId; if (vid && !videoIds.includes(vid)) videoIds.push(vid); }
          }
        }
      }
    } catch (e) {}
    const songs = [];
    for (const vidId of videoIds) {
      const mood = this.estimateMoodFromYouTube({ id: vidId, snippet: { title: 'Unknown', categoryId: '10' } });
      songs.push({ platform: 'youtube', platform_track_id: vidId, title: 'YouTube Video', artist: 'Unknown', album_art_url: '', duration_ms: 0, ...mood });
    }
    await window.SupabaseDB.insertTasteProfile(userId, roomId, videoIds, 'youtube');
    await window.SupabaseDB.insertSongs(roomId, songs);
  },

  async ingestAppleMusic(userId, roomId) {
    const music = window.MusicKit?.getInstance();
    if (!music) return;
    const catalogIds = [];
    try {
      const lib = await music.api.library.songs({ limit: 100 });
      for (const song of (lib || [])) { if (song.id && !catalogIds.includes(song.id)) catalogIds.push(song.id); }
    } catch (e) {}
    try {
      const recent = await music.api.recentlyPlayed();
      for (const song of (recent || [])) { if (song.id && !catalogIds.includes(song.id)) catalogIds.push(song.id); }
    } catch (e) {}
    const songs = [];
    for (const id of catalogIds) {
      songs.push({ platform: 'apple', platform_track_id: id, title: 'Apple Music Track', artist: 'Unknown', album_art_url: '', duration_ms: 0, energy: 0.5, valence: 0.5, tempo: 120, danceability: 0.5 });
    }
    await window.SupabaseDB.insertTasteProfile(userId, roomId, catalogIds, 'apple');
    await window.SupabaseDB.insertSongs(roomId, songs);
  },

  estimateMoodFromYouTube(video) {
    let energy = 0.5, valence = 0.5, tempo = 120, danceability = 0.5;
    const categoryMap = { '10': [0.6, 0.5], '24': [0.7, 0.6], '1': [0.4, 0.4], '17': [0.8, 0.7] };
    const cat = video.snippet?.categoryId;
    if (categoryMap[cat]) { energy = categoryMap[cat][0]; valence = categoryMap[cat][1]; }
    const title = (video.snippet?.title || '').toLowerCase();
    const tags = (video.snippet?.tags || []).join(' ').toLowerCase();
    const desc = (video.snippet?.description || '').toLowerCase();
    const allText = title + ' ' + tags + ' ' + desc;
    if (/party|dance|club|hype|banger|remix/.test(allText)) energy = Math.min(1, energy + 0.2);
    if (/slow|sad|acoustic|ballad|sleep|calm/.test(allText)) energy = Math.max(0, energy - 0.2);
    if (/happy|joy|love|celebrate/.test(allText)) valence = Math.min(1, valence + 0.2);
    if (/sad|cry|heartbreak|melancholy/.test(allText)) valence = Math.max(0, valence - 0.2);
    if (energy > 0.7) tempo = 140; else if (energy < 0.3) tempo = 80; else tempo = 120;
    if (/dance|party|club|remix/.test(allText)) danceability = 0.8;
    return { energy, valence, tempo, danceability };
  }
};
