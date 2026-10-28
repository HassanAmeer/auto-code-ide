import { useState, useRef, useEffect, useMemo, type CSSProperties, type ChangeEvent } from "react";
import { Mic, MicOff, Volume2, Play, Square, Settings2, PhoneCall } from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Switch } from "../ui/switch";
import {
  Select,
  SelectGroup,
  SelectGroupLabel,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { SettingsPageContainer, SettingsRow, SettingsSection } from "./settingsLayout";
import {
  type TtsLanguageMode,
  type TtsSettings,
  type TtsVoiceId,
  type TtsDeliveryStyleId,
  VOICE_DELIVERY_STYLES,
  TTS_ACCENTS,
  TTS_LANG_LABELS,
  loadTtsSettings,
  saveTtsSettings,
  getActiveTtsPreset,
  normalizeTtsLanguage,
  getAvailableVoices,
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
import {
  loadNoiseShieldSettings,
  saveNoiseShieldSettings,
  subscribeNoiseShieldSettings,
  type AcousticNoiseShieldSettings,
} from "~/lib/speech/acousticNoiseShield";
import { useVoiceCallSettings } from "../chat/voiceCall/voiceCallSettings";
import { cn } from "~/lib/utils";

const STT_LANG_LABELS: Record<string, string> = {
  auto: "Auto Detect (Urdu / Hindi / English / Roman)",
  "roman-urdu": "Roman Urdu (Phonetic)",
  "natural-urdu": "Natural Urdu (اردو رسم الخط)",
  hindi: "Hindi (हिन्दी / Hinglish)",
  english: "English",
};

export function SttTtsSettingsPanel() {
  const [activeTab, setActiveTab] = useState<"all" | "stt" | "tts" | "call">("all");
  const [voiceSettings, updateVoiceSettings] = useVoiceCallSettings();

  // --- TTS State ---
  const [tts, setTts] = useState<TtsSettings>(loadTtsSettings);
  const activePreset = useMemo(() => getActiveTtsPreset(tts) || TTS_ACCENTS[0], [tts]);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [testText, setTestText] = useState(
    () => (getActiveTtsPreset(loadTtsSettings()) || TTS_ACCENTS[0]).sampleText,
  );
  const [isSpeaking, setIsSpeaking] = useState(false);

  // --- STT State ---
  const [stt, setStt] = useState<SttSettings>(loadSttSettings);
  const [noiseShield, setNoiseShield] =
    useState<AcousticNoiseShieldSettings>(loadNoiseShieldSettings);
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

  useEffect(() => {
    return subscribeNoiseShieldSettings((settings) => {
      setNoiseShield(settings);
    });
  }, []);

  // --- TTS Handlers ---
  const updateTtsLanguage = (lang: TtsLanguageMode) => {
    let newVoiceURI = tts.voiceURI;
    if (lang === "auto-male") {
      newVoiceURI = "roman-urdu-male";
      setTestText(
        "Assalam o alaikum! Yeh auto-detected text to speech test hai (Male). AutoCode will read response automatically in Male voice.",
      );
    } else if (lang === "auto-female") {
      newVoiceURI = "roman-urdu-female";
      setTestText(
        "Assalam o alaikum! Yeh auto-detected text to speech test hai (Female). AutoCode will read response automatically in Female voice.",
      );
    } else if (lang === "natural-urdu") {
      newVoiceURI = tts.voiceURI?.includes("female") ? "natural-urdu-female" : "natural-urdu-male";
      setTestText("السلام علیکم! یہ نیچرل اردو کا ٹیسٹ ہے۔ میں آپ کی کیا مدد کر سکتا ہوں؟");
    } else if (lang === "english") {
      newVoiceURI = tts.voiceURI?.includes("female") ? "english-female" : "english-male";
      setTestText("Hello! This is an English text-to-speech test. How can I assist you today?");
    } else if (lang === "roman-urdu") {
      newVoiceURI = tts.voiceURI?.includes("female") ? "roman-urdu-female" : "roman-urdu-male";
      setTestText(
        tts.voiceURI?.includes("female")
          ? "Assalam o alaikum! Yeh Roman Urdu female high accuracy voice ka test hai. Main aap ki kya madad kar sakti hoon?"
          : "Assalam o alaikum! Yeh Roman Urdu male high accuracy voice ka test hai. Main aap ki kya madad kar sakta hoon?",
      );
    }

    const updated: TtsSettings = {
      ...tts,
      language: lang,
      voiceURI: newVoiceURI,
    };
    setTts(updated);
    saveTtsSettings(updated);
  };

  const updateTtsPreset = (presetId: TtsVoiceId) => {
    const chosen = TTS_ACCENTS.find((a) => a.id === presetId) || TTS_ACCENTS[0];
    let newLanguage: TtsLanguageMode = chosen.category;
    if (tts.language === "auto-male" && chosen.gender === "male") {
      newLanguage = "auto-male";
    } else if (tts.language === "auto-female" && chosen.gender === "female") {
      newLanguage = "auto-female";
    }

    const updated: TtsSettings = {
      ...tts,
      language: newLanguage,
      voiceURI: chosen.id,
    };
    setTts(updated);
    saveTtsSettings(updated);
    setTestText(chosen.sampleText);
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

  const updateTtsDeliveryStyle = (deliveryStyle: TtsDeliveryStyleId) => {
    const updated = { ...tts, deliveryStyle };
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

  // Current rate & pitch with safety fallbacks
  const currentRate = typeof tts.rate === "number" && !isNaN(tts.rate) ? tts.rate : 1.0;
  const currentPitch = typeof tts.pitch === "number" && !isNaN(tts.pitch) ? tts.pitch : 1.0;

  // Slider progress ratios for native slider styling
  const speedProgressRatio = (currentRate - 0.5) / (1.75 - 0.5);
  const speedSliderStyle = {
    "--settings-slider-progress": `${Math.max(0, Math.min(1, speedProgressRatio)) * 100}%`,
    "--settings-slider-fill-offset": `${0.5 - speedProgressRatio}rem`,
  } as CSSProperties;

  const pitchProgressRatio = (currentPitch - 0.5) / (1.5 - 0.5);
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
                  <SelectValue>{STT_LANG_LABELS[stt.language] || STT_LANG_LABELS.auto}</SelectValue>
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
            title="Acoustic Noise Shield 🛡️ (Fan & Echo Cancellation)"
            description="Eliminates ceiling fan hum, AC drone, and room echo using Digi-Labs afftdn & agate filter algorithms."
            control={
              <div className="flex items-center gap-2.5">
                <Switch
                  checked={noiseShield.enabled}
                  onCheckedChange={(checked) => {
                    const updated = { ...noiseShield, enabled: checked };
                    setNoiseShield(updated);
                    saveNoiseShieldSettings(updated);
                  }}
                  aria-label="Toggle Acoustic Noise Shield"
                />
                <span className="text-xs font-mono text-muted-foreground">
                  {noiseShield.enabled ? "Shield Active" : "Bypassed"}
                </span>
              </div>
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
                  Listening now in {STT_LANG_LABELS[stt.language] || STT_LANG_LABELS.auto}...
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
                value={normalizeTtsLanguage(tts.language)}
                onValueChange={(val) => {
                  if (val) updateTtsLanguage(val as TtsLanguageMode);
                }}
              >
                <SelectTrigger size="sm" className="w-full sm:w-64" aria-label="Voice accent">
                  <SelectValue>
                    {TTS_LANG_LABELS[normalizeTtsLanguage(tts.language)] ||
                      "Auto Detect (Male Voice)"}
                  </SelectValue>
                </SelectTrigger>
                <SelectPopup
                  align="end"
                  alignItemWithTrigger={false}
                  className="max-h-72 overflow-y-auto"
                >
                  <SelectItem hideIndicator value="roman-urdu">
                    ⚡ Roman Urdu (High Accuracy HD)
                  </SelectItem>
                  <SelectItem hideIndicator value="auto-male">
                    Auto Detect (Male Voice)
                  </SelectItem>
                  <SelectItem hideIndicator value="auto-female">
                    Auto Detect (Female Voice)
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
            description="Choose from curated voices with dedicated High-Accuracy Roman Urdu (Male & Female)."
            control={
              <Select
                value={activePreset.id}
                onValueChange={(val) => {
                  if (val) updateTtsPreset(val as TtsVoiceId);
                }}
              >
                <SelectTrigger size="sm" className="w-full sm:w-64" aria-label="Synthesizer voice">
                  <SelectValue>{activePreset.name}</SelectValue>
                </SelectTrigger>
                <SelectPopup
                  align="end"
                  alignItemWithTrigger={false}
                  className="max-h-80 overflow-y-auto"
                >
                  <SelectGroup>
                    <SelectGroupLabel className="text-primary font-semibold">
                      ⚡ Roman Urdu (High Accuracy)
                    </SelectGroupLabel>
                    <SelectItem hideIndicator value="roman-urdu-male">
                      Roman Urdu (Male HD - High Accuracy)
                    </SelectItem>
                    <SelectItem hideIndicator value="roman-urdu-female">
                      Roman Urdu (Female HD - High Accuracy)
                    </SelectItem>
                  </SelectGroup>

                  <SelectGroup>
                    <SelectGroupLabel>Natural Urdu (اردو)</SelectGroupLabel>
                    <SelectItem hideIndicator value="natural-urdu-male">
                      Natural Urdu (Male Voice) - اردو
                    </SelectItem>
                    <SelectItem hideIndicator value="natural-urdu-female">
                      Natural Urdu (Female Voice) - اردو
                    </SelectItem>
                  </SelectGroup>

                  <SelectGroup>
                    <SelectGroupLabel>English</SelectGroupLabel>
                    <SelectItem hideIndicator value="english-male">
                      English (Male Voice)
                    </SelectItem>
                    <SelectItem hideIndicator value="english-female">
                      English (Female Voice)
                    </SelectItem>
                  </SelectGroup>
                </SelectPopup>
              </Select>
            }
          />

          <SettingsRow
            title="Vocal delivery style (Digi-Labs)"
            description="Co-tunes speed rate, pitch tone frequency, and volume in lockstep to preserve natural timbre without chipmunk audio."
            control={
              <div className="flex flex-wrap items-center gap-1.5 sm:max-w-md">
                {Object.values(VOICE_DELIVERY_STYLES).map((style) => {
                  const isSelected = (tts.deliveryStyle || "natural") === style.id;
                  return (
                    <button
                      key={style.id}
                      type="button"
                      onClick={() => updateTtsDeliveryStyle(style.id)}
                      className={cn(
                        "px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-all cursor-pointer flex items-center gap-1.5",
                        isSelected
                          ? "border-primary bg-primary/10 text-primary font-semibold ring-1 ring-primary/40 shadow-xs"
                          : "border-border/60 bg-muted/20 text-muted-foreground hover:bg-muted/40 hover:text-foreground",
                      )}
                    >
                      <span>
                        {style.id === "natural" && "🌿 Natural"}
                        {style.id === "business" && "💼 Business"}
                        {style.id === "promo" && "⚡ Energetic"}
                        {style.id === "explainer" && "🎙️ Explainer"}
                        {style.id === "calm" && "🕊️ Calm"}
                      </span>
                      <span className="text-[10px] font-mono text-muted-foreground/80">
                        ({style.rate})
                      </span>
                    </button>
                  );
                })}
              </div>
            }
          />

          {activePreset.category === "roman-urdu" && (
            <div className="mx-4 sm:mx-6 my-1 flex items-start gap-2.5 rounded-md border border-primary/20 bg-primary/5 p-3 text-xs text-foreground">
              <span className="mt-0.5 inline-flex size-2 rounded-full bg-emerald-500 shrink-0" />
              <div className="space-y-0.5">
                <span className="font-semibold text-primary">
                  Roman Urdu High-Accuracy Engine Active (
                  {activePreset.gender === "male" ? "Male Voice" : "Female Voice"})
                </span>
                <p className="text-muted-foreground text-[11px] leading-relaxed">
                  Authentic Pakistani pronunciation enabled. Converts syllables to Urdu/Hindi script
                  and phonetic transliteration so names and words (aap, kaise, theek, shukriya,
                  masla) sound completely natural.
                </p>
              </div>
            </div>
          )}

          <SettingsRow
            title="Speech speed"
            description="Speed rate for text-to-speech audio synthesis."
            control={
              <div className="flex w-full items-center gap-3 sm:w-56">
                <span className="w-10 text-right font-mono text-xs tabular-nums text-muted-foreground">
                  {currentRate.toFixed(2)}x
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
                  value={currentRate}
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
                  {currentPitch.toFixed(2)}x
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
                  value={currentPitch}
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
                  dir={
                    activePreset.category === "natural-urdu" || tts.language === "natural-urdu"
                      ? "rtl"
                      : "ltr"
                  }
                />
                <Button
                  type="button"
                  size="sm"
                  variant={isSpeaking ? "destructive" : "outline"}
                  onClick={handleTestSpeak}
                  className="shrink-0 flex items-center gap-1.5 cursor-pointer"
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
