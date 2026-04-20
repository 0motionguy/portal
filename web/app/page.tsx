import HeroActionsSlot from "@/components/HeroActionsSlot";
import LiveVisit from "@/components/LiveVisit";
import { SlotMount } from "@/components/SlotMount";
import { SLOT_IDS, loadOnePager } from "@/lib/one-pager";

// The index page inlines the one-pager's <style> + <body> byte-for-byte
// so the terminal-aesthetic design ships unchanged. Interactive widgets
// mount into empty anchor <div id="...">s inside the body via client-side
// React portals — see src/components/SlotMount.tsx for the rationale.
// Nav is intentionally NOT rendered here; the one-pager has its own
// status bar with inline nav links.

export default function Home() {
  const { styles, body } = loadOnePager();

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: styles }} />
      <div dangerouslySetInnerHTML={{ __html: body }} />
      <SlotMount anchorId={SLOT_IDS.heroActions}>
        <HeroActionsSlot />
      </SlotMount>
      <SlotMount anchorId={SLOT_IDS.liveVisit}>
        <LiveVisit />
      </SlotMount>
    </>
  );
}
