/**
 * LiveKit Voice Agent Configuration (bot/livekit/config.ts)
 */

export interface LiveKitConfig {
  /** WebSocket or HTTPS URL for LiveKit Server (e.g. ws://127.0.0.1:7880 or wss://my-project.livekit.cloud) */
  url: string;
  /** LiveKit API Key */
  apiKey: string;
  /** LiveKit API Secret */
  apiSecret: string;
  /** Default Agent Persona & Language */
  defaultLanguage: "urdu" | "english" | "bilingual";
  /** Model to use for the Voice Agent brain (Groq / Gemini / OpenAI) */
  modelName: string;
  /** Natural Urdu & English TTS Voice settings */
  tts: {
    urduVoice: string;
    englishVoice: string;
    rate: number;
    pitch: number;
  };
  /** Real-time VAD (Voice Activity Detection) Parameters */
  vad: {
    minSpeechDurationMs: number;
    minSilenceDurationMs: number;
    prefixPaddingMs: number;
  };
}

export function loadLiveKitConfig(): LiveKitConfig {
  return {
    url: process.env.LIVEKIT_URL || "ws://127.0.0.1:7880",
    apiKey: process.env.LIVEKIT_API_KEY || "devkey",
    apiSecret: process.env.LIVEKIT_API_SECRET || "secret",
    defaultLanguage: (process.env.LIVEKIT_AGENT_LANG as any) || "bilingual",
    modelName: process.env.LIVEKIT_AGENT_MODEL || "groq/llama-3.3-70b-versatile",
    tts: {
      urduVoice: process.env.LIVEKIT_URDU_VOICE || "ur-PK-AsadNeural",
      englishVoice: process.env.LIVEKIT_EN_VOICE || "en-US-JennyNeural",
      rate: parseFloat(process.env.LIVEKIT_TTS_RATE || "1.0"),
      pitch: parseFloat(process.env.LIVEKIT_TTS_PITCH || "1.0"),
    },
    vad: {
      minSpeechDurationMs: 150,
      minSilenceDurationMs: 400,
      prefixPaddingMs: 250,
    },
  };
}
