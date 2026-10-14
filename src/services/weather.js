// Open-Meteo: free, no API key. Current conditions + city search.

const FORECAST = 'https://api.open-meteo.com/v1/forecast';
const GEOCODE = 'https://geocoding-api.open-meteo.com/v1/search';

/** Fetch current conditions, normalised to the shape the light model expects. */
export async function fetchWeather(lat, lon, signal) {
  const params = new URLSearchParams({
    latitude: lat.toFixed(3),
    longitude: lon.toFixed(3),
    current: 'cloud_cover,visibility,precipitation,uv_index,weather_code,is_day,temperature_2m',
    timezone: 'auto',
  });
  const res = await fetch(`${FORECAST}?${params}`, { signal });
  if (!res.ok) throw new Error(`Weather request failed (${res.status})`);
  const j = await res.json();
  const c = j.current;
  return {
    cloudCover: c.cloud_cover,
    visibility: c.visibility,
    precipitation: c.precipitation,
    uvIndex: c.uv_index,
    weatherCode: c.weather_code,
    isDay: !!c.is_day,
    temperature: c.temperature_2m,
    fetchedAt: Date.now(),
  };
}

/** City search. Returns [{ name, detail, lat, lon }]. */
export async function searchPlaces(query, signal) {
  const params = new URLSearchParams({ name: query, count: '6', language: 'en', format: 'json' });
  const res = await fetch(`${GEOCODE}?${params}`, { signal });
  if (!res.ok) throw new Error('Place search failed');
  const j = await res.json();
  return (j.results ?? []).map((r) => ({
    name: r.name,
    detail: [r.admin1, r.country].filter(Boolean).join(', '),
    lat: r.latitude,
    lon: r.longitude,
  }));
}

/** WMO weather code → short label + lucide icon name (day/night variants). */
export function describeWeather(code, isDay = true) {
  if (code === 0) return { label: 'Clear', icon: isDay ? 'Sun' : 'Moon' };
  if (code <= 2) return { label: code === 1 ? 'Mostly clear' : 'Partly cloudy', icon: isDay ? 'CloudSun' : 'CloudMoon' };
  if (code === 3) return { label: 'Overcast', icon: 'Cloud' };
  if (code === 45 || code === 48) return { label: 'Fog', icon: 'CloudFog' };
  if (code >= 51 && code <= 57) return { label: 'Drizzle', icon: 'CloudDrizzle' };
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return { label: 'Rain', icon: 'CloudRain' };
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return { label: 'Snow', icon: 'CloudSnow' };
  if (code >= 95) return { label: 'Thunderstorm', icon: 'CloudLightning' };
  return { label: 'Unknown', icon: 'Cloud' };
}

export function fmtCoords(lat, lon) {
  return `${Math.abs(lat).toFixed(2)}°${lat >= 0 ? 'N' : 'S'}, ${Math.abs(lon).toFixed(2)}°${lon >= 0 ? 'E' : 'W'}`;
}
