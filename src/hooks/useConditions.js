import { useEffect, useState } from 'react';
import { fetchWeather } from '../services/weather.js';
import { getSunInfo } from '../services/sun.js';
import { useStoredState } from './useStoredState.js';

const WEATHER_TTL = 15 * 60e3;

/**
 * Live conditions for a location: sun/moon (recomputed every 30 s) and weather
 * (Open-Meteo, refreshed every 15 min). The last good weather is kept in localStorage,
 * so the app still has conditions when it opens offline.
 */
export function useConditions(location) {
  const [now, setNow] = useState(() => new Date());
  const [cache, setCache] = useStoredState('ls.weather', null); // { key, data }
  const [status, setStatus] = useState('idle'); // idle | loading | ok | offline | error
  const key = location ? `${location.lat.toFixed(2)},${location.lon.toFixed(2)}` : null;

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30e3);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!location) return;
    const ctrl = new AbortController();
    const load = async () => {
      setStatus('loading');
      try {
        const data = await fetchWeather(location.lat, location.lon, ctrl.signal);
        setCache({ key, data });
        setStatus('ok');
      } catch (e) {
        if (e.name === 'AbortError') return;
        setStatus(navigator.onLine === false ? 'offline' : 'error');
      }
    };
    const fresh = cache?.key === key && Date.now() - cache.data.fetchedAt < WEATHER_TTL;
    if (fresh) setStatus('ok');
    else load();
    const id = setInterval(load, WEATHER_TTL);
    return () => {
      ctrl.abort();
      clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const sun = location ? getSunInfo(now, location.lat, location.lon) : null;
  // Only use cached weather if it belongs to this location.
  const weather = cache?.key === key ? cache.data : null;
  return { now, sun, weather, status };
}
