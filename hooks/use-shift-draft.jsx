'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

/**
 * useShiftDraft — auto-save / restore for the staff shift report form.
 *
 * Saves the entire `form` object to sessionStorage under the key
 * `fops_shift_draft_${siteId}_${date}` whenever the form changes. On mount,
 * if a draft exists for the current (siteId, date) pair, exposes it via
 * `availableDraft` so the consumer can show a "Restore?" banner.
 *
 * Why sessionStorage and not localStorage?
 *   - Drafts are tied to the current tab session. Once the user closes the
 *     tab, the draft is gone — by design. This avoids stale drafts
 *     polluting the next visit, and is the same UX as Gmail's compose-tab
 *     restore behaviour.
 *
 * @param {object} args
 * @param {string|null} args.siteId   — currently-selected site id
 * @param {string|null} args.date     — currently-selected date (yyyy-mm-dd)
 * @param {object}      args.form     — the live form state to persist
 * @returns {{
 *   availableDraft: {form: object, savedAt: number}|null,
 *   restoreDraft: () => object|null,
 *   dismissDraft: () => void,
 *   clearDraft:   () => void,
 * }}
 */
export function useShiftDraft({ siteId, date, form }) {
  const [availableDraft, setAvailableDraft] = useState(null);
  const lastKeyRef = useRef(null);
  const hasCheckedRef = useRef(false);

  const buildKey = useCallback(
    (sid, d) => (sid && d ? `fops_shift_draft_${sid}_${d}` : null),
    []
  );

  /* ---------------- Mount / context change: restore prompt ---------------- */
  useEffect(() => {
    const key = buildKey(siteId, date);
    if (!key) {
      setAvailableDraft(null);
      return;
    }
    // Different site/date than last render → clear the OLD draft (per spec)
    if (lastKeyRef.current && lastKeyRef.current !== key) {
      try { sessionStorage.removeItem(lastKeyRef.current); } catch {}
    }
    lastKeyRef.current = key;

    // Read the existing draft for this (site, date), if any
    try {
      const raw = sessionStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.form && parsed.savedAt) {
          setAvailableDraft(parsed);
          hasCheckedRef.current = true;
          return;
        }
      }
    } catch {}
    setAvailableDraft(null);
    hasCheckedRef.current = true;
  }, [siteId, date, buildKey]);

  /* ---------------- Persist on every form change ---------------- */
  // Debounced via the next event loop tick so we don't thrash storage on
  // every keystroke for a controlled input.
  useEffect(() => {
    const key = buildKey(siteId, date);
    if (!key || !hasCheckedRef.current) return;
    const id = setTimeout(() => {
      try {
        // Only persist if the form has any non-empty values — avoids
        // saving an empty shell on first mount.
        const hasContent = Object.values(form || {}).some(
          (v) => v !== '' && v !== null && v !== undefined
        );
        if (!hasContent) return;
        sessionStorage.setItem(
          key,
          JSON.stringify({ form, savedAt: Date.now() })
        );
      } catch {}
    }, 250);
    return () => clearTimeout(id);
  }, [form, siteId, date, buildKey]);

  /* ---------------- Public API ---------------- */
  const restoreDraft = useCallback(() => {
    if (!availableDraft) return null;
    setAvailableDraft(null);
    return availableDraft.form;
  }, [availableDraft]);

  const dismissDraft = useCallback(() => {
    const key = lastKeyRef.current;
    if (key) {
      try { sessionStorage.removeItem(key); } catch {}
    }
    setAvailableDraft(null);
  }, []);

  const clearDraft = useCallback(() => {
    const key = buildKey(siteId, date);
    if (key) {
      try { sessionStorage.removeItem(key); } catch {}
    }
    setAvailableDraft(null);
  }, [siteId, date, buildKey]);

  return { availableDraft, restoreDraft, dismissDraft, clearDraft };
}

export default useShiftDraft;
