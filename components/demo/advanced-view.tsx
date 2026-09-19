"use client";
import * as React from "react";
import { DEFAULT_OBJECTIVE, SANDBOX_APP } from "@/lib/synforma/demo";
import { PanelSkeleton } from "./bits";
import { useMissionSession } from "./session/context";
import { ConnectPanel } from "./phases/connect-panel";
import { ObjectivePanel } from "./phases/objective-panel";
import { DiscoverPanel } from "./phases/discover-panel";
import { UnderstandPanel } from "./phases/understand-panel";
import { ActPanel } from "./phases/act-panel";
import { GuidePanel } from "./phases/guide-panel";
import { AdaptPanel } from "./phases/adapt-panel";
import { MeasurePanel } from "./phases/measure-panel";

/** The eight-phase operator's view: one panel per phase, driven by the shared session. */
export function AdvancedView() {
  const s = useMissionSession();
  const { ready, phase, program, connection, discovery, act, synth, trust, setPhase, plannerLabel, plannerName, settings } = s;
  const engineBusy = discovery.state.status === "running" || act.state.status === "running" || synth.state.status === "running" || s.uiBusy;
  const graphForPreview = discovery.liveGraph ?? s.storeGraph;

  if (!ready) return <PanelSkeleton />;
  if (phase === "connect")
    return (
      <ConnectPanel
        status={connection.status}
        info={connection.info}
        error={connection.error}
        appName={SANDBOX_APP.name}
        baseUrl={SANDBOX_APP.baseUrl}
        version={SANDBOX_APP.version}
        onConnect={() => void connection.connect()}
        onContinue={() => setPhase("objective")}
      />
    );
  if (phase === "objective")
    return (
      <ObjectivePanel
        key={program?.id ?? "new"}
        objective={program?.objectiveText ?? DEFAULT_OBJECTIVE}
        context={s.context}
        hasDiscovery={Boolean(program?.discovery?.endedAt)}
        plannerLabel={plannerLabel}
        busy={discovery.state.status === "running" || discovery.state.status === "planning"}
        onStart={(o, c, m) => void discovery.start(o, c, m)}
        onBack={() => setPhase("connect")}
      />
    );
  if (phase === "discover")
    return (
      <DiscoverPanel
        state={discovery.state}
        program={program}
        liveGraph={graphForPreview}
        plannerLabel={plannerLabel}
        plannerName={plannerName}
        engineBusy={engineBusy}
        onStop={discovery.stop}
        onRestart={discovery.restart}
        onContinue={() => setPhase("understand")}
      />
    );
  if (!program) return <PanelSkeleton />;
  if (phase === "understand")
    return (
      <UnderstandPanel
        program={program}
        graph={s.storeGraph}
        plannerLabel={plannerLabel}
        plannerName={plannerName}
        claims={trust.claims}
        contract={trust.contract}
        evidenceFocus={s.evidenceFocus}
        onValidateClaim={trust.validate}
        onContractChange={trust.setContract}
        onApproveContract={trust.approveContract}
        onApprove={s.approveProgram}
        onEdit={() => setPhase("objective")}
        onDiscover={() => setPhase("discover")}
      />
    );
  if (phase === "act")
    return (
      <ActPanel
        state={act.state}
        program={program}
        uiVariant={s.uiVariant}
        uiBusy={s.uiBusy}
        plannerName={plannerName}
        requireApproval={settings.requireApprovalForCommit}
        agentRuns={s.programRuns.filter((r) => r.actor === "agent")}
        ledger={s.programLedger}
        undoing={trust.undoing}
        onRun={() => void act.run()}
        onStop={act.stop}
        onToggleUi={(v) => void s.toggleUi(v)}
        onOpenOutcome={(url) => void s.openOutcome(url)}
        onUndo={() => void s.undoLedger()}
        onReviewEvidence={s.reviewEvidence}
      />
    );
  if (phase === "guide")
    return <GuidePanel state={synth.state} program={program} runs={s.programRuns} events={s.programEvents} demonstration={s.demonstration} onRunSynthetic={() => void synth.run()} onStop={synth.stop} onOpenRun={s.setDrawerRun} />;
  if (phase === "adapt") return <AdaptPanel program={program} interventions={s.programInterventions} hypotheses={s.programHypotheses} runs={s.programRuns} events={s.programEvents} onGoGuide={() => setPhase("guide")} />;
  return (
    <MeasurePanel program={program} runs={s.programRuns} events={s.programEvents} audit={s.audit} hypotheses={s.programHypotheses} interventions={s.programInterventions} onOpenRun={s.setDrawerRun} onExport={s.exportJSON} onCopy={() => void s.copyJSON()} />
  );
}
