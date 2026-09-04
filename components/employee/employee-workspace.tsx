"use client";
import { useRef } from "react";
import Link from "next/link";
import { ArrowRight, Compass } from "lucide-react";
import { Button, Skeleton } from "@/components/ui";
import { SynformaMark } from "@/components/brand/logo";
import { selectActiveProgram, useSynforma } from "@/lib/synforma/store";
import type { Program } from "@/lib/synforma/types";
import { ApprovalDialog } from "./approval-dialog";
import { SynformaPanel } from "./synforma-panel";
import { TargetFrame } from "./target-frame";
import { useGuideRun } from "./use-guide-run";
import { useStoreHydrated } from "./use-store-hydrated";

/**
 * Employee view: the target application on the left, the Synforma panel on
 * the right. Under 1024px the panel becomes a sheet below the application.
 */
export function EmployeeWorkspace() {
  const hydrated = useStoreHydrated();
  const program = useSynforma(selectActiveProgram);

  if (!hydrated) return <WorkspaceSkeleton />;
  if (!program || !program.workflow || !program.parsed) return <NoProgram program={program} />;
  if (program.workflow.steps.length === 0) return <NoProgram program={program} reason="The active program has no workflow steps yet." />;
  return <GuideWorkspace key={program.id} program={program} />;
}

function GuideWorkspace({ program }: { program: Program }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const run = useGuideRun(program, iframeRef);
  const currentUrl = run.page?.url ?? (run.frameReady ? run.startUrl : null);
  return (
    <div className="flex flex-1 flex-col lg:h-[calc(100vh-3rem)] lg:flex-row lg:overflow-hidden" data-testid="employee-workspace">
      <div className="flex h-[68vh] min-h-[420px] flex-col lg:h-auto lg:min-h-0 lg:w-[62%] lg:flex-none">
        <TargetFrame
          ref={iframeRef}
          appName={program.application.name}
          currentUrl={currentUrl}
          phase={run.phase}
          frameReady={run.frameReady}
          frameError={run.frameError}
          highlight={run.highlight}
          cursor={run.cursor}
          frame={run.frame}
          assisting={run.assistingStepId !== null}
          onReload={() => void run.reloadFrame()}
        />
      </div>
      <aside
        className="relative z-10 -mt-3 flex min-h-0 flex-col rounded-t-xl border border-line bg-paper shadow-[0_-4px_16px_rgba(11,11,12,0.06)] lg:mt-0 lg:w-[38%] lg:flex-none lg:rounded-none lg:border-y-0 lg:border-r-0 lg:border-l lg:shadow-none"
        aria-label="Synforma panel"
      >
        <div className="flex shrink-0 justify-center py-1.5 lg:hidden" aria-hidden="true">
          <span className="h-1 w-10 rounded-full bg-line-strong" />
        </div>
        <SynformaPanel program={program} run={run} />
      </aside>
      <ApprovalDialog approval={run.approval} onDecide={run.decideApproval} />
    </div>
  );
}

function WorkspaceSkeleton() {
  return (
    <div className="flex flex-1 flex-col lg:h-[calc(100vh-3rem)] lg:flex-row" aria-busy="true" aria-label="Loading">
      <div className="flex h-[68vh] flex-col gap-3 p-4 lg:h-auto lg:w-[62%]">
        <Skeleton className="h-8 w-1/3" />
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="flex-1" />
      </div>
      <div className="flex flex-col gap-3 border-t border-line p-4 lg:w-[38%] lg:border-l lg:border-t-0">
        <Skeleton className="h-5 w-1/2" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    </div>
  );
}

function NoProgram({ program, reason }: { program: Program | null; reason?: string }) {
  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <div className="max-w-md rounded-lg border border-line bg-surface p-6 text-center" data-testid="no-program">
        <SynformaMark className="mx-auto h-10 w-10 text-ink" />
        <p className="eyebrow mt-4">Employee view</p>
        <h1 className="mt-1 text-lg font-medium text-ink">No program yet</h1>
        <p className="mt-2 text-sm leading-relaxed text-slate">
          {reason ??
            (program
              ? `"${program.title}" has not finished discovery and planning, so there is no workflow to guide.`
              : "Guide mode needs a program: an objective Synforma has turned into a workflow by discovering the application.")}{" "}
          Start one in Mission Control and come back here to try it as an employee.
        </p>
        <Button asChild className="mt-5">
          <Link href="/demo">
            <Compass /> Open Mission Control <ArrowRight />
          </Link>
        </Button>
      </div>
    </div>
  );
}
