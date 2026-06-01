"use client";

import { useSyncExternalStore } from "react";

// A small viewport / touch device: phones and small tablets in portrait. Either a narrow
// width OR a coarse pointer counts — a touch laptop is fine, but a phone in landscape (coarse
// pointer, wider than 640px) should still read as mobile. Tune here, in one place.
const MOBILE_QUERY = "(max-width: 640px), (pointer: coarse)";

function subscribe(onChange: () => void): () => void {
  if (typeof window === "undefined" || !window.matchMedia) return () => {};
  const mql = window.matchMedia(MOBILE_QUERY);
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
}

function getSnapshot(): boolean {
  return (
    typeof window !== "undefined" && !!window.matchMedia && window.matchMedia(MOBILE_QUERY).matches
  );
}

// Desktop-first: assume not-mobile during SSR. useSyncExternalStore re-reads the real value on
// the client right after hydration (without a setState-in-effect), so a phone corrects itself on
// the first paint with no hydration-mismatch warning.
function getServerSnapshot(): boolean {
  return false;
}

/**
 * Whether the app is running on a small / touch viewport. Reactive — re-renders on rotate/resize
 * via matchMedia. SSR-safe (returns false on the server, the real value after hydration).
 */
export function useIsMobile(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
