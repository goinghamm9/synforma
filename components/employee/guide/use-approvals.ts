"use client";
import { useCallback, useRef, useState } from "react";
import { useSynforma } from "@/lib/synforma/store";
import type { ApprovalRequest } from "@/lib/synforma/types";
import { shortId } from "@/lib/utils";
import type { GuideRefs } from "./shared";
import type { PendingApproval } from "./types";

export type ApprovalExtra = { leftForYou?: string[]; denyLabel?: string; onDecision?: (d: "granted" | "denied") => void };

export interface ApprovalsApi {
  approval: PendingApproval | null;
  /** Ask the person; resolves with their decision (denied outside a run). */
  requestApproval: (req: Omit<ApprovalRequest, "id" | "runId" | "requestedAt">, extra?: ApprovalExtra) => Promise<"granted" | "denied">;
  decideApproval: (decision: "granted" | "denied") => void;
  /** True while a request is waiting for the person. */
  hasPending: () => boolean;
  /** finishRun: drop the dialog. */
  clear: () => void;
}

/** Approval-gated commits, shared by Assist and Get It Done. Every request and decision is recorded and audited. */
export function useApprovals({ refs, programId }: { refs: GuideRefs; programId: string }): ApprovalsApi {
  const { runIdRef, observerRef } = refs;
  const [approval, setApproval] = useState<PendingApproval | null>(null);
  const decideApprovalRef = useRef<((d: "granted" | "denied") => void) | null>(null);

  const requestApproval = useCallback(
    (req: Omit<ApprovalRequest, "id" | "runId" | "requestedAt">, extra?: ApprovalExtra) =>
      new Promise<"granted" | "denied">((resolve) => {
        const id = runIdRef.current;
        if (!id) {
          resolve("denied");
          return;
        }
        const request: ApprovalRequest = { ...req, id: shortId("apr"), runId: id, requestedAt: Date.now() };
        useSynforma.getState().addApproval(request);
        useSynforma.getState().addAudit({ actor: "synforma", action: "approval requested", target: req.title, runId: id, programId, approval: "requested" });
        const settle = (decision: "granted" | "denied") => {
          useSynforma.getState().decideApproval(request.id, decision);
          useSynforma.getState().addAudit({ actor: "human", action: decision === "granted" ? "approval granted" : "approval denied", target: req.title, runId: id, programId, approval: decision });
          decideApprovalRef.current = null;
          setApproval(null);
          observerRef.current?.touch();
          extra?.onDecision?.(decision);
          resolve(decision);
        };
        decideApprovalRef.current = settle;
        setApproval({ ...request, resolve: settle, leftForYou: extra?.leftForYou, denyLabel: extra?.denyLabel });
      }),
    [observerRef, programId, runIdRef],
  );

  const decideApproval = useCallback((decision: "granted" | "denied") => {
    decideApprovalRef.current?.(decision);
  }, []);

  const hasPending = useCallback(() => decideApprovalRef.current !== null, []);

  const clear = useCallback(() => setApproval(null), []);

  return { approval, requestApproval, decideApproval, hasPending, clear };
}
