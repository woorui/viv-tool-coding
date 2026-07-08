"use client";

import { Button } from "@/components/ui/button";

export interface EnvModalProps {
  open: boolean;
  requiredEnvKeys: string[];
  envValues: Record<string, string>;
  onEnvValueChange: (key: string, value: string) => void;
  onClose: () => void;
  onDeploy: () => void;
}

export function EnvModal({
  open,
  requiredEnvKeys,
  envValues,
  onEnvValueChange,
  onClose,
  onDeploy,
}: EnvModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
      <div className="bg-card rounded-xl shadow-xl border border-border w-full max-w-lg">
        <div className="px-4 py-3 border-b border-border">
          <h3 className="text-sm font-semibold text-foreground">Fill Environment Variables</h3>
          <p className="text-xs text-muted-foreground mt-1">Values are required before deployment.</p>
        </div>
        <div className="p-4 space-y-3 max-h-[60vh] overflow-y-auto">
          {requiredEnvKeys.map((key) => (
            <div key={key} className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground">{key}</label>
              <input
                type="text"
                value={envValues[key] || ""}
                onChange={(e) => onEnvValueChange(key, e.target.value)}
                className="w-full px-3 py-2 border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ring bg-background"
                placeholder={`Enter value for ${key}`}
              />
            </div>
          ))}
        </div>
        <div className="px-4 py-3 border-t border-border flex gap-2">
          <Button variant="outline" onClick={onClose} className="flex-1">
            Cancel
          </Button>
          <Button onClick={onDeploy} className="flex-1">
            Deploy with Env
          </Button>
        </div>
      </div>
    </div>
  );
}
