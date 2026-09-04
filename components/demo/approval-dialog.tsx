"use client";
import * as React from "react";
import { ShieldCheck } from "lucide-react";
import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui";
import type { ApprovalRequest, WorkflowStep } from "@/lib/synforma/types";

interface Props {
  request: ApprovalRequest | null;
  step?: WorkflowStep;
  onDecide: (decision: "granted" | "denied") => void;
}

/**
 * Approval gate for commit actions in Act mode. The runner waits on this
 * decision; the dialog cannot be dismissed by clicking outside so a decision
 * is always explicit.
 */
export function ApprovalDialog({ request, step, onDecide }: Props) {
  const entries = request ? Object.entries(request.payload) : [];
  return (
    <Dialog open={Boolean(request)} onOpenChange={() => {}}>
      <DialogContent
        onEscapeKeyDown={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
        aria-describedby={undefined}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="h-4 w-4 text-ink" aria-hidden="true" />
            Approval required
          </DialogTitle>
          <DialogDescription>{request?.summary}</DialogDescription>
        </DialogHeader>
        {request ? (
          <div className="mt-4 space-y-3">
            <div className="text-sm">
              <span className="text-slate">Step</span> <span className="font-medium text-ink">{step ? `${step.index + 1}. ${step.title}` : request.stepId}</span>
              <span className="text-slate"> · Action</span> <span className="text-ink">{request.title}</span>
            </div>
            <div className="scrollbar-thin max-h-64 overflow-y-auto rounded-lg border border-line">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-[11px] uppercase tracking-wider text-slate">
                    <th className="px-3 py-2 font-medium">Field</th>
                    <th className="px-3 py-2 font-medium">Value</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.length === 0 ? (
                    <tr>
                      <td colSpan={2} className="px-3 py-2 text-slate">
                        No values collected before this commit.
                      </td>
                    </tr>
                  ) : null}
                  {entries.map(([k, v]) => (
                    <tr key={k} className="border-b border-line last:border-0">
                      <td className="px-3 py-1.5 text-graphite">{k}</td>
                      <td className="mono-data px-3 py-1.5 text-ink">{v || <span className="text-mist">—</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-slate">Every action in this run is audited. Denying stops the run before anything is committed.</p>
          </div>
        ) : null}
        <DialogFooter>
          <Button variant="outline" onClick={() => onDecide("denied")}>
            Deny
          </Button>
          <Button onClick={() => onDecide("granted")}>Approve</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
