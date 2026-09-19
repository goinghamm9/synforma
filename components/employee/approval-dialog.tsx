"use client";
import { Lock } from "lucide-react";
import { Badge, Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui";
import type { PendingApproval } from "./use-guide-run";

/** Commit actions are always approval-gated: the person sees exactly what will be written. */
export function ApprovalDialog({ approval, onDecide }: { approval: PendingApproval | null; onDecide: (d: "granted" | "denied") => void }) {
  const entries = approval ? Object.entries(approval.payload) : [];
  const left = approval?.leftForYou ?? [];
  return (
    <Dialog open={Boolean(approval)} onOpenChange={(open) => (!open && approval ? onDecide("denied") : undefined)}>
      <DialogContent aria-describedby={undefined} data-testid="approval-dialog">
        <DialogHeader>
          <p className="eyebrow">Approval required</p>
          <DialogTitle className="mt-1">{approval?.title ?? "Commit"}</DialogTitle>
          <DialogDescription>{approval?.summary}</DialogDescription>
        </DialogHeader>
        {entries.length ? (
          <dl className="mt-4 max-h-64 divide-y divide-line overflow-y-auto rounded-md border border-line text-[13px]">
            {entries.map(([k, v]) => (
              <div key={k} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-3 px-3 py-1.5">
                <dt className="truncate text-slate">{k}</dt>
                <dd className="mono-data truncate text-ink" title={v}>
                  {v || "—"}
                </dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="mt-4 text-[13px] text-slate">No field values were prepared by Synforma; the values already on the form will be committed.</p>
        )}
        {left.length ? (
          <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[12px] text-graphite" data-testid="approval-left-for-you">
            <span>Left for you (not guessed):</span>
            {left.map((name) => (
              <Badge key={name} variant="amber">
                <Lock className="h-3 w-3" aria-hidden="true" /> {name}
              </Badge>
            ))}
          </div>
        ) : null}
        <DialogFooter>
          <Button variant="outline" onClick={() => onDecide("denied")} data-testid="deny-commit">
            {approval?.denyLabel ?? "Deny"}
          </Button>
          <Button onClick={() => onDecide("granted")} data-testid="approve-commit">
            Approve and commit
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
