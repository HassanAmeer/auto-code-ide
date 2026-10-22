import { type ProviderDriverKind, type ProviderInstanceId } from "@t3tools/contracts";
import { memo } from "react";
import {
  BrainIcon,
  CheckIcon,
  CodeIcon,
  EyeIcon,
  StarIcon,
  WrenchIcon,
  ZapIcon,
} from "lucide-react";
import {
  getDisplayModelName,
  getTriggerDisplayModelLabel,
  type ModelEsque,
} from "./providerIconUtils";
import { ComboboxItem } from "../ui/combobox";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Kbd } from "../ui/kbd";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { cn } from "~/lib/utils";
import { modelPickerModelKey } from "./modelPickerKeys";
import { ProviderInstanceIcon } from "./ProviderInstanceIcon";

interface ModelCapabilityBadge {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

function resolveModelCapabilities(slug: string): ModelCapabilityBadge[] {
  const s = slug.toLowerCase();
  const caps: ModelCapabilityBadge[] = [];

  // Vision
  if (
    s.includes("vision") ||
    s.includes("4o") ||
    s.includes("sonnet") ||
    s.includes("opus") ||
    s.includes("flash") ||
    s.includes("pro") ||
    s.includes("gemini") ||
    s.includes("vl") ||
    s.includes("multimodal") ||
    s.includes("omni")
  ) {
    caps.push({ id: "vision", label: "Vision / Image support", icon: EyeIcon });
  }

  // Reasoning / Thinking
  if (
    s.includes("deepseek") ||
    s.includes("r1") ||
    s.includes("o1") ||
    s.includes("o3") ||
    s.includes("thinking") ||
    s.includes("reason") ||
    s.includes("qwq")
  ) {
    caps.push({ id: "reasoning", label: "Deep Reasoning / Thinking", icon: BrainIcon });
  }

  // Speed / Fast
  if (
    s.includes("flash") ||
    s.includes("fast") ||
    s.includes("mini") ||
    s.includes("haiku") ||
    s.includes("turbo") ||
    s.includes("instant") ||
    s.includes("beam")
  ) {
    caps.push({ id: "fast", label: "Fast Response / Low Latency", icon: ZapIcon });
  }

  // Coding
  if (
    s.includes("coder") ||
    s.includes("code") ||
    s.includes("claude") ||
    s.includes("deepseek") ||
    s.includes("gpt") ||
    s.includes("glm")
  ) {
    caps.push({ id: "code", label: "Specialized Code Generation", icon: CodeIcon });
  }

  // Tools & Function calling
  caps.push({ id: "tools", label: "Tool Use & Function Calling", icon: WrenchIcon });

  return caps;
}

export const ModelListRow = memo(function ModelListRow(props: {
  index: number;
  model: ModelEsque;
  /** Instance the model belongs to — the routing key used in combobox values. */
  instanceId: ProviderInstanceId;
  /** Driver kind of the instance — used for the provider icon glyph. */
  driverKind: ProviderDriverKind;
  /**
   * Display name to show in the secondary line (provider footer). Usually
   * the instance's configured `displayName` so custom instances like
   * "Codex Personal" render with their user-authored label.
   */
  providerDisplayName: string;
  providerAccentColor?: string | undefined;
  acpRegistryAgentId?: string | undefined;
  acpRegistryIconUrl?: string | undefined;
  isFavorite: boolean;
  isSelected: boolean;
  showSelection?: boolean;
  showProvider: boolean;
  preferShortName?: boolean;
  useTriggerLabel?: boolean;
  showNewBadge?: boolean;
  unavailable?: boolean;
  jumpLabel?: string | null;
  disabledReason?: string | null;
  onToggleFavorite: () => void;
}) {
  const providerLabel = props.model.subProvider
    ? `${props.providerDisplayName} · ${props.model.subProvider}`
    : props.providerDisplayName;

  const row = (
    <ComboboxItem
      hideIndicator
      index={props.index}
      value={modelPickerModelKey(props.instanceId, props.model.slug)}
      disabled={Boolean(props.disabledReason)}
      className={cn(
        "group relative w-full !min-w-0 max-w-full cursor-pointer",
        props.disabledReason &&
          "data-disabled:pointer-events-auto data-disabled:cursor-not-allowed",
      )}
    >
      <div className="min-w-0 flex-1 text-left">
        <div className="flex min-w-0 items-start gap-2">
          <div className="min-w-0 flex-1 break-words [word-break:break-word] text-xs font-medium leading-snug whitespace-normal">
            {props.useTriggerLabel
              ? getTriggerDisplayModelLabel(props.model)
              : getDisplayModelName(
                  props.model,
                  props.preferShortName ? { preferShortName: true } : undefined,
                )}
          </div>
          {props.showNewBadge ? (
            <span
              className="mt-0.5 shrink-0 rounded border border-update/35 bg-update/15 px-0.5 py-px text-3xs font-bold uppercase leading-none tracking-wide text-update-foreground"
              aria-label="New model"
            >
              New
            </span>
          ) : null}
          {props.unavailable ? (
            <Badge variant="outline" size="sm" className="mt-0.5 shrink-0">
              Unavailable
            </Badge>
          ) : null}
        </div>
        {props.showProvider && (
          <div className="mt-1 flex items-start gap-1.5">
            <ProviderInstanceIcon
              driverKind={props.driverKind}
              displayName={props.providerDisplayName}
              acpRegistryAgentId={props.acpRegistryAgentId}
              acpRegistryIconUrl={props.acpRegistryIconUrl}
              className="mt-0.5 size-3 shrink-0"
              iconClassName="size-3"
            />
            <span className="min-w-0 flex-1 break-words [word-break:break-word] text-xs font-normal leading-snug text-muted-foreground/70 whitespace-normal">
              {providerLabel}
            </span>
          </div>
        )}
        {/* Model capabilities badges with tooltip */}
        <div className="mt-1.5 flex items-center gap-1 text-muted-foreground/60">
          {resolveModelCapabilities(props.model.slug).map((cap) => {
            const Icon = cap.icon;
            return (
              <Tooltip key={cap.id}>
                <TooltipTrigger
                  render={
                    <span className="inline-flex size-4 items-center justify-center rounded hover:bg-muted/80 hover:text-muted-foreground transition-colors cursor-help">
                      <Icon className="size-3" />
                    </span>
                  }
                />
                <TooltipPopup side="top" align="center">
                  {cap.label}
                </TooltipPopup>
              </Tooltip>
            );
          })}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        {props.showSelection && props.isSelected ? (
          <CheckIcon className="size-3.5" aria-hidden="true" />
        ) : null}
        {props.jumpLabel ? <Kbd>{props.jumpLabel}</Kbd> : null}
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                size="icon-xs"
                variant="ghost-muted"
                className="-mr-1 shrink-0"
                onClick={(event) => {
                  event.stopPropagation();
                  props.onToggleFavorite();
                }}
                onKeyDown={(event) => {
                  event.stopPropagation();
                }}
                disabled={Boolean(props.disabledReason)}
                aria-label={props.isFavorite ? "Remove from favorites" : "Add to favorites"}
              >
                <StarIcon
                  className={cn(
                    "size-3.5 sm:size-3",
                    props.isFavorite && "fill-current text-warning",
                  )}
                />
              </Button>
            }
          />
          <TooltipPopup side="top" align="center">
            {props.isFavorite ? "Remove from favorites" : "Add to favorites"}
          </TooltipPopup>
        </Tooltip>
      </div>
    </ComboboxItem>
  );

  if (!props.disabledReason) {
    return row;
  }

  return (
    <Tooltip>
      <TooltipTrigger render={row} />
      <TooltipPopup side="left" align="center">
        {props.disabledReason}
      </TooltipPopup>
    </Tooltip>
  );
});
