import Link from "next/link";

export function Nav({ active }: { active?: "home" | "docs" | "bench" | "directory" }) {
  const a = (k: typeof active) => (k === active ? "active" : "");
  return (
    <nav className="nav" aria-label="Primary">
      <div className="nav-inner">
        <Link href="/" className="nav-brand">
          PORTAL
        </Link>
        <span className="nav-status" aria-label="Live">LIVE</span>
        <div className="nav-links">
          <Link href="/docs" className={a("docs")}>
            docs
          </Link>
          <Link href="/bench" className={a("bench")}>
            bench
          </Link>
          <Link href="/directory" className={a("directory")}>
            directory
          </Link>
          <a
            href="https://github.com/0motionguy/portal"
            className="ext"
            target="_blank"
            rel="noreferrer"
          >
            github
          </a>
        </div>
      </div>
    </nav>
  );
}

export function Foot() {
  return (
    <footer className="foot">
      <div className="left">
        <span>
          <strong style={{ color: "var(--ink)" }}>portal</strong> · v0.1.1
        </span>
        <span>·</span>
        <span>built with Opus 4.7</span>
        <span>·</span>
        <Link href="/docs">docs</Link>
        <Link href="/bench">bench</Link>
        <Link href="/directory">directory</Link>
      </div>
      <div className="right">
        <span>Apache 2.0 / CC0</span>
        <span>·</span>
        <span>spec · public domain</span>
      </div>
    </footer>
  );
}
