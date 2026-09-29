/**
 * Service worker placeholder (T02).
 *
 * Per SDD 06-architecture.md this worker will own the crawl state machine
 * from T03 onward. T02 only proves the MV3 wiring loads; it performs no
 * network I/O and no DOM access (D-02, D-03).
 */

chrome.runtime.onInstalled.addListener(() => {
  // Intentionally minimal: no storage writes, no alarms, no fetches.
});
