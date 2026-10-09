import { useState, useRef, useEffect, type ChangeEvent } from "react";
import { Mic, MicOff, Volume2, Play, Square, CheckCircle2, AlertCircle } from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import {
  type TtsLanguageMode,
  type TtsSettings,
  loadTtsSettings,
  saveTtsSettings,
  getAvailableVoices,
  getVoicesForMode,
  speakText,
  stopSpeaking,
  subscribeSpeechState,
} from "~/lib/speech/tts";
import {
  type SttLanguageMode,
  type SttSettings,
  loadSttSettings,
  saveSttSettings,
  createSttSession,
  isSpeechRecognitionSupported,
  type SttController,
} from "~/lib/speech/stt";

export function SttTtsSettingsPanel() {
  const [activeTab, setActiveTab] = useState<"stt" | "tts">("stt");

  // --- TTS State ---
  const [tts, setTts] = useState<TtsSettings>(loadTtsSettings);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [testText, setTestText] = useState(
    "Assalam o alaikum! Yeh T3 Code ka text to speech test hai.",
  );
  const [isSpeaking, setIsSpeaking] = useState(false);

  // --- STT State ---
  const [stt, setStt] = useState<SttSettings>(loadSttSettings);
  const [isListening, setIsListening] = useState(false);
  const [liveTranscript, setLiveTranscript] = useState("");
  const [sttError, setSttError] = useState<string | null>(null);
  const sessionRef = useRef<SttController | null>(null);
  const isSttSupported = isSpeechRecognitionSupported();

  useEffect(() => {
    const updateVoices = () => {
      setVoices(getAvailableVoices());
    };
    updateVoices();
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.onvoiceschanged = updateVoices;
    }
    return () => {
      sessionRef.current?.stop();
      stopSpeaking();
    };
  }, []);

  useEffect(() => {
    return subscribeSpeechState((speaking) => {
      setIsSpeaking(speaking);
    });
  }, []);

  // --- TTS Handlers ---
  const updateTtsLanguage = (lang: TtsLanguageMode) => {
    const updated = { ...tts, language: lang, voiceURI: undefined };
    setTts(updated);
    saveTtsSettings(updated);
    if (lang === "natural-urdu") {
      setTestText("السلام علیکم! یہ ٹی تھری کوڈ کا ٹیکسٹ ٹو اسپیچ ٹیسٹ ہے۔");
    } else if (lang === "english") {
      setTestText("Hello! This is a text to speech test for T3 Code.");
    } else {
      setTestText("Assalam o alaikum! Yeh T3 Code ka text to speech test hai.");
    }
  };

  const updateTtsRate = (rate: number) => {
    const updated = { ...tts, rate };
    setTts(updated);
    saveTtsSettings(updated);
  };

  const updateTtsPitch = (pitch: number) => {
    const updated = { ...tts, pitch };
    setTts(updated);
    saveTtsSettings(updated);
  };

  const updateTtsVoiceURI = (voiceURI: string) => {
    const updated = { ...tts, voiceURI };
    setTts(updated);
    saveTtsSettings(updated);
  };

  const handleTestSpeak = () => {
    if (isSpeaking) {
      stopSpeaking();
    } else {
      speakText(testText, tts);
    }
  };

  // --- STT Handlers ---
  const updateSttLanguage = (lang: SttLanguageMode) => {
    if (isListening) {
      sessionRef.current?.stop();
      setIsListening(false);
    }
    const updated = { ...stt, language: lang };
    setStt(updated);
    saveSttSettings(updated);
  };

  const toggleTestMic = () => {
    setSttError(null);
    if (isListening) {
      sessionRef.current?.stop();
      setIsListening(false);
    } else {
      setLiveTranscript("");
      const session = createSttSession({
        mode: stt.language,
        onResult: (text, isFinal) => {
          setLiveTranscript(text);
        },
        onStateChange: (active) => {
          setIsListening(active);
        },
        onError: (err) => {
          setSttError(`Microphone error: ${err}`);
          setIsListening(false);
        },
      });
      sessionRef.current = session;
      session.start();
      setIsListening(true);
    }
  };

  const availableFilteredVoices = getVoicesForMode(voices, tts.language);

  return (
    <div className="flex flex-col gap-6 max-w-2xl">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">STT-TTS Settings</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Configure Speech-to-Text (STT) and Text-to-Speech (TTS) for Roman Urdu, Natural Urdu, and
          English.
        </p>
      </div>

      {/* Top Tabs */}
      <div className="flex border-b border-border gap-2">
        <button
          type="button"
          onClick={() => setActiveTab("stt")}
          className={`flex items-center gap-2 pb-2.5 px-3 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "stt"
              ? "border-primary text-foreground font-semibold"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <Mic className="size-4" />
          <span>Speech-to-Text (STT)</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("tts")}
          className={`flex items-center gap-2 pb-2.5 px-3 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "tts"
              ? "border-primary text-foreground font-semibold"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <Volume2 className="size-4" />
          <span>Text-to-Speech (TTS)</span>
        </button>
      </div>

      {/* STT TAB CONTENT */}
      {activeTab === "stt" && (
        <div className="flex flex-col gap-5">
          {/* Browser Support Indicator */}
          <div
            className={`flex items-center gap-2 p-3 rounded-md border text-sm ${
              isSttSupported
                ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-400"
                : "border-amber-500/20 bg-amber-500/10 text-amber-400"
            }`}
          >
            {isSttSupported ? (
              <>
                <CheckCircle2 className="size-4 shrink-0 text-emerald-500" />
                <span>Chrome Web Speech API is active for Speech-to-Text.</span>
              </>
            ) : (
              <>
                <AlertCircle className="size-4 shrink-0 text-amber-500" />
                <span>
                  Web Speech API not detected. Please use Google Chrome for voice dictation.
                </span>
              </>
            )}
          </div>

          {/* STT Language Selection */}
          <div className="flex flex-col gap-2 rounded-lg border border-border p-4 bg-card">
            <label className="text-sm font-medium">Dictation Accent / Language</label>
            <p className="text-xs text-muted-foreground mb-2">
              Select what accent the microphone transcribes when speaking.
            </p>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => updateSttLanguage("roman-urdu")}
                className={`p-3 rounded-md border text-sm font-medium text-left transition-colors ${
                  stt.language === "roman-urdu"
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border hover:bg-muted"
                }`}
              >
                <div className="font-semibold">Roman Urdu</div>
                <div className="text-xs text-muted-foreground mt-1">Spoken Urdu / Phonetic</div>
              </button>
              <button
                type="button"
                onClick={() => updateSttLanguage("natural-urdu")}
                className={`p-3 rounded-md border text-sm font-medium text-left transition-colors ${
                  stt.language === "natural-urdu"
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border hover:bg-muted"
                }`}
              >
                <div className="font-semibold">Natural Urdu</div>
                <div className="text-xs text-muted-foreground mt-1">اردو الفاظ (Urdu script)</div>
              </button>
              <button
                type="button"
                onClick={() => updateSttLanguage("english")}
                className={`p-3 rounded-md border text-sm font-medium text-left transition-colors ${
                  stt.language === "english"
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border hover:bg-muted"
                }`}
              >
                <div className="font-semibold">English</div>
                <div className="text-xs text-muted-foreground mt-1">Standard English</div>
              </button>
            </div>
          </div>

          {/* STT Test Playground */}
          <div className="flex flex-col gap-3 rounded-lg border border-border p-4 bg-card">
            <label className="text-sm font-medium flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Mic className="size-4 text-primary" /> Test Microphone Recognition
              </span>
              {isListening && (
                <span className="text-xs text-red-500 font-normal animate-pulse">
                  ● Listening...
                </span>
              )}
            </label>
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <Button
                  type="button"
                  onClick={toggleTestMic}
                  disabled={!isSttSupported}
                  variant={isListening ? "destructive" : "default"}
                  className="flex items-center gap-2"
                >
                  {isListening ? (
                    <>
                      <MicOff className="size-4" /> Stop Listening
                    </>
                  ) : (
                    <>
                      <Mic className="size-4" /> Start Microphone Test
                    </>
                  )}
                </Button>
                {isListening && (
                  <span className="text-xs text-muted-foreground animate-pulse">
                    Speak now in {stt.language.replace("-", " ")}...
                  </span>
                )}
              </div>

              {sttError && (
                <div className="p-2.5 rounded bg-destructive/10 text-destructive text-xs">
                  {sttError}
                </div>
              )}

              <div className="min-h-20 rounded-md border border-input bg-muted/40 p-3 text-sm flex flex-col justify-between">
                <div className="font-mono text-xs text-muted-foreground mb-1">
                  Live Transcription Output:
                </div>
                <div className="text-foreground italic">
                  {liveTranscript
                    ? liveTranscript
                    : "(No speech detected yet. Click start and speak into your mic)"}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TTS TAB CONTENT */}
      {activeTab === "tts" && (
        <div className="flex flex-col gap-5">
          {/* TTS Language Selection */}
          <div className="flex flex-col gap-2 rounded-lg border border-border p-4 bg-card">
            <label className="text-sm font-medium">
              Spoken Language / Accent (Male Prioritized)
            </label>
            <p className="text-xs text-muted-foreground mb-2">
              Choose the primary voice accent for agent response read-aloud.
            </p>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => updateTtsLanguage("roman-urdu")}
                className={`p-3 rounded-md border text-sm font-medium text-left transition-colors ${
                  tts.language === "roman-urdu"
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border hover:bg-muted"
                }`}
              >
                <div className="font-semibold">Roman Urdu</div>
                <div className="text-xs text-muted-foreground mt-1">Urdu in Latin script</div>
              </button>
              <button
                type="button"
                onClick={() => updateTtsLanguage("natural-urdu")}
                className={`p-3 rounded-md border text-sm font-medium text-left transition-colors ${
                  tts.language === "natural-urdu"
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border hover:bg-muted"
                }`}
              >
                <div className="font-semibold">Natural Urdu</div>
                <div className="text-xs text-muted-foreground mt-1">اردو الفاظ و رسم الخط</div>
              </button>
              <button
                type="button"
                onClick={() => updateTtsLanguage("english")}
                className={`p-3 rounded-md border text-sm font-medium text-left transition-colors ${
                  tts.language === "english"
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border hover:bg-muted"
                }`}
              >
                <div className="font-semibold">English</div>
                <div className="text-xs text-muted-foreground mt-1">Standard English</div>
              </button>
            </div>
          </div>

          {/* Voice Dropdown */}
          <div className="flex flex-col gap-2 rounded-lg border border-border p-4 bg-card">
            <label className="text-sm font-medium">Browser Voice (Male Prioritized)</label>
            <p className="text-xs text-muted-foreground mb-1">
              Select from available Chrome system voices.
            </p>
            <select
              value={tts.voiceURI ?? ""}
              onChange={(e: ChangeEvent<HTMLSelectElement>) => updateTtsVoiceURI(e.target.value)}
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <option value="">Auto (Best Matching Male Voice)</option>
              {availableFilteredVoices.map((v) => (
                <option key={v.voiceURI} value={v.voiceURI}>
                  {v.name} ({v.lang})
                </option>
              ))}
            </select>
          </div>

          {/* Speed & Pitch Controls */}
          <div className="grid grid-cols-2 gap-4 rounded-lg border border-border p-4 bg-card">
            <div className="flex flex-col gap-2">
              <div className="flex justify-between items-center text-sm font-medium">
                <span>Speech Speed</span>
                <span className="text-xs text-muted-foreground">{tts.rate}x</span>
              </div>
              <input
                type="range"
                min="0.5"
                max="1.75"
                step="0.05"
                value={tts.rate}
                onChange={(e: ChangeEvent<HTMLInputElement>) =>
                  updateTtsRate(parseFloat(e.target.value))
                }
                className="w-full accent-primary cursor-pointer"
              />
            </div>
            <div className="flex flex-col gap-2">
              <div className="flex justify-between items-center text-sm font-medium">
                <span>Pitch</span>
                <span className="text-xs text-muted-foreground">{tts.pitch}x</span>
              </div>
              <input
                type="range"
                min="0.5"
                max="1.5"
                step="0.05"
                value={tts.pitch}
                onChange={(e: ChangeEvent<HTMLInputElement>) =>
                  updateTtsPitch(parseFloat(e.target.value))
                }
                className="w-full accent-primary cursor-pointer"
              />
            </div>
          </div>

          {/* TTS Test Playground */}
          <div className="flex flex-col gap-3 rounded-lg border border-border p-4 bg-card">
            <label className="text-sm font-medium flex items-center gap-2">
              <Volume2 className="size-4 text-primary" /> Test Voice Output
            </label>
            <div className="flex gap-2">
              <Input
                value={testText}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setTestText(e.target.value)}
                placeholder="Type text to speak..."
                className="flex-1"
              />
              <Button
                type="button"
                onClick={handleTestSpeak}
                variant={isSpeaking ? "destructive" : "default"}
                className="shrink-0 flex items-center gap-1.5"
              >
                {isSpeaking ? (
                  <>
                    <Square className="size-3.5 fill-current" /> Stop
                  </>
                ) : (
                  <>
                    <Play className="size-3.5 fill-current" /> Speak Test
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
