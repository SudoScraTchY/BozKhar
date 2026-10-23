/**
 * SPA route tracking fallback (D-46).
 *
 * The content script also patches history.pushState/replaceState, which is
 * the immediate signal in Chrome. Firefox's Xray wrappers can keep that
 * patch invisible to the page's own calls, so a pathname poll is the
 * portable signal. It coalesces any number of changes between ticks.
 */
export interface PathLocation {
  pathname: string;
}

export function startPathPolling(
  onChange: () => void,
  location: PathLocation,
  intervalMs = 500,
): () => void {
  let lastPath = location.pathname;
  const timer = setInterval(() => {
    if (location.pathname === lastPath) return;
    lastPath = location.pathname;
    onChange();
  }, intervalMs);
  return () => clearInterval(timer);
}
