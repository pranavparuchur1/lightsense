import { useEffect, useState } from 'react';

// useState that persists to localStorage. Storage can be unavailable (private mode,
// blocked site data), so every access is wrapped and the app works without it.
export function useStoredState(key, initial) {
  const [value, setValue] = useState(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw == null) return initial;
      const parsed = JSON.parse(raw);
      // Merge plain objects so new fields added in later versions get their defaults.
      return isPlainObject(initial) && isPlainObject(parsed) ? { ...initial, ...parsed } : parsed;
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* storage unavailable — keep working in memory */
    }
  }, [key, value]);
  return [value, setValue];
}

const isPlainObject = (v) => v != null && typeof v === 'object' && !Array.isArray(v);
