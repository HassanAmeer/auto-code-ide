import { useState, useRef, useEffect } from "react";
import { Mic, MicOff, CheckCircle2, AlertCircle } from "lucide-react";
import { Button } from "../ui/button";
import {
  type SttLanguageMode,
  type SttSettings,
  loadSttSettings,
  saveSttSettings,
  createSttSession,
  isSpeechRecognitionSupported,
  type SttController,
} from "~/lib/speech/stt";

export function SttSettingsPanel() {
  const [settings, setSettings] = useState<SttSettings>(loadSttSettings);
  const [isListening, setIsListening] = useState(false);
  const [liveTranscript, setLiveTranscript] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const sessionRef = useRef<SttController | null>(null);
  const isSupported = isSpeechRecognitionSupported();

  useEffect(() => {
    return () => {
      sessionRef.current?.stop();
    };
  }, []);

  const updateLanguage = (lang: SttLanguageMode) => {
    if (isListening) {
      sessionRef.current?.stop();
      setIsListening(false);
    }
    const updated = { ...settings, language: lang };
    setSettings(updated);
    saveSttSettings(updated);
  };

  const toggleTestMic = () => {
    setErrorMsg(null);
    if (isListening) {
      sessionRef.current?.stop();
      setIsListening(false);
    } else {
      setLiveTranscript("");
      const session = createSttSession({
        mode: settings.language,
        onResult: (text, _isFinal, cumulative) => {
          setLiveTranscript(cumulative || text);
        },
        onStateChange: (active) => {
          setIsListening(active);
        },
        onError: (err) => {
          setErrorMsg(`Microphone error: ${err}`);
          setIsListening(false);
        },
      });
      sessionRef.current = session;
      session.start();
      setIsListening(true);
    }
  };

  return (
    <div className="flex flex-col gap-6 max-w-2xl">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Speech-to-Text (STT)</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Configure browser voice dictation and microphone input.
        </p>
      </div>

      {/* Browser Support Indicator */}
      <div
        className={`flex items-center gap-2 p-3 rounded-md border text-sm ${
          isSupported
            ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-400"
            : "border-amber-500/20 bg-amber-500/10 text-amber-400"
        }`}
      >
        {isSupported ? (
          <>
            <CheckCircle2 className="size-4 shrink-0 text-emerald-500" />
            <span>Chrome Web Speech API is supported and active in this browser.</span>
          </>
        ) : (
          <>
            <AlertCircle className="size-4 shrink-0 text-amber-500" />
            <span>
              Web Speech API not detected. Please open in Google Chrome or Chromium for full voice
              recognition support.
            </span>
          </>
        )}
      </div>

      {/* Language Selection */}
      <div className="flex flex-col gap-2 rounded-lg border border-border p-4 bg-card">
        <label className="text-sm font-medium">Dictation Language / Accent</label>
        <p className="text-xs text-muted-foreground mb-2">
          Select what accent the microphone transcribes when you dictate.
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          <button
            type="button"
            onClick={() => updateLanguage("auto")}
            className={`p-3 rounded-md border text-sm font-medium text-left transition-colors ${
              settings.language === "auto"
                ? "border-primary bg-primary/10 text-primary"
                : "border-border hover:bg-muted"
            }`}
          >
            <div className="font-semibold">Auto Detect</div>
            <div className="text-xs text-muted-foreground mt-1">Urdu / Hindi / English</div>
          </button>
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
            <div className="text-xs text-muted-foreground mt-1">Spoken Urdu / Phonetic</div>
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
            <div className="text-xs text-muted-foreground mt-1">اردو الفاظ (Urdu script)</div>
          </button>
          <button
            type="button"
            onClick={() => updateLanguage("hindi")}
            className={`p-3 rounded-md border text-sm font-medium text-left transition-colors ${
              settings.language === "hindi"
                ? "border-primary bg-primary/10 text-primary"
                : "border-border hover:bg-muted"
            }`}
          >
            <div className="font-semibold">Hindi</div>
            <div className="text-xs text-muted-foreground mt-1">हिन्दी / Hinglish</div>
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

      {/* Live Microphone Test Playground */}
      <div className="flex flex-col gap-3 rounded-lg border border-border p-4 bg-card">
        <label className="text-sm font-medium flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Mic className="size-4 text-primary" /> Test Microphone Recognition
          </span>
          {isListening && (
            <span className="text-xs text-red-500 font-normal animate-pulse">● Listening...</span>
          )}
        </label>
        <p className="text-xs text-muted-foreground">
          Click the microphone below and speak to test speech recognition live.
        </p>

        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <Button
              type="button"
              onClick={toggleTestMic}
              disabled={!isSupported}
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
                Speak now in {settings.language.replace("-", " ")}...
              </span>
            )}
          </div>

          {errorMsg && (
            <div className="p-2.5 rounded bg-destructive/10 text-destructive text-xs">
              {errorMsg}
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
  );
}
