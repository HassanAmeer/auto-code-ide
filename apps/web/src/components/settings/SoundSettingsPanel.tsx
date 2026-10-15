import { useState, useEffect, useRef, type ChangeEvent, type CSSProperties } from "react";
import {
  Volume2,
  VolumeX,
  Play,
  Square,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Waves,
  Mic,
  Sparkles,
} from "lucide-react";

import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Switch } from "../ui/switch";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import { SettingsPageContainer, SettingsRow, SettingsSection } from "./settingsLayout";
import { useSoundSettings } from "~/lib/sound/soundSettings";
import { previewSound, type SoundEffectType } from "~/lib/sound/soundManager";
import {
  type TtsLanguageMode,
  type TtsSettings,
  TTS_ACCENTS,
  loadTtsSettings,
  saveTtsSettings,
  getAvailableVoices,
  speakText,
  stopSpeaking,
  subscribeSpeechState,
} from "~/lib/speech/tts";
import { useVoiceCallSettings } from "../chat/voiceCall/voiceCallSettings";

export function SoundSettingsPanel() {
  const [soundSettings, updateSoundSettings] = useSoundSettings();
  const [voiceSettings, updateVoiceSettings] = useVoiceCallSettings();
  const [previewing, setPreviewing] = useState<SoundEffectType | null>(null);

  // --- TTS State ---
  const [tts, setTts] = useState<TtsSettings>(loadTtsSettings);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [testText, setTestText] = useState("Assalam o alaikum! Yeh T3 Code ka voice test hai.");
  const [isSpeaking, setIsSpeaking] = useState(false);

  useEffect(() => {
    const updateVoices = () => {
      setVoices(getAvailableVoices());
    };
    updateVoices();
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.onvoiceschanged = updateVoices;
    }
    return () => {
      stopSpeaking();
    };
  }, []);

  useEffect(() => {
    return subscribeSpeechState((speaking) => {
      setIsSpeaking(speaking);
    });
  }, []);

  const handlePreview = (type: SoundEffectType) => {
    setPreviewing(type);
    previewSound(type);
    const duration = type === "waiting-wave" ? 3100 : 1200;
    setTimeout(() => {
      setPreviewing((prev) => (prev === type ? null : prev));
    }, duration);
  };

  const handleTestSpeak = () => {
    if (isSpeaking) {
      stopSpeaking();
    } else {
      speakText(testText || "T3 Code voice output test.", tts);
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

  const speedSliderProgress = Math.min(100, Math.max(0, ((tts.rate - 0.5) / (1.75 - 0.5)) * 100));
  const speedSliderStyle: CSSProperties = {
    background: `linear-gradient(to right, var(--color-primary, #3b82f6) 0%, var(--color-primary, #3b82f6) ${speedSliderProgress}%, var(--color-muted, #3f3f46) ${speedSliderProgress}%, var(--color-muted, #3f3f46) 100%)`,
  };

  const pitchSliderProgress = Math.min(100, Math.max(0, ((tts.pitch - 0.5) / (1.5 - 0.5)) * 100));
  const pitchSliderStyle: CSSProperties = {
    background: `linear-gradient(to right, var(--color-primary, #3b82f6) 0%, var(--color-primary, #3b82f6) ${pitchSliderProgress}%, var(--color-muted, #3f3f46) ${pitchSliderProgress}%, var(--color-muted, #3f3f46) 100%)`,
  };

  const volumePercent = Math.round(soundSettings.soundVolume * 100);
  const volumeSliderStyle: CSSProperties = {
    background: `linear-gradient(to right, var(--color-primary, #3b82f6) 0%, var(--color-primary, #3b82f6) ${volumePercent}%, var(--color-muted, #3f3f46) ${volumePercent}%, var(--color-muted, #3f3f46) 100%)`,
  };

  const selectedVoiceName =
    voices.find((v) => v.voiceURI === tts.voiceURI)?.name ??
    TTS_ACCENTS.find((a) => a.id === tts.voiceURI)?.name ??
    "Auto-selected voice";

  return (
    <SettingsPageContainer>
      {/* Master Audio Control */}
      <SettingsSection id="sound-master" title="Master Audio Control">
        <SettingsRow
          id="sound-master-switch"
          title="Enable All App Sounds"
          description="Global switch for all audio chimes, notifications, completion alerts, and ambient sounds."
          control={
            <div className="flex items-center gap-3">
              {soundSettings.masterSoundEnabled ? (
                <Volume2 className="size-4 text-emerald-400" />
              ) : (
                <VolumeX className="size-4 text-muted-foreground" />
              )}
              <Switch
                checked={soundSettings.masterSoundEnabled}
                onCheckedChange={(checked) => updateSoundSettings({ masterSoundEnabled: checked })}
                aria-label="Enable all sound effects"
              />
            </div>
          }
        />

        <SettingsRow
          id="sound-master-volume"
          title="Master Sound Volume"
          description="Adjust overall output volume for UI alerts and audio effects."
          control={
            <div className="flex w-full items-center gap-3 sm:w-60">
              <span className="w-10 text-right font-mono text-xs tabular-nums text-muted-foreground">
                {volumePercent}%
              </span>
              <input
                aria-label="Sound volume slider"
                className="settings-slider min-w-0 flex-1 cursor-pointer"
                id="sound-volume"
                max={1}
                min={0}
                step={0.05}
                type="range"
                style={volumeSliderStyle}
                value={soundSettings.soundVolume}
                disabled={!soundSettings.masterSoundEnabled}
                onChange={(e: ChangeEvent<HTMLInputElement>) =>
                  updateSoundSettings({ soundVolume: parseFloat(e.currentTarget.value) })
                }
              />
            </div>
          }
        />
      </SettingsSection>

      {/* AI Assistant Sounds */}
      <SettingsSection id="sound-assistant" title="AI Assistant Sounds">
        <SettingsRow
          id="sound-response-done"
          title="Task / Response Completed Sound"
          description="Play a pleasant 3-tone harmonic chime when the AI completes generating its response or finishes a task."
          control={
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="xs"
                variant="outline"
                className="gap-1.5 text-xs text-emerald-400 hover:text-emerald-300"
                onClick={() => handlePreview("response-done")}
                title="Preview Response Done Sound"
              >
                <Play className="size-3 fill-current" />
                {previewing === "response-done" ? "Playing..." : "Preview"}
              </Button>
              <Switch
                checked={soundSettings.responseDoneSound}
                disabled={!soundSettings.masterSoundEnabled}
                onCheckedChange={(checked) => updateSoundSettings({ responseDoneSound: checked })}
                aria-label="Response completed sound"
              />
            </div>
          }
        />

        <SettingsRow
          id="sound-waiting-wave"
          title="Waiting & Thinking Ambient Sound"
          description="Play a soft, relaxing ocean-wave ambient sound while waiting for the AI response to stream or think."
          control={
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="xs"
                variant="outline"
                className="gap-1.5 text-xs text-sky-400 hover:text-sky-300"
                onClick={() => handlePreview("waiting-wave")}
                title="Preview Waiting Sound"
              >
                <Waves className="size-3" />
                {previewing === "waiting-wave" ? "Playing..." : "Preview"}
              </Button>
              <Switch
                checked={soundSettings.waitingWaveSound}
                disabled={!soundSettings.masterSoundEnabled}
                onCheckedChange={(checked) => {
                  updateSoundSettings({ waitingWaveSound: checked });
                  updateVoiceSettings({ thinkingWaveSound: checked });
                }}
                aria-label="Thinking wave sound"
              />
            </div>
          }
        />
      </SettingsSection>

      {/* Alerts & System Notifications */}
      <SettingsSection id="sound-alerts" title="System Alerts & Warnings">
        <SettingsRow
          id="sound-notification"
          title="Notification Alert Sound"
          description="Play a crisp dual-tone chime when system notifications or task reminders trigger."
          control={
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="xs"
                variant="outline"
                className="gap-1.5 text-xs text-amber-400 hover:text-amber-300"
                onClick={() => handlePreview("notification")}
                title="Preview Notification Sound"
              >
                <Play className="size-3 fill-current" />
                {previewing === "notification" ? "Playing..." : "Preview"}
              </Button>
              <Switch
                checked={soundSettings.notificationSound}
                disabled={!soundSettings.masterSoundEnabled}
                onCheckedChange={(checked) => updateSoundSettings({ notificationSound: checked })}
                aria-label="Notification sound"
              />
            </div>
          }
        />

        <SettingsRow
          id="sound-error"
          title="Error Alert Sound"
          description="Play a subtle warm warning chime when a command, tool execution, or agent run fails."
          control={
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="xs"
                variant="outline"
                className="gap-1.5 text-xs text-rose-400 hover:text-rose-300"
                onClick={() => handlePreview("error")}
                title="Preview Error Sound"
              >
                <AlertTriangle className="size-3" />
                {previewing === "error" ? "Playing..." : "Preview"}
              </Button>
              <Switch
                checked={soundSettings.errorSound}
                disabled={!soundSettings.masterSoundEnabled}
                onCheckedChange={(checked) => updateSoundSettings({ errorSound: checked })}
                aria-label="Error alert sound"
              />
            </div>
          }
        />

        <SettingsRow
          id="sound-timeout"
          title="Timeout Alert Sound"
          description="Play a distinct double clock tone when a server connection or model response times out."
          control={
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="xs"
                variant="outline"
                className="gap-1.5 text-xs text-orange-400 hover:text-orange-300"
                onClick={() => handlePreview("timeout")}
                title="Preview Timeout Sound"
              >
                <Clock className="size-3" />
                {previewing === "timeout" ? "Playing..." : "Preview"}
              </Button>
              <Switch
                checked={soundSettings.timeoutSound}
                disabled={!soundSettings.masterSoundEnabled}
                onCheckedChange={(checked) => updateSoundSettings({ timeoutSound: checked })}
                aria-label="Timeout alert sound"
              />
            </div>
          }
        />
      </SettingsSection>

      {/* Speech & Voice Synthesis (STT / TTS) */}
      <SettingsSection id="sound-voice" title="Speech & Voice Output (TTS)">
        <SettingsRow
          id="tts-voice"
          title="Synthesizer Voice"
          description="Select synthetic voice accent or system voice for reading chat responses aloud."
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
                {TTS_ACCENTS.map((a) => (
                  <SelectItem hideIndicator key={a.id} value={a.id}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectPopup>
            </Select>
          }
        />

        <SettingsRow
          id="tts-speed"
          title="Speech Speed"
          description="Playback speed for spoken responses."
          control={
            <div className="flex w-full items-center gap-3 sm:w-56">
              <span className="w-10 text-right font-mono text-xs tabular-nums text-muted-foreground">
                {tts.rate.toFixed(2)}x
              </span>
              <input
                aria-label="Speech speed"
                className="settings-slider min-w-0 flex-1 cursor-pointer"
                id="tts-rate-slider"
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
          id="tts-pitch"
          title="Voice Pitch"
          description="Tone frequency for spoken synthesizer voice."
          control={
            <div className="flex w-full items-center gap-3 sm:w-56">
              <span className="w-10 text-right font-mono text-xs tabular-nums text-muted-foreground">
                {tts.pitch.toFixed(2)}x
              </span>
              <input
                aria-label="Voice pitch"
                className="settings-slider min-w-0 flex-1 cursor-pointer"
                id="tts-pitch-slider"
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
          id="tts-preview"
          title="Preview Voice Audio"
          description="Test your voice synthesizer speed, accent, and pitch parameters."
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
    </SettingsPageContainer>
  );
}
