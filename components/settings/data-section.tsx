"use client";
import { useRef, useState, useSyncExternalStore } from "react";
import { Download, FileJson, Trash2, Upload } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { Badge, Button, Progress } from "@/components/ui";
import { useSynforma } from "@/lib/synforma/store";
import type { Program } from "@/lib/synforma/types";
import { ConfirmDialog } from "./confirm-dialog";
import { FieldRow, SettingsSection, StatusLine } from "./section";

const STORE_KEY = "synforma-store-v1";
const SANDBOX_KEYS = ["meridian-crm-db", "meridian-ui-version"];
/** Browsers commonly allow about 5 MB of localStorage per origin; shown as an estimate only. */
const ASSUMED_QUOTA_BYTES = 5 * 1024 * 1024;

interface StorageEstimate {
  total: number;
  synforma: number;
  sandbox: number;
  other: number;
  keys: number;
  available: boolean;
}

const EMPTY_ESTIMATE: StorageEstimate = { total: 0, synforma: 0, sandbox: 0, other: 0, keys: 0, available: false };
let lastEstimate: StorageEstimate = EMPTY_ESTIMATE;

/** Sum of key + value lengths; strings are UTF-16 in memory, so two bytes per code unit. */
function measureStorage(): StorageEstimate {
  try {
    let synforma = 0;
    let sandbox = 0;
    let other = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key === null) continue;
      const bytes = (key.length + (localStorage.getItem(key)?.length ?? 0)) * 2;
      if (key === STORE_KEY) synforma += bytes;
      else if (SANDBOX_KEYS.includes(key) || key.startsWith("meridian-")) sandbox += bytes;
      else other += bytes;
    }
    const next = { total: synforma + sandbox + other, synforma, sandbox, other, keys: localStorage.length, available: true };
    const same = (Object.keys(next) as (keyof StorageEstimate)[]).every((k) => next[k] === lastEstimate[k]);
    if (!same) lastEstimate = next;
    return lastEstimate;
  } catch {
    return EMPTY_ESTIMATE;
  }
}

function subscribeStorage(onChange: () => void) {
  const unsubscribe = useSynforma.subscribe(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    unsubscribe();
    window.removeEventListener("storage", onChange);
  };
}

function useStorageEstimate(): StorageEstimate {
  return useSyncExternalStore(subscribeStorage, measureStorage, () => EMPTY_ESTIMATE);
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function exportFileName(date: Date): string {
  return `synforma-export-${date.toISOString().slice(0, 10)}.json`;
}

const STATUS_TONE: Record<Program["status"], "muted" | "amber" | "verdant" | "outline"> = {
  draft: "muted",
  discovering: "amber",
  understood: "outline",
  active: "verdant",
  paused: "muted",
};

type Pending = { kind: "import"; text: string; programs: number; runs: number; fileName: string } | { kind: "delete"; program: Program } | { kind: "reset" } | null;

export function DataSection() {
  const programs = useSynforma((s) => s.programs);
  const runs = useSynforma((s) => s.runs);
  const eventCount = useSynforma((s) => s.events.length);
  const interventionCount = useSynforma((s) => Object.keys(s.interventions).length);
  const estimate = useStorageEstimate();

  const [pending, setPending] = useState<Pending>(null);
  const [alsoClearSandbox, setAlsoClearSandbox] = useState(false);
  const [importFeedback, setImportFeedback] = useState<{ tone: "verdant" | "signal"; text: string } | null>(null);
  const [exportFeedback, setExportFeedback] = useState<{ tone: "verdant" | "signal" | "muted"; text: string } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const programList = Object.values(programs).sort((a, b) => b.updatedAt - a.updatedAt);
  const runsByProgram = (id: string) => Object.values(runs).filter((r) => r.programId === id).length;

  async function copyJSON(json: string): Promise<boolean> {
    try {
      await navigator.clipboard.writeText(json);
      return true;
    } catch {
      return false;
    }
  }

  async function onExport() {
    const json = useSynforma.getState().exportJSON();
    const name = exportFileName(new Date());
    try {
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setExportFeedback({ tone: "verdant", text: `Download started: ${name} (${formatBytes(json.length * 2)}).` });
      toast.success("Export ready", { description: name });
    } catch {
      const copied = await copyJSON(json);
      setExportFeedback(
        copied
          ? { tone: "verdant", text: "Download was blocked, so the JSON was copied to the clipboard instead." }
          : { tone: "signal", text: "Could not download or copy. Check the browser's download and clipboard permissions." },
      );
    }
  }

  async function onCopy() {
    const json = useSynforma.getState().exportJSON();
    const copied = await copyJSON(json);
    setExportFeedback(copied ? { tone: "verdant", text: `Copied ${formatBytes(json.length * 2)} of JSON to the clipboard.` } : { tone: "signal", text: "Clipboard access was denied by the browser." });
  }

  async function onFileChosen(file: File | undefined) {
    if (!file) return;
    setImportFeedback(null);
    let text: string;
    try {
      text = await file.text();
    } catch {
      setImportFeedback({ tone: "signal", text: `Could not read ${file.name}.` });
      return;
    }
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      setImportFeedback({ tone: "signal", text: `${file.name} is not valid JSON.` });
      return;
    }
    const obj = data && typeof data === "object" ? (data as Record<string, unknown>) : null;
    const progs = obj?.programs;
    if (!obj || !progs || typeof progs !== "object" || Array.isArray(progs)) {
      setImportFeedback({ tone: "signal", text: `${file.name} is not a Synforma export: it has no "programs" object.` });
      return;
    }
    const runsObj = obj.runs && typeof obj.runs === "object" && !Array.isArray(obj.runs) ? (obj.runs as Record<string, unknown>) : {};
    setPending({ kind: "import", text, programs: Object.keys(progs as object).length, runs: Object.keys(runsObj).length, fileName: file.name });
  }

  function confirmImport() {
    if (pending?.kind !== "import") return;
    const ok = useSynforma.getState().importJSON(pending.text);
    if (ok) {
      setImportFeedback({ tone: "verdant", text: `Imported ${pending.programs} program${pending.programs === 1 ? "" : "s"} and ${pending.runs} run${pending.runs === 1 ? "" : "s"} from ${pending.fileName}.` });
      toast.success("Import complete", { description: pending.fileName });
    } else {
      setImportFeedback({ tone: "signal", text: `The store rejected ${pending.fileName}. Nothing was changed.` });
    }
  }

  function confirmDelete() {
    if (pending?.kind !== "delete") return;
    useSynforma.getState().deleteProgram(pending.program.id);
    toast("Program deleted", { description: pending.program.title });
  }

  function confirmReset() {
    useSynforma.getState().resetAll();
    if (alsoClearSandbox) {
      try {
        for (const k of SANDBOX_KEYS) localStorage.removeItem(k);
      } catch {
        /* storage unavailable; nothing to clear */
      }
    }
    setAlsoClearSandbox(false);
    setImportFeedback(null);
    setExportFeedback(null);
    toast("Everything was reset", { description: alsoClearSandbox ? "Programs, runs, settings and the sandbox data." : "Programs, runs and settings." });
  }

  const quotaPct = estimate.available ? Math.min(100, (estimate.total / ASSUMED_QUOTA_BYTES) * 100) : 0;

  return (
    <SettingsSection id="data" eyebrow="Data" title="Your data stays in this browser" lede="Programs, Work Graphs, runs, events, interventions, approvals and the audit log are stored in this browser's localStorage. Nothing is sent to a server; clearing site data deletes it.">
      <FieldRow label="Storage in use" hint="Estimated from the size of every localStorage entry on this origin. Browsers usually allow about 5 MB.">
        {estimate.available ? (
          <div>
            <div className="flex items-baseline justify-between gap-4">
              <span className="mono-data text-lg text-ink">{formatBytes(estimate.total)}</span>
              <span className="text-[13px] text-slate">{quotaPct.toFixed(1)}% of an assumed 5 MB</span>
            </div>
            <Progress value={quotaPct} className="mt-2" tone={quotaPct > 80 ? "signal" : "ink"} />
            <dl className="mt-3 grid grid-cols-3 gap-3 text-[13px]">
              <div>
                <dt className="text-slate">Synforma</dt>
                <dd className="mono-data text-ink">{formatBytes(estimate.synforma)}</dd>
              </div>
              <div>
                <dt className="text-slate">Sandbox CRM</dt>
                <dd className="mono-data text-ink">{formatBytes(estimate.sandbox)}</dd>
              </div>
              <div>
                <dt className="text-slate">Other</dt>
                <dd className="mono-data text-ink">{formatBytes(estimate.other)}</dd>
              </div>
            </dl>
            <StatusLine>
              {programList.length} program{programList.length === 1 ? "" : "s"} · {Object.keys(runs).length} run{Object.keys(runs).length === 1 ? "" : "s"} · {eventCount} event{eventCount === 1 ? "" : "s"} · {interventionCount} intervention{interventionCount === 1 ? "" : "s"}
            </StatusLine>
          </div>
        ) : (
          <StatusLine tone="amber">localStorage is not available in this browser context, so nothing can be persisted.</StatusLine>
        )}
      </FieldRow>

      <FieldRow label="Export" hint="A single JSON file with everything above, including settings. Useful for moving a demo to another browser or keeping a record of a program.">
        <div className="flex flex-wrap gap-2">
          <Button onClick={onExport}>
            <Download />
            Export JSON
          </Button>
          <Button variant="outline" onClick={onCopy}>
            <FileJson />
            Copy JSON
          </Button>
        </div>
        {exportFeedback ? <StatusLine tone={exportFeedback.tone}>{exportFeedback.text}</StatusLine> : null}
      </FieldRow>

      <FieldRow label="Import" hint="Replaces everything in this browser with the contents of a Synforma export. The file is checked before anything changes.">
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          className="sr-only"
          aria-label="Choose a Synforma export file"
          onChange={(e) => {
            void onFileChosen(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        <Button variant="outline" onClick={() => fileInput.current?.click()}>
          <Upload />
          Import JSON
        </Button>
        {importFeedback ? <StatusLine tone={importFeedback.tone}>{importFeedback.text}</StatusLine> : null}
      </FieldRow>

      <FieldRow label="Programs" hint="Deleting a program removes its Work Graph, discovery, runs, events, signals, hypotheses, interventions and approvals. Audit entries are kept.">
        {programList.length ? (
          <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
            {programList.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 p-3.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink">{p.title}</p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-slate">
                    <Badge variant={STATUS_TONE[p.status]}>{p.status}</Badge>
                    <span>{p.application.name}</span>
                    <span>·</span>
                    <span className="mono-data">{runsByProgram(p.id)} runs</span>
                    <span>·</span>
                    <span>{p.planner} planner</span>
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={() => setPending({ kind: "delete", program: p })}>
                  <Trash2 />
                  Delete
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="rounded-lg border border-dashed border-line-strong p-5 text-sm text-slate">
            No programs stored yet. Start one in{" "}
            <Link href="/demo" className="text-graphite underline decoration-line-strong underline-offset-[3px] hover:text-ink">
              Mission Control
            </Link>
            .
          </div>
        )}
      </FieldRow>

      <FieldRow label="Reset everything" hint="Removes all programs, runs and settings from this browser. Cannot be undone; export first if in doubt.">
        <Button variant="signal" onClick={() => setPending({ kind: "reset" })}>
          <Trash2 />
          Reset everything
        </Button>
      </FieldRow>

      <ConfirmDialog
        open={pending?.kind === "import"}
        onOpenChange={(o) => !o && setPending(null)}
        title="Replace stored data?"
        description={
          pending?.kind === "import"
            ? `${pending.fileName} contains ${pending.programs} program${pending.programs === 1 ? "" : "s"} and ${pending.runs} run${pending.runs === 1 ? "" : "s"}. Importing replaces everything currently stored in this browser, including settings.`
            : ""
        }
        confirmLabel="Import and replace"
        onConfirm={confirmImport}
      />
      <ConfirmDialog
        open={pending?.kind === "delete"}
        onOpenChange={(o) => !o && setPending(null)}
        title="Delete this program?"
        description={pending?.kind === "delete" ? `"${pending.program.title}" and its ${runsByProgram(pending.program.id)} runs, graph and interventions will be removed from this browser.` : ""}
        confirmLabel="Delete program"
        destructive
        onConfirm={confirmDelete}
      />
      <ConfirmDialog
        open={pending?.kind === "reset"}
        onOpenChange={(o) => {
          if (!o) {
            setPending(null);
            setAlsoClearSandbox(false);
          }
        }}
        title="Reset everything?"
        description="All programs, runs, events, interventions, approvals, the audit log and settings will be removed from this browser."
        confirmLabel="Reset everything"
        destructive
        onConfirm={confirmReset}
      >
        <label className="flex cursor-pointer items-start gap-3 rounded-md border border-line p-3 text-sm text-graphite">
          <input type="checkbox" className="mt-0.5 h-4 w-4 accent-ink" checked={alsoClearSandbox} onChange={(e) => setAlsoClearSandbox(e.target.checked)} />
          <span>
            Also reset the Meridian CRM sandbox data (<code className="mono-data text-[12px]">meridian-crm-db</code>), returning the demo application to its seed records.
          </span>
        </label>
      </ConfirmDialog>
    </SettingsSection>
  );
}
