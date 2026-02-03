import BulbSvg from "@/components/ui/bulb-svg";
import EyeIcon from "@/components/ui/eye-icon";
import InfoCircleIcon from "@/components/ui/info-circle-icon";
import XIcon from "@/components/ui/x-icon";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { AvailableModel } from "@/types/gateway";
import type { ModelEntry } from "@/types/modelRegistry";

export type ModelInfoPanelProps = {
  models: Array<AvailableModel | ModelEntry>;
  open: boolean;
  onClose: () => void;
};

const formatTokens = (value?: number | null) => {
  if (value === null || value === undefined) return "—";
  const kValue = Math.floor(value / 100) / 10;
  const formatted = kValue % 1 === 0 ? kValue.toFixed(0) : kValue.toFixed(1);
  return `${formatted}k`;
};

const ModelInfoPanel = ({ models, open, onClose }: ModelInfoPanelProps) => {
  if (!open) return null;

  return (
    <div className="rounded-xl border bg-muted/40 p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <InfoCircleIcon size={16} />
          Model details
        </div>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <XIcon size={16} />
        </Button>
      </div>
      {models.length > 0 ? (
        <div className="space-y-2 text-xs text-muted-foreground">
          {models.map((model) => {
            const inputTypes = model.input ?? [];
            const vision = inputTypes.includes("image");
            const reasoning = Boolean(model.reasoning);
            return (
              <div
                key={`${model.provider ?? ""}:${model.id}`}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-background px-3 py-2"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <span className="truncate text-foreground">{model.name || model.id}</span>
                  <EyeIcon
                    size={14}
                    className={cn(vision ? "text-emerald-500" : "text-muted-foreground/40")}
                  />
                  <BulbSvg
                    size={14}
                    className={cn(reasoning ? "text-emerald-500" : "text-muted-foreground/40")}
                  />
                </div>
                <div className="flex items-center gap-3 text-[10px] uppercase">
                  <span>Ctx {formatTokens(model.contextWindow)}</span>
                  <span>Out {formatTokens(model.maxTokens)}</span>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="text-sm text-muted-foreground">No model data available.</div>
      )}
    </div>
  );
};

export default ModelInfoPanel;
