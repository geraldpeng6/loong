import { Button } from "@/components/ui/button";
import RefreshIcon from "@/components/ui/refresh-icon";
import { useImgPipeline } from "@/features/img-pipeline/useImgPipeline";

const ImgPipelineControls = () => {
  const { status, loading, error, refresh, setEnabled } = useImgPipeline();

  if (!status && !error) {
    return null;
  }

  const enabled = status?.enabled ?? false;
  const label = status ? (enabled ? "IMG ON" : "IMG OFF") : "IMG N/A";
  const title = status
    ? `img-pipeline ${enabled ? "enabled" : "disabled"} · ${status.inputDirs.join(", ")}`
    : error || "img-pipeline unavailable";

  return (
    <div className="flex items-center gap-2">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-8 px-2"
        onClick={refresh}
        disabled={loading}
        title="Refresh img-pipeline status"
      >
        <RefreshIcon size={14} className={loading ? "animate-spin" : ""} />
      </Button>
      {status ? (
        <Button
          type="button"
          variant={enabled ? "default" : "outline"}
          size="sm"
          className="h-8 px-3 text-xs"
          onClick={() => setEnabled(!enabled)}
          disabled={loading}
          title={title}
        >
          {label}
        </Button>
      ) : (
        <span className="text-[11px] text-muted-foreground" title={title}>
          {label}
        </span>
      )}
    </div>
  );
};

export default ImgPipelineControls;
