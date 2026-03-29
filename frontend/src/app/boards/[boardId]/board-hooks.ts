"use client";

import { type MutableRefObject, useEffect, useRef } from "react";

/* -------------------------------------------------------------------------- */
/*  useRefSync                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Keep a mutable ref in sync with a reactive value.
 *
 * This is a common pattern in SSE/callback-heavy code where event handlers
 * need access to the latest value without re-subscribing every render.
 *
 * Replaces the repetitive pattern:
 * ```ts
 * useEffect(() => { ref.current = value; }, [value]);
 * ```
 */
export function useRefSync<T>(value: T): MutableRefObject<T> {
  const ref = useRef(value);
  useEffect(() => {
    ref.current = value;
  }, [value]);
  return ref;
}
