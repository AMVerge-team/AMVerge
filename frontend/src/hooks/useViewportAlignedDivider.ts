import { useCallback, useRef } from "react";

/** both splitters span this band of the window, so they match whatever sits above each one */
const TOP_FRACTION = 0.3;
const HEIGHT_FRACTION = 0.4;

/** puts every side-by-side splitter at the same window height, though their containers start at different heights */
export function useViewportAlignedDivider() {
  const cleanupRef = useRef<(() => void) | null>(null);

  return useCallback((el: HTMLDivElement | null) => {
    cleanupRef.current?.();
    cleanupRef.current = null;
    const container = el?.parentElement;
    if (!el || !container) return;

    const place = () => {
      const containerTop = container.getBoundingClientRect().top;
      el.style.marginTop = `${window.innerHeight * TOP_FRACTION - containerTop}px`;
      el.style.height = `${window.innerHeight * HEIGHT_FRACTION}px`;
    };
    place();

    const observer = new ResizeObserver(place);
    observer.observe(container);
    window.addEventListener("resize", place);
    cleanupRef.current = () => {
      observer.disconnect();
      window.removeEventListener("resize", place);
    };
  }, []);
}
