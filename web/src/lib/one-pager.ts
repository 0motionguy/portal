import { readFileSync } from "node:fs";
import { join } from "node:path";

// The one-pager HTML is the source of truth (also mirrored in
// docs/one-pager.html at the repo root). We parse out the <style>...</style>
// block and the <body>...</body> contents so Next.js can inline both into
// its own <html> shell without conflicting with the root layout.
//
// NOTE: this runs at build time (Server Component), not per request.

const ONE_PAGER_PATH = join(process.cwd(), "src", "one-pager.html");

export interface OnePager {
  styles: string;
  body: string;
}

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
