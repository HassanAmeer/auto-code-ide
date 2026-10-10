import { useTerminalStore, terminalStore } from "./terminalStore";
import { TerminalCommandBox } from "./TerminalCommandBox";

export interface TerminalFeedProps {
  onSelectSuggestion?: ((command: string) => void) | undefined;
  className?: string | undefined;
}

export function TerminalFeed({ onSelectSuggestion, className = "" }: TerminalFeedProps) {
  const { runs } = useTerminalStore();

  if (runs.length === 0) {
    return null;
  }

  return (
    <div
      className={`w-full max-h-[55vh] overflow-y-auto space-y-3.5 my-2.5 pr-1 scrollbar-thin scrollbar-thumb-zinc-800 ${className}`}
    >
      {runs.map((run) => (
        <TerminalCommandBox
          key={run.id}
          run={run}
          onSelectSuggestion={onSelectSuggestion}
          onDismiss={() => terminalStore.removeRun(run.id)}
        />
      ))}
    </div>
  );
}
