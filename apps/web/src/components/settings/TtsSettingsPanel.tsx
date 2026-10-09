import { useState, useEffect } from "react";
import { Volume2, Play, Square } from "lucide-react";
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

export function TtsSettingsPanel() {
  const [settings, setSettings] = useState<TtsSettings>(loadTtsSettings);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [testText, setTestText] = useState("Assalam o alaikum! Yeh T3 Code ka text to speech test hai.");
  const [isSpeaking, setIsSpeaking] = useState(false);

  useEffect(() => {
    const updateVoices = () => {
      setVoices(getAvailableVoices());
    };
    updateVoices();
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.onvoiceschanged = updateVoices;
    }
  }, []);

  useEffect(() => {
    return subscribeSpeechState((speaking) => {
      setIsSpeaking(speaking);
    });
  }, []);

  const updateLanguage = (lang: TtsLanguageMode) => {
    const updated: TtsSettings = {
      ...settings,
      language: lang,
      voiceURI: undefined, // reset to pick best default
    };
    setSettings(updated);
    saveTtsSettings(updated);

    if (lang === "natural-urdu") {
      setTestText("السلام علیکم! یہ ٹی تھری کوڈ کا ٹیکسٹ ٹو اسپیچ ٹیسٹ ہے۔");
    } else if (lang === "english") {
      setTestText("Hello! This is a text to speech test for T3 Code.");
    } else {
      setTestText("Assalam o alaikum! Yeh T3 Code ka text to speech test hai.");
    }
  };

  const updateRate = (rate: number) => {
    const updated = { ...settings, rate };
    setSettings(updated);
    saveTtsSettings(updated);
  };

  const updatePitch = (pitch: number) => {
    const updated = { ...settings, pitch };
    setSettings(updated);
    saveTtsSettings(updated);
  };

  const updateVoiceURI = (voiceURI: string) => {
    const updated = { ...settings, voiceURI };
    setSettings(updated);
    saveTtsSettings(updated);
  };

  const handleTestSpeak = () => {
    if (isSpeaking) {
      stopSpeaking();
    } else {
      speakText(testText, settings);
    }
  };

  const availableFilteredVoices = getVoicesForMode(voices, settings.language);

  return (
    <div className="flex flex-col gap-6 max-w-2xl">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Text-to-Speech (TTS)</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Configure browser speech synthesis and read-aloud voice models.
        </p>
      </div>

      {/* Language Selection */}
      <div className="flex flex-col gap-2 rounded-lg border border-border p-4 bg-card">
        <label className="text-sm font-medium">Spoken Language / Accent</label>
        <p className="text-xs text-muted-foreground mb-2">
          Choose the primary language accent for agent read-aloud.
        </p>
        <div className="grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={() => updateLanguage("roman-urdu")}
            className={`p-3 rounded-md border text-sm font-medium text-left transition-colors ${
              settings.language === "roman-urdu"
                ? "border-primary bg-primary/10 text-primary"
                : "border-border hover:bg-muted"
            }`}
          >
            <div className="font-semibold">Roman Urdu</div>
            <div className="text-xs text-muted-foreground mt-1">Urdu in Latin script</div>
          </button>
          <button
            type="button"
            onClick={() => updateLanguage("natural-urdu")}
            className={`p-3 rounded-md border text-sm font-medium text-left transition-colors ${
              settings.language === "natural-urdu"
                ? "border-primary bg-primary/10 text-primary"
                : "border-border hover:bg-muted"
            }`}
          >
            <div className="font-semibold">Natural Urdu</div>
            <div className="text-xs text-muted-foreground mt-1">اردو الفاظ و رسم الخط</div>
          </button>
          <button
            type="button"
            onClick={() => updateLanguage("english")}
            className={`p-3 rounded-md border text-sm font-medium text-left transition-colors ${
              settings.language === "english"
                ? "border-primary bg-primary/10 text-primary"
                : "border-border hover:bg-muted"
            }`}
          >
            <div className="font-semibold">English</div>
            <div className="text-xs text-muted-foreground mt-1">Standard English</div>
          </button>
        </div>
      </div>

      {/* Voice Selection */}
      <div className="flex flex-col gap-2 rounded-lg border border-border p-4 bg-card">
        <label className="text-sm font-medium">Browser Voice (Male Prioritized)</label>
        <p className="text-xs text-muted-foreground mb-1">
          Select from available Chrome system voices.
        </p>
        <select
          value={settings.voiceURI ?? ""}
          onChange={(e) => updateVoiceURI(e.target.value)}
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
            <span className="text-xs text-muted-foreground">{settings.rate}x</span>
          </div>
          <input
            type="range"
            min="0.5"
            max="1.75"
            step="0.05"
            value={settings.rate}
            onChange={(e) => updateRate(parseFloat(e.target.value))}
            className="w-full accent-primary cursor-pointer"
          />
        </div>
        <div className="flex flex-col gap-2">
          <div className="flex justify-between items-center text-sm font-medium">
            <span>Pitch</span>
            <span className="text-xs text-muted-foreground">{settings.pitch}x</span>
          </div>
          <input
            type="range"
            min="0.5"
            max="1.5"
            step="0.05"
            value={settings.pitch}
            onChange={(e) => updatePitch(parseFloat(e.target.value))}
            className="w-full accent-primary cursor-pointer"
          />
        </div>
      </div>

      {/* Test Playground */}
      <div className="flex flex-col gap-3 rounded-lg border border-border p-4 bg-card">
        <label className="text-sm font-medium flex items-center gap-2">
          <Volume2 className="size-4 text-primary" /> Test Speech Output
        </label>
        <div className="flex gap-2">
          <Input
            value={testText}
            onChange={(e) => setTestText(e.target.value)}
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
  );
}
