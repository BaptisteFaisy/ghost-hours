import { useEffect } from 'react';
import { weekStartInZone } from '@ghost-hours/core';
import { useApp, useDispatch } from '../state/store.tsx';

/**
 * Fixtures of the DOM tests: they drive the real store with the real
 * fictitious month of `@ghost-hours/fixture-sample-month` (HEU-N-06), so the
 * screens are tested against the same numbers as the demo — 104 h found, 92 h
 * declared, 12 h of ghost hours worth 780 €.
 */

/** Load the fictitious month, as the "Load the sample month" button does. */
export function LoadSampleMonth(): null {
  const status = useApp().status;
  const dispatch = useDispatch();
  useEffect(() => {
    if (status === 'empty') dispatch({ type: 'loadSampleMonth' });
  }, [dispatch, status]);
  return null;
}

/**
 * Point the week screen at the week that holds the first conflict of the
 * month, so that the conflict and the blocks around it are on screen.
 */
export function JumpToFirstConflict(): null {
  const state = useApp();
  const dispatch = useDispatch();
  const first = [...state.conflicts].sort((a, b) => a.start - b.start)[0] ?? null;
  const timeZone = state.settings.timeZone;
  const activeWeekStart = state.activeWeekStart;
  useEffect(() => {
    if (first === null || activeWeekStart !== null) return;
    dispatch({ type: 'setActiveWeek', weekStart: weekStartInZone(first.start, timeZone) });
  }, [activeWeekStart, dispatch, first, timeZone]);
  return null;
}
