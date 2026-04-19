"use client";

import { useEffect } from "react";

// Browser wallet extensions (MetaMask, Phantom, Coinbase Wallet, etc.)
// inject content scripts into every page and often raise unhandled
// promise rejections like:
//   "Could not establish connection. Receiving end does not exist."
//   "MetaMask extension not found"
//   "error getting provider injection options" (Phantom)
// Next.js 15 dev mode registers a global unhandledrejection listener
// that pops an error overlay for EVERY unhandled rejection on the page,
// including these extension-originated ones. The overlay is not
// actionable from our side (we didn't emit the error and can't fix the
// extension), so we intercept and mark those rejections handled.
//
// Scope is strictly limited: only rejections whose message or shape
// matches the known extension signatures are silenced. Anything else
// falls through to Next.js's default handling, so real application
// errors still surface the red overlay.
//
// Runs in dev AND prod. Cost: one addEventListener call, a few dozen
// bytes. No dependencies.

const EXTENSION_SIGNATURES = [
  "Could not establish connection",
  "Receiving end does not exist",
  "MetaMask extension not found",
  "Failed to connect to MetaMask",
  "error getting provider injection",
  "error updating cache",
];

function isExtensionNoise(reason: unknown): boolean {
  if (reason == null) return false;
  const message =
    typeof reason === "string"
      ? reason
      : typeof reason === "object" && "message" in reason && typeof reason.message === "string"
        ? reason.message
        : "";
  if (!message) return false;
  return EXTENSION_SIGNATURES.some((sig) => message.includes(sig));
}

export function ExtensionNoiseSilencer() {
  useEffect(() => {
    const handler = (event: PromiseRejectionEvent) => {
      if (isExtensionNoise(event.reason)) {
        event.preventDefault();
      }
    };
    window.addEventListener("unhandledrejection", handler);
    return () => window.removeEventListener("unhandledrejection", handler);
  }, []);
  return null;
}
