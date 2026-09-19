"use client";
import * as React from "react";
import { toast } from "sonner";
import type { StepWindow } from "@/lib/synforma/analysis/stimulus";
import { useSynforma } from "@/lib/synforma/store";
import type { Run, RunEvent, WorkflowStep } from "@/lib/synforma/types";
import { errorMessage } from "./helpers";

/**
 * Screen recording of a Mission Control run, for a stimulus analysis with the
 * TRIBE bridge (research). The person picks what to share through the browser's
 * own dialog; nothing starts by itself, nothing is uploaded, and the two files
 * (the video and the step windows) are downloaded to their computer when they stop.
 *
 * Mission Control only: the employee view never records anything.
 */

export type RecordingStatus = "idle" | "recording" | "saving";

export interface RecordingApi {
  /** Empty when screen capture is available in this browser context; otherwise the reason it is not. */
  unavailableReason: string;
  status: RecordingStatus;
  /** When the current recording started (ms epoch). */
  startedAt: number | null;
  error: string | null;
  /** Ask the browser for a screen to record. Only ever called from the Record button. */
  start: () => Promise<void>;
  /** Stop and download `synforma-run-<runId>.webm` and `synforma-run-<runId>-steps.json`. */
  stop: () => void;
}

const SERVER_REASON = "Screen capture is decided in the browser.";
const MIME_CANDIDATES = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"];

/** Why screen capture cannot be offered here, or "" when it can. */
export function captureUnavailableReason(): string {
  if (typeof window === "undefined") return SERVER_REASON;
  if (!window.isSecureContext) return "Screen capture needs a secure context (https or localhost).";
  if (typeof MediaRecorder === "undefined") return "This browser has no MediaRecorder, so a recording could not be saved.";
  if (typeof navigator.mediaDevices?.getDisplayMedia !== "function") return "Screen capture is not available in this browser context (getDisplayMedia is missing, for example in headless or embedded browsers).";
  return "";
}

const subscribeNever = () => () => {};

function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined" || typeof MediaRecorder.isTypeSupported !== "function") return undefined;
  return MIME_CANDIDATES.find((m) => MediaRecorder.isTypeSupported(m));
}

/**
 * Step windows of one run relative to the moment the recording started, in seconds.
 * A `step_entered` opens a window; the matching `step_completed` (or the next step, or the
 * end of the recording) closes it. Offsets are clamped to the recording, so a step that began
 * before the recording starts at 0 and steps entirely outside it are dropped.
 */
export function stepWindowsFor(events: RunEvent[], steps: WorkflowStep[] | undefined, recordingStartMs: number, recordingEndMs: number): StepWindow[] {
  const durationS = Math.max(0, (recordingEndMs - recordingStartMs) / 1000);
  const rel = (t: number) => Math.min(durationS, Math.max(0, (t - recordingStartMs) / 1000));
  const titleOf = (id: string, message?: string) => steps?.find((s) => s.id === id)?.title ?? message ?? id;
  const ordered = events.filter((e) => (e.type === "step_entered" || e.type === "step_completed") && e.stepId).sort((a, b) => a.t - b.t);
  const windows: StepWindow[] = [];
  const open = new Map<string, { enteredAt: number; title: string }>();
  const close = (stepId: string, at: number) => {
    const o = open.get(stepId);
    if (!o) return;
    open.delete(stepId);
    windows.push({ stepId, title: o.title, startS: rel(o.enteredAt), endS: rel(at) });
  };
  for (const e of ordered) {
    const stepId = e.stepId!;
    if (e.type === "step_entered") {
      // Entering a step closes anything still open: the runner does not always emit a completion (abandon, failure).
      for (const id of Array.from(open.keys())) close(id, e.t);
      open.set(stepId, { enteredAt: e.t, title: titleOf(stepId, e.message) });
    } else close(stepId, e.t);
  }
  for (const id of Array.from(open.keys())) close(id, recordingEndMs);
  return windows.map((w) => ({ ...w, endS: Math.max(w.startS, w.endS) })).filter((w) => w.endS > w.startS);
}

/** The run the recording covers: the latest run of the program that overlaps the recording window, else the session's current run. */
export function pickRecordedRun(runs: Run[], programId: string | null, currentRunId: string | null, recordingStartMs: number, recordingEndMs: number): Run | null {
  const overlapping = runs
    .filter((r) => (!programId || r.programId === programId) && r.startedAt <= recordingEndMs && (r.endedAt ?? recordingEndMs) >= recordingStartMs)
    .sort((a, b) => b.startedAt - a.startedAt);
  if (overlapping.length) return overlapping[0];
  return (currentRunId && runs.find((r) => r.id === currentRunId)) || null;
}

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 5000);
}

interface Options {
  programId: string | null;
  /** The Act run started in this session, if any (`act.state.runId`). */
  currentRunId: string | null;
}

export function useRecording({ programId, currentRunId }: Options): RecordingApi {
  const unavailableReason = React.useSyncExternalStore(subscribeNever, captureUnavailableReason, () => SERVER_REASON);
  const [status, setStatus] = React.useState<RecordingStatus>("idle");
  const [startedAt, setStartedAt] = React.useState<number | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const recorderRef = React.useRef<MediaRecorder | null>(null);
  // Read when a recording stops, which may be long after these props last changed.
  const latest = React.useRef({ programId, currentRunId });
  React.useEffect(() => {
    latest.current = { programId, currentRunId };
  }, [programId, currentRunId]);

  const finalize = React.useCallback((chunks: Blob[], mimeType: string, recordingStartMs: number, recordingEndMs: number) => {
    const { programId: pid, currentRunId: rid } = latest.current;
    const s = useSynforma.getState();
    const run = pickRecordedRun(Object.values(s.runs), pid, rid, recordingStartMs, recordingEndMs);
    const runId = run?.id ?? "no-run";
    const steps = run ? s.programs[run.programId]?.workflow?.steps : undefined;
    const windows = run ? stepWindowsFor(s.events.filter((e) => e.runId === run.id), steps, recordingStartMs, recordingEndMs) : [];
    const ext = /mp4/.test(mimeType) ? "mp4" : "webm";
    const videoName = `synforma-run-${runId}.${ext}`;
    const stepsName = `synforma-run-${runId}-steps.json`;
    try {
      download(new Blob(chunks, { type: mimeType }), videoName);
      // A second automatic download right after the first is sometimes blocked; a short pause helps.
      window.setTimeout(() => download(new Blob([JSON.stringify(windows, null, 2)], { type: "application/json" }), stepsName), 400);
      s.addAudit({ actor: "admin", action: "Screen recording saved", programId: pid ?? undefined, runId: run?.id, detail: `${videoName} and ${stepsName} downloaded to this computer · ${windows.length} step window${windows.length === 1 ? "" : "s"} · for a stimulus analysis (research)` });
      if (run) toast.success("Recording saved to your computer", { description: `${videoName} · ${windows.length} step window${windows.length === 1 ? "" : "s"} in ${stepsName}` });
      else toast.warning("Recording saved, but no run overlapped it", { description: `${videoName} · the steps file is empty. Record while the workflow runs to get step windows.` });
    } catch (e) {
      setError(`Could not download the recording: ${errorMessage(e)}`);
    }
    recorderRef.current = null;
    setStatus("idle");
    setStartedAt(null);
  }, []);

  const start = React.useCallback(async () => {
    if (unavailableReason || recorderRef.current) return;
    setError(null);
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
    } catch (e) {
      const msg = errorMessage(e);
      setError(/NotAllowed|Permission|denied/i.test(msg) ? "Screen sharing was declined; nothing was recorded." : `Screen capture failed: ${msg}`);
      return;
    }
    const mimeType = pickMimeType();
    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    } catch (e) {
      stream.getTracks().forEach((t) => t.stop());
      setError(`Could not start the recorder: ${errorMessage(e)}`);
      return;
    }
    const chunks: Blob[] = [];
    const recordingStartMs = Date.now();
    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunks.push(e.data);
    };
    recorder.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      finalize(chunks, recorder.mimeType || mimeType || "video/webm", recordingStartMs, Date.now());
    };
    // The browser's own "Stop sharing" control ends the track; treat it like Stop.
    stream.getVideoTracks()[0]?.addEventListener("ended", () => {
      if (recorder.state !== "inactive") recorder.stop();
    });
    recorderRef.current = recorder;
    recorder.start(1000);
    setStatus("recording");
    setStartedAt(recordingStartMs);
    useSynforma.getState().addAudit({ actor: "admin", action: "Screen recording started", programId: latest.current.programId ?? undefined, detail: "Chosen by the operator in the Act phase · stays on this computer · for a stimulus analysis (research)" });
  }, [finalize, unavailableReason]);

  const stop = React.useCallback(() => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === "inactive") return;
    setStatus("saving");
    recorder.stop();
  }, []);

  // Leaving the page stops an active recording; the stop handler still saves the files.
  React.useEffect(() => {
    return () => {
      const recorder = recorderRef.current;
      if (recorder && recorder.state !== "inactive") recorder.stop();
    };
  }, []);

  return { unavailableReason, status, startedAt, error, start, stop };
}
