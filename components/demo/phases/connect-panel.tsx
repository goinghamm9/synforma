"use client";
import * as React from "react";
import { ArrowRight, Loader2, PlugZap, RefreshCw } from "lucide-react";
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui";
import type { ConnectionInfo } from "../types";
import { ErrorNote, Eyebrow, KeyValue, Note, PanelHeader, Stat } from "../bits";
import { useSecondsWhile } from "../use-elapsed";

interface Props {
  status: "idle" | "connecting" | "connected" | "error";
  info: ConnectionInfo | null;
  error: string | null;
  /** When the running connect started (epoch ms); shown as elapsed seconds after a few seconds. */
  since?: number | null;
  /** 2 while or after the automatic second attempt. */
  attempt?: number;
  /** The error came from the application's own error page: offer the data reset first. */
  crashed?: boolean;
  appName: string;
  baseUrl: string;
  version: string;
  /** One honest sentence about the target ("Fictional replica of …"). */
  replicaNote: string;
  /** The target picker, rendered above the application card. */
  picker?: React.ReactNode;
  onConnect: () => void;
  /** Remove what the application keeps in this browser and connect again. */
  onResetData?: () => void;
  onContinue: () => void;
}

export function ConnectPanel({ status, info, error, since = null, attempt = 1, crashed = false, appName, baseUrl, version, replicaNote, picker, onConnect, onResetData, onContinue }: Props) {
  const connecting = status === "connecting";
  const connectingFor = useSecondsWhile(connecting, since);
  const connectingLabel = `Connecting…${connectingFor >= 3 ? ` ${connectingFor} s` : ""}${attempt > 1 ? " · second attempt" : ""}`;
  return (
    <div className="space-y-5 p-5">
      <PanelHeader
        eyebrow="Phase 1 · Connect"
        title="Point Synforma at an application it has never seen"
        description="No connector, no selectors, no training data about this app. Synforma reads the interface through the same generic semantics a screen reader uses."
      />

      {picker}

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <CardTitle>{appName}</CardTitle>
            <Badge variant="outline">v{version}</Badge>
          </div>
          <CardDescription>{replicaNote} It contains no Synforma hooks, ids or data attributes.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <KeyValue
            items={[
              { label: "Base URL", value: <span className="mono-data">{baseUrl}</span> },
              { label: "Access", value: "Same-origin iframe in this prototype; production uses a browser extension, APIs and MCP." },
            ]}
          />
          <div className="flex flex-wrap items-center gap-2">
            {status !== "connected" ? (
              <Button onClick={onConnect} disabled={connecting} data-testid="connect-app">
                {connecting ? <Loader2 className="animate-spin" aria-hidden="true" /> : <PlugZap aria-hidden="true" />}
                {connecting ? connectingLabel : "Connect application"}
              </Button>
            ) : (
              <Button variant="outline" size="sm" onClick={onConnect} disabled={connecting}>
                <RefreshCw aria-hidden="true" />
                Re-read home page
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {status === "error" ? (
        <div data-testid="connect-error" data-crashed={crashed}>
          <ErrorNote
            title={crashed ? "The application hit an error" : "Could not connect"}
            body={error ?? "The application did not load."}
            action={
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={onConnect}>
                  Try again
                </Button>
                {onResetData ? (
                  <Button size="sm" variant={crashed ? "default" : "outline"} onClick={onResetData} data-testid="connect-reset-data">
                    Reset application data and retry
                  </Button>
                ) : null}
              </div>
            }
          />
        </div>
      ) : null}

      {status === "connected" && info ? (
        <section className="space-y-3" data-testid="connection-info">
          <div className="flex items-center justify-between">
            <Eyebrow>What the interaction layer sees · Observed</Eyebrow>
            <span className="mono-data text-[11px] text-slate">{info.url}</span>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="Actions" value={info.actions} hint="buttons, links, menu items, tabs" />
            <Stat label="Fields" value={info.fields} hint="inputs, selects, checkboxes" />
            <Stat label="Landmarks" value={info.landmarks.length} hint={info.landmarks.slice(0, 3).join(", ") || "none"} />
            <Stat label="Elements" value={info.elements} hint={`${info.tables} table${info.tables === 1 ? "" : "s"}`} />
          </div>
          <KeyValue
            items={[
              { label: "Title", value: info.title || <span className="text-mist">—</span> },
              { label: "Heading", value: info.heading || <span className="text-mist">—</span> },
              { label: "Headings", value: info.headings.length ? info.headings.slice(0, 6).join(" · ") : <span className="text-mist">—</span> },
              {
                label: "Sample actions",
                value: (
                  <span className="flex flex-wrap gap-1">
                    {info.sampleActions.map((a) => (
                      <span key={a} className="rounded-full border border-line bg-surface-2 px-2 py-0.5 text-[11px] text-graphite">
                        {a}
                      </span>
                    ))}
                  </span>
                ),
              },
            ]}
          />
          <Note>These counts come from a live semantic snapshot of the page in the iframe, not from any description of Meridian CRM.</Note>
          <Button onClick={onContinue} data-testid="continue-objective">
            Continue to objective
            <ArrowRight aria-hidden="true" />
          </Button>
        </section>
      ) : null}

      {status === "idle" ? <Note>Connecting loads the application in the workspace on the left and takes one semantic snapshot of its home page. Nothing is modified.</Note> : null}
    </div>
  );
}
