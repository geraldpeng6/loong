import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type CustomProviderForm = {
  name: string;
  baseUrl: string;
  apiKey?: string;
  defaultModel?: string;
};

export type CustomProviderDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (form: CustomProviderForm) => void;
};

const CustomProviderDialog = ({ open, onOpenChange, onSave }: CustomProviderDialogProps) => {
  const [form, setForm] = useState<CustomProviderForm>({
    name: "",
    baseUrl: "",
    apiKey: "",
    defaultModel: "",
  });

  const update = (key: keyof CustomProviderForm, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = () => {
    if (!form.name || !form.baseUrl || !form.defaultModel) return;
    onSave(form);
    setForm({ name: "", baseUrl: "", apiKey: "", defaultModel: "" });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add OpenAI-compatible Provider</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground">Provider name</label>
            <input
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              value={form.name}
              onChange={(event) => update("name", event.target.value)}
              placeholder="e.g. cephalon"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground">Base URL</label>
            <input
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              value={form.baseUrl}
              onChange={(event) => update("baseUrl", event.target.value)}
              placeholder="https://api.example.com/v1"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground">
              API key (optional)
            </label>
            <input
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              value={form.apiKey}
              onChange={(event) => update("apiKey", event.target.value)}
              placeholder="sk-..."
              type="password"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground">Default model</label>
            <input
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              value={form.defaultModel}
              onChange={(event) => update("defaultModel", event.target.value)}
              placeholder="gpt-4o"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave}>Add</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default CustomProviderDialog;
