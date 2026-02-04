import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { RefreshCw, Folder, Activity, Plus, Trash2, Save } from "lucide-react";
import { useImgPipeline } from "@/features/img-pipeline/useImgPipeline";
import { useAudioPipeline } from "@/features/audio-pipeline/useAudioPipeline";
import HelpButton from "./HelpButton";

const ExtensionsPanel = () => {
  const [open, setOpen] = useState(false);
  const imgPipeline = useImgPipeline();
  const audioPipeline = useAudioPipeline();
  const [imgInputDirs, setImgInputDirs] = useState<string[]>([""]);
  const [imgOutputDir, setImgOutputDir] = useState("");
  const [imgPipelineDir, setImgPipelineDir] = useState("");
  const [audioInputDirs, setAudioInputDirs] = useState<string[]>([""]);
  const [audioOutputDir, setAudioOutputDir] = useState("");
  const [audioPipelineDir, setAudioPipelineDir] = useState("");

  useEffect(() => {
    if (!open || !imgPipeline.status) return;
    setImgInputDirs(imgPipeline.status.inputDirs.length > 0 ? imgPipeline.status.inputDirs : [""]);
    setImgOutputDir(imgPipeline.status.outputDir || "");
    setImgPipelineDir(imgPipeline.status.pipelineDir || "");
  }, [open, imgPipeline.status]);

  useEffect(() => {
    if (!open || !audioPipeline.status) return;
    setAudioInputDirs(
      audioPipeline.status.inputDirs.length > 0 ? audioPipeline.status.inputDirs : [""],
    );
    setAudioOutputDir(audioPipeline.status.outputDir || "");
    setAudioPipelineDir(audioPipeline.status.pipelineDir || "");
  }, [open, audioPipeline.status]);

  const hasAnyExtension = imgPipeline.status || audioPipeline.status;

  const updateImgInputDir = (index: number, value: string) => {
    setImgInputDirs((prev) => prev.map((dir, idx) => (idx === index ? value : dir)));
  };

  const addImgInputDir = () => {
    setImgInputDirs((prev) => [...prev, ""]);
  };

  const removeImgInputDir = (index: number) => {
    setImgInputDirs((prev) => {
      const next = prev.filter((_, idx) => idx !== index);
      return next.length > 0 ? next : [""];
    });
  };

  const saveImgConfig = async () => {
    const inputDirs = imgInputDirs.map((dir) => dir.trim()).filter(Boolean);
    const outputDir = imgOutputDir.trim();
    const pipelineDir = imgPipelineDir.trim();
    await imgPipeline.updateConfig({
      inputDirs: inputDirs.length > 0 ? inputDirs : undefined,
      outputDir: outputDir || undefined,
      pipelineDir: pipelineDir || undefined,
    });
    imgPipeline.refresh();
  };

  const updateAudioInputDir = (index: number, value: string) => {
    setAudioInputDirs((prev) => prev.map((dir, idx) => (idx === index ? value : dir)));
  };

  const addAudioInputDir = () => {
    setAudioInputDirs((prev) => [...prev, ""]);
  };

  const removeAudioInputDir = (index: number) => {
    setAudioInputDirs((prev) => {
      const next = prev.filter((_, idx) => idx !== index);
      return next.length > 0 ? next : [""];
    });
  };

  const saveAudioConfig = async () => {
    const inputDirs = audioInputDirs.map((dir) => dir.trim()).filter(Boolean);
    const outputDir = audioOutputDir.trim();
    const pipelineDir = audioPipelineDir.trim();
    await audioPipeline.updateConfig({
      inputDirs: inputDirs.length > 0 ? inputDirs : undefined,
      outputDir: outputDir || undefined,
      pipelineDir: pipelineDir || undefined,
    });
    audioPipeline.refresh();
  };

  return (
    <div className="flex items-center gap-1">
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button type="button" variant="outline" size="sm" className="h-8 px-3 text-xs">
            Extension
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Extensions</DialogTitle>
            <DialogDescription>
              Configure image and audio pipeline settings for this server.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {/* Image Pipeline Section */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Folder size={16} className="text-blue-500" />
                  <h3 className="font-medium">Image Pipeline</h3>
                  {imgPipeline.status && (
                    <span
                      className={`text-xs px-2 py-0.5 rounded ${
                        imgPipeline.status.enabled
                          ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300"
                          : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
                      }`}
                    >
                      {imgPipeline.status.enabled ? "ON" : "OFF"}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={imgPipeline.refresh}
                    disabled={imgPipeline.loading}
                  >
                    <RefreshCw size={14} className={imgPipeline.loading ? "animate-spin" : ""} />
                  </Button>
                  <Switch
                    checked={imgPipeline.status?.enabled ?? false}
                    onCheckedChange={imgPipeline.setEnabled}
                    disabled={!imgPipeline.status || imgPipeline.loading}
                  />
                </div>
              </div>
              {imgPipeline.status ? (
                <div className="space-y-3 pl-6 text-xs text-muted-foreground">
                  <div className="space-y-1">
                    <p>Inputs: {imgPipeline.status.inputDirs.join(", ") || "—"}</p>
                    <p>Output: {imgPipeline.status.outputDir}</p>
                    {imgPipeline.status.running && (
                      <p className="text-green-600 dark:text-green-400">
                        Running (PID: {imgPipeline.status.pids.join(", ") || "n/a"})
                      </p>
                    )}
                    {imgPipeline.status.lastError && (
                      <p className="text-red-500">Error: {imgPipeline.status.lastError}</p>
                    )}
                    {imgPipeline.error && (
                      <p className="text-red-500">Error: {imgPipeline.error}</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <div className="space-y-1">
                      <label className="text-[11px] font-semibold text-muted-foreground">
                        Pipeline dir
                      </label>
                      <input
                        className="w-full rounded-md border bg-background px-2 py-1 text-xs"
                        value={imgPipelineDir}
                        onChange={(event) => setImgPipelineDir(event.target.value)}
                        placeholder="/path/to/img-pipeline"
                      />
                    </div>
                    <p className="text-[11px] font-semibold text-muted-foreground">Watch paths</p>
                    <div className="space-y-2">
                      {imgInputDirs.map((dir, index) => (
                        <div key={`img-input-${index}`} className="flex items-center gap-2">
                          <input
                            className="flex-1 rounded-md border bg-background px-2 py-1 text-xs"
                            value={dir}
                            onChange={(event) => updateImgInputDir(index, event.target.value)}
                            placeholder="/path/to/images"
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => removeImgInputDir(index)}
                            disabled={imgPipeline.loading}
                          >
                            <Trash2 size={14} />
                          </Button>
                        </div>
                      ))}
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 px-2 text-[11px]"
                      onClick={addImgInputDir}
                      disabled={imgPipeline.loading}
                    >
                      <Plus size={12} className="mr-1" />
                      Add path
                    </Button>
                    <div className="space-y-1">
                      <label className="text-[11px] font-semibold text-muted-foreground">
                        Output path
                      </label>
                      <input
                        className="w-full rounded-md border bg-background px-2 py-1 text-xs"
                        value={imgOutputDir}
                        onChange={(event) => setImgOutputDir(event.target.value)}
                        placeholder="/path/to/output"
                      />
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      className="h-7 px-2 text-[11px]"
                      onClick={saveImgConfig}
                      disabled={imgPipeline.loading}
                    >
                      <Save size={12} className="mr-1" />
                      Save
                    </Button>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground pl-6">
                  {imgPipeline.error || "Not available"}
                </p>
              )}
            </div>

            {/* Audio Pipeline Section */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Activity size={16} className="text-purple-500" />
                  <h3 className="font-medium">Audio Pipeline</h3>
                  {audioPipeline.status && (
                    <span
                      className={`text-xs px-2 py-0.5 rounded ${
                        audioPipeline.status.enabled
                          ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300"
                          : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
                      }`}
                    >
                      {audioPipeline.status.enabled ? "ON" : "OFF"}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={audioPipeline.refresh}
                    disabled={audioPipeline.loading}
                  >
                    <RefreshCw size={14} className={audioPipeline.loading ? "animate-spin" : ""} />
                  </Button>
                  <Switch
                    checked={audioPipeline.status?.enabled ?? false}
                    onCheckedChange={audioPipeline.setEnabled}
                    disabled={!audioPipeline.status || audioPipeline.loading}
                  />
                </div>
              </div>
              {audioPipeline.status ? (
                <div className="space-y-3 pl-6 text-xs text-muted-foreground">
                  <div className="space-y-1">
                    <p>Inputs: {audioPipeline.status.inputDirs.join(", ") || "—"}</p>
                    <p>Output: {audioPipeline.status.outputDir}</p>
                    {audioPipeline.status.running && (
                      <p className="text-green-600 dark:text-green-400">
                        Running (PID: {audioPipeline.status.pids.join(", ") || "n/a"})
                      </p>
                    )}
                    {audioPipeline.status.lastError && (
                      <p className="text-red-500">Error: {audioPipeline.status.lastError}</p>
                    )}
                    {audioPipeline.error && (
                      <p className="text-red-500">Error: {audioPipeline.error}</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <div className="space-y-1">
                      <label className="text-[11px] font-semibold text-muted-foreground">
                        Pipeline dir
                      </label>
                      <input
                        className="w-full rounded-md border bg-background px-2 py-1 text-xs"
                        value={audioPipelineDir}
                        onChange={(event) => setAudioPipelineDir(event.target.value)}
                        placeholder="/path/to/audio-pipeline"
                      />
                    </div>
                    <p className="text-[11px] font-semibold text-muted-foreground">Watch paths</p>
                    <div className="space-y-2">
                      {audioInputDirs.map((dir, index) => (
                        <div key={`audio-input-${index}`} className="flex items-center gap-2">
                          <input
                            className="flex-1 rounded-md border bg-background px-2 py-1 text-xs"
                            value={dir}
                            onChange={(event) => updateAudioInputDir(index, event.target.value)}
                            placeholder="/path/to/audio"
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => removeAudioInputDir(index)}
                            disabled={audioPipeline.loading}
                          >
                            <Trash2 size={14} />
                          </Button>
                        </div>
                      ))}
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 px-2 text-[11px]"
                      onClick={addAudioInputDir}
                      disabled={audioPipeline.loading}
                    >
                      <Plus size={12} className="mr-1" />
                      Add path
                    </Button>
                    <div className="space-y-1">
                      <label className="text-[11px] font-semibold text-muted-foreground">
                        Output path
                      </label>
                      <input
                        className="w-full rounded-md border bg-background px-2 py-1 text-xs"
                        value={audioOutputDir}
                        onChange={(event) => setAudioOutputDir(event.target.value)}
                        placeholder="/path/to/output"
                      />
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      className="h-7 px-2 text-[11px]"
                      onClick={saveAudioConfig}
                      disabled={audioPipeline.loading}
                    >
                      <Save size={12} className="mr-1" />
                      Save
                    </Button>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground pl-6">
                  {audioPipeline.error || "Not available"}
                </p>
              )}
            </div>

            {!hasAnyExtension && (
              <div className="text-center py-4 text-sm text-muted-foreground">
                No extensions available.
                <br />
                Set environment variables to enable:
                <br />
                <code className="text-xs bg-muted px-1 py-0.5 rounded mt-1 inline-block">
                  IMG_PIPELINE_DIR or AUDIO_PIPELINE_DIR
                </code>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
      <HelpButton />
    </div>
  );
};

export default ExtensionsPanel;
