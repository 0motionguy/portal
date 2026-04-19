import { loadOnePager } from "@/lib/one-pager";

// The index page: inline the one-pager's own <style> + <body> so the
// terminal-aesthetic design ships byte-for-byte. Nav is intentionally NOT
// rendered here — the one-pager is a single long-scroll document with its
// own status bar.

export default function Home() {
  const { styles, body } = loadOnePager();
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: styles }} />
      <div dangerouslySetInnerHTML={{ __html: body }} />
    </>
  );
}
