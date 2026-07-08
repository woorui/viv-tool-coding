"use client";

import { Loader2, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { STAGES } from "@/lib/constants";
import type { Stage } from "@/types";

export interface HeaderProps {
  stage: Stage;
  isGenerating: boolean;
}

export function Header({ stage, isGenerating }: HeaderProps) {
  return (
    <div className="px-6 py-4 bg-card border-b border-border shadow-sm">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2 text-primary">
            <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-primary/10">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="16 18 22 12 16 6" />
                <polyline points="8 6 2 12 8 18" />
              </svg>
            </span>
            YoMo Tool Gen
          </h1>
          <p className="text-sm text-muted-foreground mt-1 ml-10">Autonomous multi-round workflow</p>
        </div>
        <div className="flex items-center gap-3 overflow-x-auto pb-1">
          {STAGES.map((s, i) => {
            const isActive = s.id === stage;
            const isPast = STAGES.findIndex((x) => x.id === stage) > i;

            return (
              <div key={s.id} className="flex items-center gap-2 shrink-0">
                <div
                  className={cn(
                    "flex items-center justify-center w-8 h-8 rounded-full border-2 transition-colors",
                    isActive
                      ? "border-primary text-primary bg-primary/5"
                      : isPast
                      ? "border-emerald-500 text-emerald-500 bg-emerald-50"
                      : "border-border text-muted-foreground/50"
                  )}
                >
                  {isActive && isGenerating ? <Loader2 size={14} className="animate-spin" /> : isPast ? <Check size={14} /> : s.icon}
                </div>
                <span
                  className={cn(
                    "text-xs font-medium hidden xl:inline-block",
                    isActive ? "text-primary" : isPast ? "text-foreground" : "text-muted-foreground/50"
                  )}
                >
                  {s.label}
                </span>
                {i < STAGES.length - 1 && (
                  <div className={cn("w-6 h-px", isPast ? "bg-emerald-300" : "bg-border")} />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
