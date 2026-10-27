# LiveKit Real-Time Voice Assistant (`bot/livekit/`)

Yeh directory hamare **Auto Code IDE** aur **Voice Call Assistant** ke liye open-source **LiveKit Real-Time WebRTC Voice Infrastructure** provide karti hai.

---

## 🌟 Yeh Kyun Zaroori Hai? (Key Advantages)

1. **Original Phone / WhatsApp Call Jaisa Experience:**
   - Browser ke native Web Speech API ke bajaye continuous **WebRTC bidirectional audio stream** use karta hai.
   - Mobile Chrome par mic flapping, freezing, ya permission drop hone ka **0% chance** hota hai.

2. **Conversational Fillers ("Search kar ke batata hoon..."):**
   - Jab user kisi lambe task (maslan Git status, error heal, terminal command) ka bole, to AI freeze hone ya khamosh rehne ke bajaye foran aawaz mein bolega:
     > _"Ji bilkul, main abhi check kar ke batata hoon..."_
   - Aur jaise hi background mein tool complete ho, usi waqt continue karega:
     > _"Aapke workspace mein 2 files modified hain..."_

3. **Instant Barge-In (Interruption):**
   - Jab AI bol raha ho aur user beech mein bol pare, to VAD (Voice Activity Detection) 150ms ke andar AI ko chup karwa deta hai aur user ki nayi baat sunta hai.

---

## 📁 Files & Structure

- **`config.ts`**: LiveKit URL, API Key, Secret, Edge-TTS Urdu/English voices aur VAD settings.
- **`tokenService.ts`**: Web client ke liye secure WebRTC `AccessToken` generate karta hai.
- **`agent.ts`**: Voice Assistant brain (Tool execution, Conversational Fillers, intent classification, Urdu/English prompt handling).
- **`livekitServer.ts`**: Room sessions aur voice dispatch controller.
- **`setup-vps.sh`**: One-click script jo VPS par LiveKit Server ko Docker ya standalone binary ke zariye start karta hai.

---

## 🚀 VPS Par LiveKit Server Start Karne Ka Tareeqa

Aapke VPS par Docker pehle se installed hai. Sirf yeh aik command chalayein:

```bash
./bot/livekit/setup-vps.sh
```

Yeh script:

1. `/etc/livekit/livekit.yaml` config banaye ga.
2. Port `7880` (HTTP/WebSocket) aur `7881` (WebRTC) par LiveKit Server container start kar dega.
3. Server automatically background mein `restart: unless-stopped` ke sath chalta rahega.
