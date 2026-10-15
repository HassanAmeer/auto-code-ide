import { memo } from "react";
import {
  ActivityIcon,
  CheckCircle2Icon,
  DatabaseIcon,
  LaptopIcon,
  MoonIcon,
  ServerIcon,
  SunIcon,
  XIcon,
  ZapIcon,
} from "lucide-react";

import { useBackgroundModeStore } from "../../lib/backgroundModeStore";
import { Dialog, DialogPopup, DialogTitle } from "../ui/dialog";
import { cn } from "../../lib/utils";

export const BackgroundModeDialog = memo(function BackgroundModeDialog() {
  const { isBgEnabled, keepTabAwake, isModalOpen, setBgEnabled, setKeepTabAwake, setModalOpen } =
    useBackgroundModeStore();

  return (
    <Dialog open={isModalOpen} onOpenChange={setModalOpen}>
      <DialogPopup className="max-w-md w-full p-0 overflow-hidden rounded-2xl border border-border/60 bg-sidebar/95 backdrop-blur-xl shadow-2xl">
        {/* Header */}
        <div className="relative px-5 py-4 border-b border-border/40 bg-gradient-to-r from-emerald-500/10 via-primary/5 to-transparent">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div
                className={cn(
                  "size-8 rounded-xl flex items-center justify-center transition-all shadow-xs",
                  isBgEnabled
                    ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 shadow-emerald-500/10"
                    : "bg-muted text-muted-foreground border border-border/50",
                )}
              >
                <ServerIcon className="size-4" />
              </div>
              <div>
                <DialogTitle className="text-sm font-bold tracking-tight text-foreground flex items-center gap-2">
                  <span>VPS Background Mode</span>
                  <span
                    className={cn(
                      "text-[10px] font-mono uppercase px-1.5 py-0.5 rounded-full font-bold border transition-colors",
                      isBgEnabled
                        ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/40"
                        : "bg-muted text-muted-foreground border-border/50",
                    )}
                  >
                    {isBgEnabled ? "BG: ON" : "BG: OFF"}
                  </span>
                </DialogTitle>
                <p className="text-2xs text-muted-foreground mt-0.5">
                  24/7 non-stop execution on remote VPS server
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="size-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-sidebar-row-hover transition-colors cursor-pointer"
            >
              <XIcon className="size-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="p-5 flex flex-col gap-4 max-h-[75vh] overflow-y-auto">
          {/* Main 24/7 Switch Card */}
          <div
            className={cn(
              "p-3.5 rounded-xl border transition-all flex items-center justify-between gap-3",
              isBgEnabled
                ? "bg-emerald-500/10 border-emerald-500/30 shadow-xs"
                : "bg-card/50 border-border/40",
            )}
          >
            <div className="flex flex-col gap-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <ZapIcon
                  className={cn(
                    "size-3.5 shrink-0",
                    isBgEnabled ? "text-emerald-400" : "text-muted-foreground",
                  )}
                />
                <span className="text-xs font-semibold text-foreground">
                  Continuous 24h Background Run
                </span>
              </div>
              <p className="text-2xs text-muted-foreground leading-relaxed">
                {isBgEnabled
                  ? "Tasks and agent modifications run 24/7 on the VPS even after you close Chrome or turn off your computer."
                  : "Background continuation is paused when all browser tabs are closed."}
              </p>
            </div>

            {/* Toggle Switch */}
            <button
              type="button"
              role="switch"
              aria-checked={isBgEnabled}
              onClick={() => setBgEnabled(!isBgEnabled)}
              className={cn(
                "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden",
                isBgEnabled ? "bg-emerald-500" : "bg-muted-foreground/30",
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

          {/* Database Status Info Card */}
          <div className="p-3.5 rounded-xl border border-border/40 bg-card/40 flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <DatabaseIcon className="size-3.5 text-sky-400 shrink-0" />
              <span className="text-xs font-semibold text-foreground">
                VPS SQLite Database Storage
              </span>
            </div>
            <p className="text-2xs text-muted-foreground leading-relaxed">
              All threads, prompt history, diffs, and project modifications are stored permanently
              on the VPS at:
            </p>
            <div className="font-mono text-3xs px-2 py-1.5 rounded-md bg-black/40 text-emerald-300 border border-emerald-500/20 break-all select-all">
              /root/autojobs/data/userdata/statev2.sqlite
            </div>
            <div className="flex items-center gap-1.5 text-3xs text-muted-foreground mt-0.5">
              <CheckCircle2Icon className="size-3 text-emerald-400 shrink-0" />
              <span>
                Zero data stored locally in your browser. Fully synced across all devices.
              </span>
            </div>
          </div>

          {/* Cross-Device Continuity Card */}
          <div className="p-3.5 rounded-xl border border-border/40 bg-card/40 flex items-start gap-2.5">
            <div className="size-7 rounded-lg bg-violet-500/10 text-violet-400 flex items-center justify-center shrink-0 mt-0.5">
              <LaptopIcon className="size-3.5" />
            </div>
            <div className="flex flex-col gap-0.5 min-w-0">
              <span className="text-xs font-semibold text-foreground">
                Multi-Computer & Mobile Sync
              </span>
              <p className="text-2xs text-muted-foreground leading-relaxed">
                Start a task from your work computer, close the tab, and open it later from your
                home laptop or smartphone. The exact live progress and completed results are always
                preserved.
              </p>
            </div>
          </div>

          {/* Screen Wake Lock Option */}
          <div className="p-3.5 rounded-xl border border-border/40 bg-card/40 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="size-7 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center shrink-0">
                {keepTabAwake ? (
                  <SunIcon className="size-3.5" />
                ) : (
                  <MoonIcon className="size-3.5" />
                )}
              </div>
              <div className="flex flex-col">
                <span className="text-xs font-medium text-foreground">
                  Prevent Tab Sleep (Wake Lock)
                </span>
                <span className="text-3xs text-muted-foreground">
                  Keep device display active when this browser tab is open
                </span>
              </div>
            </div>

            <button
              type="button"
              role="switch"
              aria-checked={keepTabAwake}
              onClick={() => setKeepTabAwake(!keepTabAwake)}
              className={cn(
                "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden",
                keepTabAwake ? "bg-amber-500" : "bg-muted-foreground/30",
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
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-border/40 bg-card/30 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-2xs text-muted-foreground">
            <ActivityIcon
              className={cn(
                "size-3",
                isBgEnabled ? "text-emerald-400 animate-pulse" : "text-muted-foreground",
              )}
            />
            <span>{isBgEnabled ? "VPS Service Active" : "Foreground Only"}</span>
          </div>

          <button
            type="button"
            onClick={() => setModalOpen(false)}
            className="px-3.5 py-1.5 text-xs font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors cursor-pointer"
          >
            Done
          </button>
        </div>
      </DialogPopup>
    </Dialog>
  );
});
