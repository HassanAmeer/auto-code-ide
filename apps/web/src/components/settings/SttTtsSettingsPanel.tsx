import { useState, useRef, useEffect, useMemo, type CSSProperties, type ChangeEvent } from "react";
import { Mic, MicOff, Volume2, Play, Square, Settings2, PhoneCall } from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Switch } from "../ui/switch";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import { SettingsPageContainer, SettingsRow, SettingsSection } from "./settingsLayout";
import {
  type TtsLanguageMode,
  type TtsSettings,
  TTS_ACCENTS,
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
import { useVoiceCallSettings } from "../chat/voiceCall/voiceCallSettings";
import { cn } from "~/lib/utils";

const STT_LANG_LABELS: Record<SttLanguageMode, string> = {
  auto: "Auto Detect (Urdu / Hindi / English / Roman)",
  "roman-urdu": "Roman Urdu (Phonetic)",
  "natural-urdu": "Natural Urdu (اردو رسم الخط)",
  hindi: "Hindi (हिन्दी / Hinglish)",
  english: "English",
};

const TTS_LANG_LABELS: Record<TtsLanguageMode, string> = {
  "auto-male": "Auto Detect (Male Voice)",
  "auto-female": "Auto Detect (Female Voice)",
  "roman-urdu": "Roman Urdu",
  "natural-urdu": "Natural Urdu (اردو)",
  english: "English",
};

export function SttTtsSettingsPanel() {
  const [activeTab, setActiveTab] = useState<"all" | "stt" | "tts" | "call">("all");
  const [voiceSettings, updateVoiceSettings] = useVoiceCallSettings();

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
    const updated: TtsSettings = {
      language: lang,
      rate: tts.rate,
      pitch: tts.pitch,
      volume: tts.volume,
    };
    setTts(updated);
    saveTtsSettings(updated);
    if (lang === "auto-male" || lang === "auto-female") {
      setTestText(
        "Assalam o alaikum! Yeh auto-detected text to speech test hai. T3 Code will read this automatically.",
      );
    } else if (lang === "natural-urdu") {
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
        onResult: (text, _isFinal, cumulative) => {
          setLiveTranscript(cumulative || text);
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

  const availableMaleVoices = useMemo(
    () => getVoicesForMode(voices, tts.language, true),
    [voices, tts.language],
  );

  const selectedVoiceName = useMemo(() => {
    if (!tts.voiceURI || tts.voiceURI === "auto") return "Auto (Male voice prioritized)";
    if (tts.voiceURI === "auto-female") return "Auto (Female voice)";
    if (tts.voiceURI.startsWith("accent:")) {
      const accent = TTS_ACCENTS.find((a) => a.id === tts.voiceURI);
      if (accent) return accent.name;
    }
    const found = voices.find((v) => v.voiceURI === tts.voiceURI);
    return found ? `${found.name} (${found.lang})` : "Auto (Male voice prioritized)";
  }, [tts.voiceURI, voices]);

  // Slider progress ratios for native slider styling
  const speedProgressRatio = (tts.rate - 0.5) / (1.75 - 0.5);
  const speedSliderStyle = {
    "--settings-slider-progress": `${Math.max(0, Math.min(1, speedProgressRatio)) * 100}%`,
    "--settings-slider-fill-offset": `${0.5 - speedProgressRatio}rem`,
  } as CSSProperties;

  const pitchProgressRatio = (tts.pitch - 0.5) / (1.5 - 0.5);
  const pitchSliderStyle = {
    "--settings-slider-progress": `${Math.max(0, Math.min(1, pitchProgressRatio)) * 100}%`,
    "--settings-slider-fill-offset": `${0.5 - pitchProgressRatio}rem`,
  } as CSSProperties;

  return (
    <SettingsPageContainer>
      {/* Tab Filter Header */}
      <div className="flex items-center justify-between pb-1">
        <div className="flex items-center gap-1 rounded-lg border border-border/60 bg-muted/30 p-1">
          <button
            type="button"
            onClick={() => setActiveTab("all")}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition-colors cursor-pointer",
              activeTab === "all"
                ? "bg-background text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Settings2 className="size-3.5" />
            All
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("stt")}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition-colors cursor-pointer",
              activeTab === "stt"
                ? "bg-background text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Mic className="size-3.5" />
            Speech-to-Text
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("tts")}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition-colors cursor-pointer",
              activeTab === "tts"
                ? "bg-background text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Volume2 className="size-3.5" />
            Text-to-Speech
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("call")}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition-colors cursor-pointer",
              activeTab === "call"
                ? "bg-background text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <PhoneCall className="size-3.5" />
            Voice Call
          </button>
        </div>
      </div>

      {/* VOICE CALL ASSISTANT SECTION */}
      {(activeTab === "all" || activeTab === "call") && (
        <SettingsSection
          id="voice-call-section"
          title="Voice Call Assistant"
          icon={<PhoneCall className="size-4" />}
        >
          <SettingsRow
            title="Voice Call Thinking Sound"
            description="Play ambient wave sound while assistant prepares response"
            control={
              <Switch
                checked={voiceSettings.thinkingWaveSound}
                onCheckedChange={(checked) => updateVoiceSettings({ thinkingWaveSound: checked })}
                aria-label="Voice Call Thinking Sound"
              />
            }
          />
        </SettingsSection>
      )}

      {/* SPEECH-TO-TEXT SECTION */}
      {(activeTab === "all" || activeTab === "stt") && (
        <SettingsSection
          id="stt-section"
          title="Speech-to-Text (STT)"
          icon={<Mic className="size-4" />}
        >
          <SettingsRow
            title="Browser speech engine"
            description={
              isSttSupported
                ? "Chrome Web Speech recognition is active and ready for microphone input."
                : "Web Speech API is not supported in this browser. Please use Chrome for voice dictation."
            }
            control={
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-muted/40 px-2.5 py-0.5 text-xs font-medium text-foreground">
                  <span
                    className={cn(
                      "size-1.5 rounded-full",
                      isSttSupported ? "bg-emerald-500" : "bg-warning",
                    )}
                  />
                  {isSttSupported ? "Active" : "Unavailable"}
                </span>
              </div>
            }
          />

          <SettingsRow
            title="Dictation language & dialect"
            description="Select which spoken dialect or accent the microphone transcribes."
            control={
              <Select
                value={stt.language}
                onValueChange={(val) => {
                  if (val) updateSttLanguage(val as SttLanguageMode);
                }}
              >
                <SelectTrigger size="sm" className="w-full sm:w-56" aria-label="Dictation language">
                  <SelectValue>{STT_LANG_LABELS[stt.language]}</SelectValue>
                </SelectTrigger>
                <SelectPopup align="end" alignItemWithTrigger={false}>
                  <SelectItem hideIndicator value="auto">
                    Auto Detect (Urdu / Hindi / English / Roman)
                  </SelectItem>
                  <SelectItem hideIndicator value="roman-urdu">
                    Roman Urdu (Phonetic)
                  </SelectItem>
                  <SelectItem hideIndicator value="natural-urdu">
                    Natural Urdu (اردو رسم الخط)
                  </SelectItem>
                  <SelectItem hideIndicator value="hindi">
                    Hindi (हिन्दी / Hinglish)
                  </SelectItem>
                  <SelectItem hideIndicator value="english">
                    English
                  </SelectItem>
                </SelectPopup>
              </Select>
            }
          />

          <SettingsRow
            title="Microphone test"
            description="Test your microphone recognition and view real-time transcription."
            control={
              <Button
                type="button"
                size="sm"
                variant={isListening ? "destructive" : "outline"}
                disabled={!isSttSupported}
                onClick={toggleTestMic}
                className="flex items-center gap-2"
              >
                {isListening ? (
                  <>
                    <MicOff className="size-3.5" /> Stop Listening
                  </>
                ) : (
                  <>
                    <Mic className="size-3.5" /> Start Test
                  </>
                )}
              </Button>
            }
          />

          {/* Test Transcript Preview Box */}
          <div className="p-3 sm:p-4 bg-muted/20 border-t border-border/50">
            <div className="flex items-center justify-between text-xs text-muted-foreground font-mono mb-2">
              <span>Live transcription output:</span>
              {isListening && (
                <span className="flex items-center gap-1.5 font-sans font-medium text-destructive animate-pulse">
                  <span className="size-1.5 rounded-full bg-destructive" />
                  Listening now in {STT_LANG_LABELS[stt.language]}...
                </span>
              )}
            </div>
            {sttError ? (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 p-2.5 text-xs text-destructive">
                {sttError}
              </div>
            ) : (
              <div
                className={cn(
                  "rounded-md border border-border/60 bg-background/80 p-3 text-sm min-h-14 flex items-center",
                  !liveTranscript && "text-muted-foreground italic",
                )}
              >
                {liveTranscript ||
                  (isListening
                    ? "Speak into your microphone now..."
                    : "Click 'Start Test' and speak into your microphone to verify recognition.")}
              </div>
            )}
          </div>
        </SettingsSection>
      )}

      {/* TEXT-TO-SPEECH SECTION */}
      {(activeTab === "all" || activeTab === "tts") && (
        <SettingsSection
          id="tts-section"
          title="Text-to-Speech (TTS)"
          icon={<Volume2 className="size-4" />}
        >
          <SettingsRow
            title="Voice accent & dialect"
            description="Select which language accent is used, or let auto-detect choose the language based on response text."
            control={
              <Select
                value={tts.language}
                onValueChange={(val) => {
                  if (val) updateTtsLanguage(val as TtsLanguageMode);
                }}
              >
                <SelectTrigger size="sm" className="w-full sm:w-64" aria-label="Voice accent">
                  <SelectValue>{TTS_LANG_LABELS[tts.language]}</SelectValue>
                </SelectTrigger>
                <SelectPopup
                  align="end"
                  alignItemWithTrigger={false}
                  className="max-h-72 overflow-y-auto"
                >
                  <SelectItem hideIndicator value="auto-male">
                    Auto Detect (Male Voice)
                  </SelectItem>
                  <SelectItem hideIndicator value="auto-female">
                    Auto Detect (Female Voice)
                  </SelectItem>
                  <div className="my-1 border-t border-border/40" />
                  <SelectItem hideIndicator value="roman-urdu">
                    Roman Urdu
                  </SelectItem>
                  <SelectItem hideIndicator value="natural-urdu">
                    Natural Urdu (اردو)
                  </SelectItem>
                  <SelectItem hideIndicator value="english">
                    English
                  </SelectItem>
                </SelectPopup>
              </Select>
            }
          />

          <SettingsRow
            title="Synthesizer voice"
            description="Choose a browser synthesizer voice or curated accent (male voices prioritized automatically)."
            control={
              <Select
                value={tts.voiceURI || "auto"}
                onValueChange={(val) => updateTtsVoiceURI(val === "auto" || !val ? "" : val)}
              >
                <SelectTrigger size="sm" className="w-full sm:w-64" aria-label="Synthesizer voice">
                  <SelectValue>{selectedVoiceName}</SelectValue>
                </SelectTrigger>
                <SelectPopup
                  align="end"
                  alignItemWithTrigger={false}
                  className="max-h-80 overflow-y-auto"
                >
                  <SelectItem hideIndicator value="auto">
                    Auto (Male voice prioritized)
                  </SelectItem>
                  <SelectItem hideIndicator value="auto-female">
                    Auto (Female voice)
                  </SelectItem>

                  {/* Curated Accents */}
                  <div className="px-2 pt-2 pb-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                    Roman Urdu Accents
                  </div>
                  {TTS_ACCENTS.filter((a) => a.category === "roman-urdu").map((a) => (
                    <SelectItem hideIndicator key={a.id} value={a.id}>
                      {a.name}
                    </SelectItem>
                  ))}

                  <div className="px-2 pt-2 pb-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                    Natural Urdu Accents
                  </div>
                  {TTS_ACCENTS.filter((a) => a.category === "natural-urdu").map((a) => (
                    <SelectItem hideIndicator key={a.id} value={a.id}>
                      {a.name}
                    </SelectItem>
                  ))}

                  <div className="px-2 pt-2 pb-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                    Hindi Accents
                  </div>
                  {TTS_ACCENTS.filter((a) => a.category === "hindi").map((a) => (
                    <SelectItem hideIndicator key={a.id} value={a.id}>
                      {a.name}
                    </SelectItem>
                  ))}

                  <div className="px-2 pt-2 pb-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                    English Accents
                  </div>
                  {TTS_ACCENTS.filter((a) => a.category === "english").map((a) => (
                    <SelectItem hideIndicator key={a.id} value={a.id}>
                      {a.name}
                    </SelectItem>
                  ))}

                  {availableMaleVoices.length > 0 && (
                    <>
                      <div className="px-2 pt-2 pb-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider border-t border-border/40 mt-1">
                        Browser Synthesizer Voices (Male)
                      </div>
                      {availableMaleVoices.map((v) => (
                        <SelectItem hideIndicator key={v.voiceURI} value={v.voiceURI}>
                          {v.name} ({v.lang})
                        </SelectItem>
                      ))}
                    </>
                  )}
                </SelectPopup>
              </Select>
            }
          />

          <SettingsRow
            title="Speech speed"
            description="Speed rate for text-to-speech audio synthesis."
            control={
              <div className="flex w-full items-center gap-3 sm:w-56">
                <span className="w-10 text-right font-mono text-xs tabular-nums text-muted-foreground">
                  {tts.rate.toFixed(2)}x
                </span>
                <input
                  aria-label="Speech speed"
                  className="settings-slider min-w-0 flex-1 cursor-pointer"
                  id="tts-speed"
                  max={1.75}
                  min={0.5}
                  step={0.05}
                  type="range"
                  style={speedSliderStyle}
                  value={tts.rate}
                  onChange={(e: ChangeEvent<HTMLInputElement>) =>
                    updateTtsRate(parseFloat(e.currentTarget.value))
                  }
                />
              </div>
            }
          />

          <SettingsRow
            title="Voice pitch"
            description="Pitch tone frequency for spoken voice."
            control={
              <div className="flex w-full items-center gap-3 sm:w-56">
                <span className="w-10 text-right font-mono text-xs tabular-nums text-muted-foreground">
                  {tts.pitch.toFixed(2)}x
                </span>
                <input
                  aria-label="Voice pitch"
                  className="settings-slider min-w-0 flex-1 cursor-pointer"
                  id="tts-pitch"
                  max={1.5}
                  min={0.5}
                  step={0.05}
                  type="range"
                  style={pitchSliderStyle}
                  value={tts.pitch}
                  onChange={(e: ChangeEvent<HTMLInputElement>) =>
                    updateTtsPitch(parseFloat(e.currentTarget.value))
                  }
                />
              </div>
            }
          />

          <SettingsRow
            title="Preview voice output"
            description="Type a test phrase and verify your speed, pitch, and voice settings."
            control={
              <div className="flex w-full items-center gap-2 sm:w-96">
                <Input
                  value={testText}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => setTestText(e.target.value)}
                  placeholder="Type text to speak..."
                  className="h-8 text-xs flex-1"
                />
                <Button
                  type="button"
                  size="sm"
                  variant={isSpeaking ? "destructive" : "outline"}
                  onClick={handleTestSpeak}
                  className="shrink-0 flex items-center gap-1.5"
                >
                  {isSpeaking ? (
                    <>
                      <Square className="size-3 fill-current" /> Stop
                    </>
                  ) : (
                    <>
                      <Play className="size-3 fill-current" /> Speak
                    </>
                  )}
                </Button>
              </div>
            }
          />
        </SettingsSection>
      )}
    </SettingsPageContainer>
  );
}
