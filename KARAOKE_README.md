# 🎤 Karaoke Party - Real-Time Multi-Device Karaoke

A **modern, production-ready web app** for real-time karaoke where multiple people can sing together from different devices with microphone input transmitted in real-time.

## ✨ Features

- 🎵 **Real-time Voice Transmission** - WebRTC peer-to-peer audio streaming
- 📱 **Multi-Device Support** - Works on phones, tablets, laptops
- 🎤 **Microphone Input** - Professional audio processing with echo cancellation
- 🎨 **Beautiful UI** - Modern gradient design with animations
- 📊 **Live Visualizer** - Frequency spectrum visualization of audio input
- 📈 **Mic Level Meter** - Real-time audio level indicator
- 🚪 **Room System** - Create rooms or join with room codes
- 🌐 **No Backend Required** - Fully client-side, uses PeerJS for P2P connections
- 📱 **Mobile Optimized** - Responsive design works on all screen sizes

## 🚀 Quick Start

### Option 1: Local Network (2 devices on same WiFi)

1. **Start the HTTP server:**
```bash
cd /path/to/viblend
python3 -m http.server 8000
```

2. **Find your Mac's local IP:**
```bash
ifconfig | grep "inet " | grep -v 127.0.0.1 | head -1
```
Example output: `192.168.1.100`

3. **On each phone/device:**
   - Open: `http://192.168.1.100:8000/karaoke.html`
   - Enter your name
   - Device 1: Click **"Create Room"** → copy room code
   - Device 2: Enter room code → Click **"Join Room"**

4. **Start singing:**
   - Click **"Start Singing"** → Allow microphone
   - Click **"Play Song"** → Select a song
   - Both voices transmit to each other in real-time!

### Option 2: Deploy Online (Coming Soon)

- Deploy to Vercel/Netlify for worldwide access
- Works from anywhere with internet

## 📋 Requirements

- **Browser** with WebRTC support (Chrome, Firefox, Safari, Edge)
- **Microphone** access (required to grant permission in browser)
- **Internet connection** (even on local network, WebRTC needs signaling)

## 🎯 How It Works

1. **Room Creation** - First device creates a room with a unique code
2. **Room Join** - Other devices join using the room code
3. **Peer Connection** - Devices establish direct P2P connection via WebRTC
4. **Audio Streaming** - Microphone input is captured and sent to all peers
5. **Audio Playback** - Remote audio mixed with local song playback

### Technology Stack

- **Frontend:** HTML5, CSS3, JavaScript
- **Audio:** Web Audio API, getUserMedia API
- **P2P Network:** PeerJS (wrapper around WebRTC)
- **Server:** Simple HTTP server (no backend needed for demo)

## 🎤 Controls

| Button | Function |
|--------|----------|
| **Create Room** | Start a new karaoke party |
| **Join Room** | Join existing party with room code |
| **Start Singing** | Enable microphone input |
| **Play Song** | Start playing background music |
| **Microphone Level** | Visual indicator of mic input volume |

## 🎵 Available Songs

- Shape of You - Ed Sheeran
- Blinding Lights - The Weeknd
- Don't Start Now - Dua Lipa
- Levitating - Dua Lipa
- Bad Habits - Ed Sheeran

*Note: Demo uses generated tones. Can be extended with real audio files.*

## 🔧 Customization

### Add More Songs

Edit the `SONGS` array in `karaoke.html`:

```javascript
const SONGS = [
  { id: 1, title: "Your Song", artist: "Artist", freq: 440 },
  // ... more songs
];
```

### Change Colors

Modify CSS variables at the top:

```css
:root {
  --primary: #8B5CF6;
  --secondary: #EC4899;
  --accent: #06B6D4;
  /* ... */
}
```

### Adjust Audio Quality

In the `captureAudio()` function:

```javascript
audio: { 
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: false
}
```

## 🐛 Troubleshooting

### Microphone not working?
- Check browser permissions (Safari: Settings → Websites → Microphone)
- Allow "karaoke.html" access to microphone
- Try HTTPS (required for HTTPS sites)

### Can't connect to other device?
- Make sure both devices are on same network
- Check firewall settings (port 8000 must be accessible)
- Try local IP instead of 127.0.0.1

### Audio latency?
- Normal P2P latency is 50-200ms
- Reduce audio processing if needed
- Close other apps to free up network bandwidth

## 📱 Browser Support

| Browser | Support |
|---------|---------|
| Chrome | ✅ Full support |
| Firefox | ✅ Full support |
| Safari | ✅ Full support |
| Edge | ✅ Full support |
| Opera | ✅ Full support |

## 📦 Files

- `karaoke.html` - Main app file (all-in-one, no dependencies except PeerJS from CDN)
- `README.md` - This file

## 🚀 Future Enhancements

- [ ] Real audio file streaming (MP3, WAV)
- [ ] Recording functionality
- [ ] Social sharing
- [ ] Leaderboard
- [ ] Voice effects (reverb, echo, pitch shift)
- [ ] Song lyrics display
- [ ] Multiple simultaneous rooms
- [ ] User profiles & history

## 📄 License

Free to use and modify for personal/commercial projects.

## 🤝 Contributing

Found a bug or have a feature request? Open an issue!

## 💡 Tips for Best Experience

1. **Use wired headphones** with microphone for clearer audio
2. **Sit in quiet environment** to minimize background noise
3. **Close other apps** using network for better connection
4. **Use 5GHz WiFi** if available for lower latency
5. **Test microphone levels** before full performance

---

**Made with ❤️ for singing together remotely**

Need help? Check the troubleshooting section or open an issue!
