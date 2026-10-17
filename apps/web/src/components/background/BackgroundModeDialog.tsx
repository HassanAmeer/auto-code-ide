import { memo, useEffect } from "react";
import {
  ActivityIcon,
  DatabaseIcon,
  MoonIcon,
  ServerIcon,
  SunIcon,
  XIcon,
  ZapIcon,
} from "lucide-react";

import { useBackgroundModeStore } from "../../lib/backgroundModeStore";
import { cn } from "../../lib/utils";

export const BackgroundModeDialog = memo(function BackgroundModeDialog() {
  const { isBgEnabled, keepTabAwake, isModalOpen, setBgEnabled, setKeepTabAwake, setModalOpen } =
    useBackgroundModeStore();

  useEffect(() => {
    if (!isModalOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setModalOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isModalOpen, setModalOpen]);

  if (!isModalOpen) return null;

  return (
    <div className="fixed inset-0 z-[120] flex justify-end">
      {/* Cupertino Frosted Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity animate-in fade-in duration-200"
        onClick={() => setModalOpen(false)}
        aria-hidden="true"
      />

      {/* Slide-over Cupertino iOS Sheet (90% width on Mobile) */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="VPS Background Mode"
        className="relative z-[121] flex h-full w-[90vw] max-w-[90vw] sm:w-[380px] sm:max-w-[380px] flex-col bg-zinc-950/95 backdrop-blur-2xl text-zinc-100 border-l border-white/10 shadow-2xl animate-in slide-in-from-right duration-200 overflow-hidden"
      >
        {/* iOS Header (Clean, No top X button to prevent duplicate crosses) */}
        <div className="flex items-center justify-between px-4 py-3.5 border-b border-white/[0.08] bg-zinc-900/70 backdrop-blur-xl shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              className={cn(
                "size-8 rounded-xl flex items-center justify-center transition-all shadow-xs shrink-0",
                isBgEnabled
                  ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 shadow-emerald-500/10"
                  : "bg-zinc-800 text-zinc-400 border border-white/10",
              )}
            >
              <ServerIcon className="size-4" />
            </div>
            <div className="flex flex-col min-w-0">
              <h2 className="text-sm font-semibold tracking-tight text-white flex items-center gap-1.5 truncate">
                VPS Background
              </h2>
              <p className="text-[11px] text-zinc-400 truncate">Continuous 24/7 Execution</p>
            </div>
          </div>

          <span
            className={cn(
              "text-[10px] font-mono uppercase px-2 py-0.5 rounded-full font-bold border transition-colors shrink-0",
              isBgEnabled
                ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
                : "bg-zinc-800/80 text-zinc-400 border-white/10",
            )}
          >
            {isBgEnabled ? "Active" : "Paused"}
          </span>
        </div>

        {/* Essential Content Only (Numbers, Toggles & Buttons) */}
        <div className="p-4 flex flex-col gap-3.5 flex-1 overflow-y-auto">
          {/* Main 24/7 Switch Card (Cupertino Inset Row) */}
          <div className="rounded-2xl bg-white/[0.04] border border-white/[0.08] p-3.5 flex items-center justify-between gap-3 shadow-xs">
            <div className="flex flex-col gap-0.5 min-w-0">
              <div className="flex items-center gap-1.5">
                <ZapIcon
                  className={cn(
                    "size-3.5 shrink-0",
                    isBgEnabled ? "text-emerald-400" : "text-zinc-500",
                  )}
                />
                <span className="text-xs font-semibold text-white">24/7 VPS Background</span>
              </div>
              <p className="text-[11px] text-zinc-400 leading-tight">
                Runs on VPS even when browser is closed
              </p>
            </div>

            {/* iOS Switch */}
            <button
              type="button"
              role="switch"
              aria-checked={isBgEnabled}
              onClick={() => setBgEnabled(!isBgEnabled)}
              className={cn(
                "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden",
                isBgEnabled ? "bg-[#34C759]" : "bg-zinc-700",
              )}
            >
              <span
                className={cn(
                  "pointer-events-none inline-block size-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out",
                  isBgEnabled ? "translate-x-5" : "translate-x-0",
                )}
              />
            </button>
          </div>

          {/* Key Numbers & Stats (Cupertino 3-Column Metrics) */}
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-2.5 flex flex-col items-center justify-center text-center">
              <span className="text-[10px] uppercase font-mono text-zinc-400">Mode</span>
              <span className="text-xs font-bold text-emerald-400 mt-0.5">24/7</span>
              <span className="text-[9px] text-zinc-400">VPS Run</span>
            </div>
            <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-2.5 flex flex-col items-center justify-center text-center">
              <span className="text-[10px] uppercase font-mono text-zinc-400">Storage</span>
              <span className="text-xs font-bold text-sky-400 mt-0.5">SQLite</span>
              <span className="text-[9px] text-zinc-400">Server DB</span>
            </div>
            <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-2.5 flex flex-col items-center justify-center text-center">
              <span className="text-[10px] uppercase font-mono text-zinc-400">Sync</span>
              <span className="text-xs font-bold text-amber-400 mt-0.5">100%</span>
              <span className="text-[9px] text-zinc-400">Live State</span>
            </div>
          </div>

          {/* Screen Wake Lock Switch Card */}
          <div className="rounded-2xl bg-white/[0.04] border border-white/[0.08] p-3.5 flex items-center justify-between gap-3 shadow-xs">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="size-7 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center shrink-0">
                {keepTabAwake ? (
                  <SunIcon className="size-3.5" />
                ) : (
                  <MoonIcon className="size-3.5" />
                )}
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-xs font-medium text-white">Prevent Screen Sleep</span>
                <span className="text-[11px] text-zinc-400 leading-tight">
                  Keep display active while tab is open
                </span>
              </div>
            </div>

            {/* iOS Switch */}
            <button
              type="button"
              role="switch"
              aria-checked={keepTabAwake}
              onClick={() => setKeepTabAwake(!keepTabAwake)}
              className={cn(
                "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden",
                keepTabAwake ? "bg-[#34C759]" : "bg-zinc-700",
              )}
            >
              <span
                className={cn(
                  "pointer-events-none inline-block size-4 transform rounded-full bg-white shadow-xs ring-0 transition duration-200 ease-in-out",
                  keepTabAwake ? "translate-x-4" : "translate-x-0",
                )}
              />
            </button>
          </div>

          {/* Database Storage Path Card */}
          <div className="rounded-2xl bg-white/[0.04] border border-white/[0.08] p-3 flex flex-col gap-1.5 shadow-xs">
            <div className="flex items-center gap-1.5 text-xs font-medium text-white">
              <DatabaseIcon className="size-3.5 text-sky-400 shrink-0" />
              <span>VPS Persistence Path</span>
            </div>
            <div className="font-mono text-[10px] px-2 py-1.5 rounded-lg bg-black/40 text-emerald-300 border border-white/[0.06] select-all break-all">
              /root/autojobs/data/userdata/statev2.sqlite
            </div>
          </div>
        </div>

        {/* Footer with Close (X) Icon Button at Bottom Right */}
        <div className="mt-auto px-4 py-3 border-t border-white/[0.08] bg-zinc-900/70 backdrop-blur-xl flex items-center justify-between shrink-0">
          <div className="flex items-center gap-1.5 text-[11px] text-zinc-400">
            <ActivityIcon
              className={cn(
                "size-3.5",
                isBgEnabled ? "text-emerald-400 animate-pulse" : "text-zinc-500",
              )}
            />
            <span>{isBgEnabled ? "VPS 24/7 Active" : "Foreground Only"}</span>
          </div>

          {/* Single Close Button strictly at the Bottom Right Side */}
          <button
            type="button"
            onClick={() => setModalOpen(false)}
            aria-label="Close VPS Background Mode"
            className="size-8 rounded-full bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white border border-white/10 flex items-center justify-center transition-all shadow-md active:scale-95 cursor-pointer"
            title="Close"
          >
            <XIcon className="size-4" />
          </button>
        </div>
      </div>
    </div>
  );
});
