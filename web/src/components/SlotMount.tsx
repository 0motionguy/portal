"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

// Renders `children` into a DOM element with a given id via a React portal.
// Used to mount interactive widgets (HeroActionsSlot, LiveVisit) into the
// static one-pager HTML body without splitting the body across multiple
// dangerouslySetInnerHTML fragments.
//
// Why this exists: the /  route renders the entire one-pager body as one
// dangerouslySetInnerHTML. Splitting the body and interleaving React
// children between fragments produces unbalanced HTML across fragments,
// which React flags as a hydration mismatch and regenerates on the
// client — observable as layout stretch on first paint.
//
// Server render produces an empty anchor <div id="..."></div>. On the
// client, useEffect runs after hydration of the static body, finds the
// anchor by id, and createPortal()s the children into it. Because the
// portal mount happens AFTER hydration, there is no server/client
// markup mismatch to resolve.

export function SlotMount({
  anchorId,
  children,
}: {
  anchorId: string;
  children: ReactNode;
}) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);

  useEffect(() => {
    // Re-resolve on every client-side navigation by polling briefly —
    // the one-pager body is rendered via dangerouslySetInnerHTML, and
    // on route transitions React may mount the host before the string
    // is painted. A short microtask-chain covers the race cleanly.
    let cancelled = false;
    const resolve = (attempt: number) => {
      if (cancelled) return;
      const el = document.getElementById(anchorId);
      if (el) {
        setAnchor(el);
        return;
      }
      if (attempt < 10) {
        requestAnimationFrame(() => resolve(attempt + 1));
      }
    };
    resolve(0);
    return () => {
      cancelled = true;
    };
  }, [anchorId]);

  if (!anchor) return null;
  return createPortal(children, anchor);
}
