"use client";
import * as React from "react";
import Link from "next/link";
import { Cpu, Loader2, RotateCcw, SlidersHorizontal } from "lucide-react";
import { Badge, Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Skeleton } from "@/components/ui";
import { cn } from "@/lib/utils";
import { PREFERENCE_LABEL } from "./types";
import { MissionSessionProvider } from "./session/context";
import { useMissionSession, type DemoView } from "./session/use-mission-session";
import { PhaseRail } from "./phase-rail";
import { TargetFrame } from "./target-frame";
import { ApprovalDialog } from "./approval-dialog";
import { RunEventsDrawer } from "./run-events-drawer";
import { AdvancedView } from "./advanced-view";
import { SimpleView } from "./simple-view";

/**
 * Mission Control — the operator's view of one adoption program, driven end to
 * end by the engine against the sandbox application in the iframe.
 *
 * Domain data (program, graph, discovery, runs, events, audit, approvals,
 * interventions) is persisted through the Synforma store so a reload restores
 * the state; only transient progress (logs, cursors) lives in the session hooks.
 * This component is the shell: header, view toggle, phase navigation and the
 * two views (simple: three stages; advanced: eight phases) around one iframe.
 */

const VIEWS: { id: DemoView; label: string }[] = [
  { id: "simple", label: "Simple" },
  { id: "advanced", label: "Advanced" },
];

export function MissionControl() {
  const session = useMissionSession();
  const { ready, program, settings, plannerLabel, busyLabel, connection, phase, setPhase, demoView, setDemoView } = session;
  const advanced = demoView === "advanced";
  const approval = session.act.approval;
  const approvalStep = approval && program?.workflow ? program.workflow.steps.find((s) => s.id === approval.stepId) : undefined;

  return (
    <MissionSessionProvider session={session}>
      <div className="flex flex-col bg-paper lg:h-[calc(100dvh-3rem)] lg:min-h-[640px]">
        <header className="flex h-12 shrink-0 items-center gap-3 border-b border-line px-4">
          <div className="flex min-w-0 items-center gap-2">
            <span className="eyebrow hidden sm:inline">Mission Control</span>
            <span className="hidden text-line-strong sm:inline" aria-hidden="true">
              /
            </span>
            {ready ? (
              <>
                <span className="truncate text-sm font-medium text-ink" data-testid="program-title">
                  {program?.title ?? "New program"}
                </span>
                {program ? (
                  <Badge variant={program.status === "active" ? "verdant" : "muted"} data-testid="program-status">
                    {program.status}
                  </Badge>
                ) : null}
              </>
            ) : (
              <Skeleton className="h-4 w-40" />
            )}
          </div>
          <Badge variant="outline" className="hidden max-w-[320px] truncate md:inline-flex" title={plannerLabel} data-testid="planner-badge">
            <Cpu className="h-3 w-3" aria-hidden="true" />
            {plannerLabel}
          </Badge>
          {ready ? (
            <Link
              href="/settings"
              className="hidden items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-0.5 text-[11px] text-slate transition-colors hover:bg-surface-2 hover:text-ink lg:inline-flex"
              title="Assistance preference for new runs · change it in Settings"
              data-testid="assistance-preference"
              data-preference={settings.assistancePreference}
            >
              <SlidersHorizontal className="h-3 w-3" aria-hidden="true" />
              <span className="text-mist">Assistance</span>
              {PREFERENCE_LABEL[settings.assistancePreference]}
            </Link>
          ) : null}
          <div className="ml-auto flex shrink-0 items-center gap-2">
            {busyLabel ? (
              <span className="inline-flex items-center gap-1.5 text-xs text-slate">
                <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                {busyLabel}…
              </span>
            ) : null}
            <div role="radiogroup" aria-label="View" className="inline-flex h-7 items-center rounded-md bg-surface-2 p-0.5 text-xs" data-testid="demo-view-toggle" data-view={demoView}>
              {VIEWS.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  role="radio"
                  aria-checked={demoView === v.id}
                  onClick={() => setDemoView(v.id)}
                  disabled={!ready}
                  className={cn(
                    "cursor-pointer rounded px-2.5 py-1 font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60",
                    demoView === v.id ? "bg-surface text-ink shadow-[0_1px_0_rgba(0,0,0,0.04)]" : "text-slate hover:text-ink",
                  )}
                >
                  {v.label}
                </button>
              ))}
            </div>
            <Button variant="ghost" size="sm" onClick={() => session.setConfirmReset(true)} disabled={!ready} data-testid="start-over">
              <RotateCcw aria-hidden="true" />
              Start over
            </Button>
          </div>
        </header>

        {advanced ? <PhaseRail current={phase} completed={session.completedPhases} maxIndex={ready ? session.maxIndex : -1} onSelect={setPhase} /> : null}

        <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
          <section className="h-[420px] shrink-0 border-b border-line lg:h-auto lg:w-[58%] lg:border-b-0 lg:border-r" aria-label="Target application">
            <TargetFrame
              iframeRef={connection.iframeRef}
              title={`${session.target.name} · sandbox`}
              connected={connection.connected}
              connecting={connection.status === "connecting"}
              currentUrl={connection.currentUrl}
              busy={Boolean(busyLabel)}
              cursor={connection.cursor}
              highlight={connection.highlight}
              onConnect={() => void connection.connect(session.target)}
            />
          </section>
          {advanced ? (
            <aside className="min-h-0 flex-1 lg:w-[42%] lg:overflow-y-auto scrollbar-thin" aria-label="Phase panel" data-testid="phase-panel">
              <AdvancedView />
            </aside>
          ) : (
            <aside className="min-h-0 min-w-0 flex-1 lg:w-[42%] lg:overflow-y-auto scrollbar-thin" aria-label="Stages">
              <SimpleView />
            </aside>
          )}
        </div>

        <ApprovalDialog request={approval} step={approvalStep} onDecide={session.act.decideApproval} />
        <RunEventsDrawer run={session.drawerRun} events={session.drawerEvents} workflow={program?.workflow} open={Boolean(session.drawerRun)} onOpenChange={(o) => !o && session.setDrawerRun(null)} />

        <Dialog open={session.confirmReset} onOpenChange={session.setConfirmReset}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="text-base">Start over?</DialogTitle>
              <DialogDescription>This deletes the program, its Work Graph, discovery, runs, events and interventions from this browser. The audit log is kept.</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => session.setConfirmReset(false)}>
                Cancel
              </Button>
              <Button variant="signal" onClick={session.startOver} data-testid="confirm-start-over">
                Start over
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </MissionSessionProvider>
  );
}
