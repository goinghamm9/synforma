"use client";

import type { ReactNode } from "react";
import { MotionConfig } from "motion/react";

/** Honors the operating-system reduced-motion preference for every motion component beneath it. */
export function MotionProvider({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
