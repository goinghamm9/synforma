"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { Button } from "@/components/ui";
import { NAV_LINKS } from "./nav-links";

/**
 * The panel is portaled to <body>: the sticky header uses backdrop-filter,
 * which would otherwise become the containing block for a fixed child.
 * `open` is always false on the server, so the portal never renders during SSR.
 */
export function MobileMenu() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const close = () => setOpen(false);

  const panel = (
    <AnimatePresence>
      {open ? (
        <motion.div
          id="site-mobile-menu"
          key="site-mobile-menu"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-x-0 top-16 bottom-0 z-40 overflow-y-auto border-t border-line bg-paper md:hidden"
        >
          <nav aria-label="Mobile" className="mx-auto flex w-full max-w-6xl flex-col px-6 py-4 sm:px-8">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={close}
                className="border-b border-line py-4 text-lg text-ink transition-colors hover:text-graphite"
              >
                {link.label}
              </Link>
            ))}
            <Button asChild size="lg" className="mt-8">
              <Link href="/demo" onClick={close}>
                Run the demo
              </Link>
            </Button>
            <p className="mt-6 text-xs text-slate">Intelligence for becoming.</p>
          </nav>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );

  return (
    <div className="md:hidden">
      <Button
        variant="ghost"
        size="icon"
        aria-expanded={open}
        aria-controls="site-mobile-menu"
        aria-label={open ? "Close menu" : "Open menu"}
        onClick={() => setOpen((value) => !value)}
      >
        {open ? <X /> : <Menu />}
      </Button>
      {open && typeof document !== "undefined" ? createPortal(panel, document.body) : null}
    </div>
  );
}
