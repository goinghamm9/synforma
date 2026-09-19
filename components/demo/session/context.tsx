"use client";
import * as React from "react";
import type { MissionSession } from "./use-mission-session";

const MissionSessionContext = React.createContext<MissionSession | null>(null);

/** Makes one Mission Control session available to the views and panels below it. */
export function MissionSessionProvider({ session, children }: { session: MissionSession; children: React.ReactNode }) {
  return <MissionSessionContext.Provider value={session}>{children}</MissionSessionContext.Provider>;
}

export function useMissionSession(): MissionSession {
  const session = React.useContext(MissionSessionContext);
  if (!session) throw new Error("useMissionSession must be used inside <MissionSessionProvider>");
  return session;
}
