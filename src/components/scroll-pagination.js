"use client";

import { useEffect, useRef, useState } from "react";

const IDLE_HIDE_MS = 2000;

/**
 * Viewport-fixed shell that reveals its children while the user scrolls and
 * fades them out after a short idle period. Fixed positioning means the
 * controls never occupy layout space, so nothing shifts when they appear.
 * Hovering or focusing the controls pins them visible; a document too short
 * to scroll pins them permanently, since scrolling could never summon them.
 */
export function ScrollPagination({ children }) {
  const [visible, setVisible] = useState(false);
  const hideTimer = useRef(null);
  const hoverPin = useRef(false); // pointer/focus inside the pill
  const fitPin = useRef(false); // document fits the viewport — no scroll exists

  /** Restart the idle countdown; a pinned control re-arms instead of hiding. */
  function scheduleHide() {
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      if (hoverPin.current || fitPin.current) {
        scheduleHide();
        return;
      }
      setVisible(false);
    }, IDLE_HIDE_MS);
  }

  useEffect(() => {
    /** Short documents can't scroll — show permanently; re-check on any resize. */
    const assess = () => {
      const fits = document.documentElement.scrollHeight <= window.innerHeight + 1;
      const was = fitPin.current;
      fitPin.current = fits;
      if (fits) {
        clearTimeout(hideTimer.current);
        setVisible(true);
        return;
      }
      if (was) scheduleHide(); // page became scrollable again — resume idle fade
    };
    const onScroll = () => {
      setVisible(true);
      scheduleHide();
    };
    assess();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", assess);
    const ro = new ResizeObserver(assess); // content height changes on filter navigation
    ro.observe(document.body);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", assess);
      ro.disconnect();
      clearTimeout(hideTimer.current);
    };
    // assess/scheduleHide touch refs only — stable across renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Pointer or keyboard focus inside the pill keeps it on screen. */
  function pin() {
    hoverPin.current = true;
    setVisible(true);
  }

  /** Unpin and let the idle countdown resume. */
  function unpin() {
    hoverPin.current = false;
    scheduleHide();
  }

  return (
    <div
      aria-hidden={!visible}
      inert={!visible}
      onPointerEnter={pin}
      onPointerLeave={unpin}
      onFocusCapture={pin}
      onBlurCapture={unpin}
      className={`fixed bottom-5 left-1/2 z-40 -translate-x-1/2 transition-[opacity,translate] duration-200 ease-out ${
        visible ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-2 opacity-0"
      }`}
    >
      {children}
    </div>
  );
}
