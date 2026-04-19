"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

// Injected at the <!-- HERO_ACTIONS_SLOT --> marker in the hero of the
// one-pager (right after the terminal block). Three elements in the
// primary row — install pill with copy button, GitHub link — plus a
// secondary row of coral text links. Styling lives in web/src/styles.css
// under .hero-actions__* (BEM).

const INSTALL_CMD = "curl -fsSL visitportal.dev/install | sh";
const GITHUB_URL = "https://github.com/visitportal/portal";

export default function HeroActionsSlot() {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    },
    [],
  );

  const onCopy = useCallback(async () => {
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(INSTALL_CMD);
      } else {
        const ta = document.createElement("textarea");
        ta.value = INSTALL_CMD;
        ta.setAttribute("readonly", "");
        ta.style.position = "absolute";
        ta.style.left = "-9999px";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      setCopied(true);
      if (timerRef.current !== null) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard denied — user can manually select. Don't crash.
    }
  }, []);

  return (
    <div className="hero-actions">
      <div className="hero-actions__row">
        <div className="hero-actions__install" role="group" aria-label="Install command">
          <span className="sig" aria-hidden="true">
            $
          </span>
          <span className="cmd">
            curl <span className="arg">-fsSL</span>{" "}
            <span className="url">visitportal.dev/install</span> | sh
          </span>
          <button
            type="button"
            className="hero-actions__copy"
            data-copied={copied ? "true" : "false"}
            aria-live="polite"
            aria-label={copied ? "Install command copied" : "Copy install command"}
            onClick={onCopy}
          >
            {copied ? "copied" : "copy"}
          </button>
        </div>
        <a
          className="hero-actions__github"
          href={GITHUB_URL}
          target="_blank"
          rel="noreferrer noopener"
          aria-label="Portal repository on GitHub"
        >
          <GitHubMark />
          <span>github ↗</span>
        </a>
      </div>
      <div className="hero-actions__secondary" aria-label="Secondary links">
        <Link href="/docs">read the spec →</Link>
        <Link href="/bench">see the bench →</Link>
        <Link href="/directory">browse directory →</Link>
      </div>
    </div>
  );
}

function GitHubMark() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.31.468-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.52 11.52 0 0112 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222 0 1.606-.014 2.898-.014 3.293 0 .322.216.694.825.576C20.565 22.092 24 17.596 24 12.297c0-6.627-5.373-12-12-12" />
    </svg>
  );
}
