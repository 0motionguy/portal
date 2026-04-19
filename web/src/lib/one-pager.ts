import { readFileSync } from "node:fs";
import { join } from "node:path";

// The one-pager HTML is the source of truth (also mirrored in
// docs/one-pager.html at the repo root). We extract the <style>...</style>
// and <body>...</body> contents so Next.js can inline both into its own
// <html> shell without conflicting with the root layout.
//
// The body is returned as a single string — DO NOT split it across
// fragments. Splitting and interleaving React components between
// dangerouslySetInnerHTML siblings breaks tag balance across fragments,
// which React 19 flags as a hydration mismatch and then regenerates the
// subtree on the client with different markup than the server rendered.
// The observable symptom is layout stretch/collapse on hydration.
//
// For interactive widgets, use empty <div id="portal-slot-*"> anchors
// inside the HTML body and mount React components into them client-side
// via createPortal (see web/src/components/SlotMount.tsx).

const ONE_PAGER_PATH = join(process.cwd(), "src", "one-pager.html");

export interface OnePager {
  styles: string;
  body: string;
}

export const SLOT_IDS = {
  heroActions: "portal-slot-hero-actions",
  liveVisit: "portal-slot-live-visit",
} as const;

let cached: OnePager | null = null;

export function loadOnePager(): OnePager {
  if (cached) return cached;
  const html = readFileSync(ONE_PAGER_PATH, "utf8");

  const styleMatch = html.match(/<style>([\s\S]*?)<\/style>/);
  const bodyMatch = html.match(/<body>([\s\S]*?)<\/body>/);

  if (!styleMatch || !bodyMatch) {
    throw new Error("one-pager.html missing <style> or <body> block");
  }

  cached = { styles: styleMatch[1].trim(), body: bodyMatch[1].trim() };
  return cached;
}
