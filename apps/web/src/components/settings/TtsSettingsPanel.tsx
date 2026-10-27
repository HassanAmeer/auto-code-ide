import { useState, useEffect, useMemo } from "react";
import { Volume2, Play, Square } from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import {
  type TtsVoiceId,
  type TtsSettings,
  TTS_ACCENTS,
  loadTtsSettings,
  saveTtsSettings,
  getActiveTtsPreset,
  speakText,
  stopSpeaking,
  subscribeSpeechState,
} from "~/lib/speech/tts";

export function TtsSettingsPanel() {
  const [settings, setSettings] = useState<TtsSettings>(loadTtsSettings);
  const activePreset = useMemo(() => getActiveTtsPreset(settings), [settings]);
  const [testText, setTestText] = useState(() => getActiveTtsPreset(loadTtsSettings()).sampleText);
  const [isSpeaking, setIsSpeaking] = useState(false);

  useEffect(() => {
    return subscribeSpeechState((speaking) => {
      setIsSpeaking(speaking);
    });
  }, []);

  const updatePreset = (presetId: TtsVoiceId) => {
    const chosen = TTS_ACCENTS.find((a) => a.id === presetId) || TTS_ACCENTS[0];
    const updated: TtsSettings = {
      ...settings,
      language: chosen.category,
      voiceURI: chosen.id,
    };
    setSettings(updated);
    saveTtsSettings(updated);
    setTestText(chosen.sampleText);
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

  const handleTestSpeak = () => {
    if (isSpeaking) {
      stopSpeaking();
    } else {
      speakText(testText, settings);
    }
  };

  return (
    <div className="flex flex-col gap-6 max-w-2xl">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Text-to-Speech (TTS)</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Configure browser speech synthesis and read-aloud voice models.
        </p>
      </div>

      {/* 6 Curated Voice Options */}
      <div className="flex flex-col gap-2 rounded-lg border border-border p-4 bg-card">
        <label className="text-sm font-medium">Voice Model & Accent (6 Curated Options)</label>
        <p className="text-xs text-muted-foreground mb-2">
          Choose from English, Roman Urdu, or Natural Urdu with authentic Male and Female voices.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {TTS_ACCENTS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => updatePreset(preset.id)}
              className={`p-3 rounded-md border text-sm font-medium text-left transition-colors cursor-pointer ${
                activePreset.id === preset.id
                  ? "border-primary bg-primary/10 text-primary ring-1 ring-primary"
                  : "border-border hover:bg-muted"
              }`}
            >
              <div className="font-semibold">{preset.name}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{preset.description}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Speed & Pitch Controls */}
      <div className="grid grid-cols-2 gap-4 rounded-lg border border-border p-4 bg-card">
        <div className="flex flex-col gap-2">
          <div className="flex justify-between items-center text-sm font-medium">
            <span>Speech Speed</span>
            <span className="text-xs text-muted-foreground">{settings.rate.toFixed(2)}x</span>
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
            <span>Voice Pitch</span>
            <span className="text-xs text-muted-foreground">{settings.pitch.toFixed(2)}x</span>
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

      {/* Test Preview Section */}
      <div className="flex flex-col gap-2 rounded-lg border border-border p-4 bg-card">
        <label className="text-sm font-medium">Preview Voice Output</label>
        <p className="text-xs text-muted-foreground mb-2">
          Type or edit the test phrase below and click Speak to test voice tone and speed.
        </p>
        <div className="flex gap-2">
          <Input
            value={testText}
            onChange={(e) => setTestText(e.target.value)}
            placeholder="Type text to preview voice..."
            className="flex-1"
            dir={activePreset.category === "natural-urdu" ? "rtl" : "ltr"}
          />
          <Button
            type="button"
            variant={isSpeaking ? "destructive" : "default"}
            onClick={handleTestSpeak}
            className="shrink-0 flex items-center gap-1.5 cursor-pointer"
          >
            {isSpeaking ? (
              <>
                <Square className="size-4 fill-current" /> Stop
              </>
            ) : (
              <>
                <Play className="size-4 fill-current" /> Speak
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
