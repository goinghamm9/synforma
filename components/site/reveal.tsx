"use client";

import type { ReactNode } from "react";
import { motion } from "motion/react";

/**
 * Restrained scroll reveal: a short fade and a small translate, once.
 * Transforms are dropped automatically for people who prefer reduced motion
 * (see MotionProvider); opacity still resolves to 1.
 */
export function Reveal({
  className,
  delay = 0,
  children,
}: {
  className?: string;
  delay?: number;
  children: ReactNode;
}) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 14 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "0px 0px -8% 0px" }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1], delay }}
    >
      {children}
    </motion.div>
  );
}
