// Maps the icon names used in scenes.js / weather.js to lucide components,
// so engine data stays plain strings.
import {
  AlertTriangle, Bird, Building2, Cloud, CloudDrizzle, CloudFog, CloudLightning, CloudMoon, CloudRain,
  CloudSnow, CloudSun, Flower2, Footprints, Moon, Mountain, PartyPopper, PawPrint, Sparkles, Sun, Sunset,
  Trophy, User, Waves,
} from 'lucide-react';

const ICONS = {
  AlertTriangle, Bird, Building2, Cloud, CloudDrizzle, CloudFog, CloudLightning, CloudMoon, CloudRain,
  CloudSnow, CloudSun, Flower2, Footprints, Moon, Mountain, PartyPopper, PawPrint, Sparkles, Sun, Sunset,
  Trophy, User, Waves,
};

export default function Icon({ name, ...props }) {
  const C = ICONS[name] ?? Cloud;
  return <C aria-hidden="true" {...props} />;
}
