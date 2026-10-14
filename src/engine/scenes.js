// Scene definitions. This is the file to edit when tuning recommendations.
//
// Field reference (see README for the full explanation):
//   setting     'outdoor' | 'indoor' | 'city' — tells the light model which light source dominates
//   evOffset    stops added to the ambient EV (e.g. shooting into a bright sky)
//   aperture    { target, min, max } — min is the widest acceptable f-number, max the narrowest
//   dofEquivalent  if true, the aperture target is divided by crop factor so depth of field
//                  matches full frame (landscape/macro), then clamped to [min, max]
//   shutter     { target, slowest, fastest } in seconds. slowest: 'handheld' = reciprocal rule
//   iso         { start, max } — start ISO and a scene cap (the user's max ISO also applies)
//   tripod      'never' | 'optional' | 'prefer' | 'required'
//   handheldFactor  multiplies the reciprocal-rule speed (2 = needs twice as fast, e.g. macro)
//   brighten / darken  ordered adjustment steps the solver walks through when the scene is
//                  darker / brighter than the target settings allow. A step is
//                  { p: 'aperture'|'shutter'|'iso', to?: limit }
//   flash       suggest flash when the scene can't be exposed
//   lens        { ffFocal: [min,max], ideal, maxAperture, type, tags } — full-frame equivalents
//   why         beginner explanations for each value

const H = 'handheld';

export const SCENES = {
  wildlife: {
    label: 'Wildlife',
    icon: 'PawPrint',
    setting: 'outdoor',
    aperture: { target: 5.6, min: 4, max: 8 },
    shutter: { target: 1 / 1000, slowest: 1 / 500, fastest: 1 / 4000 },
    iso: { start: 100 },
    tripod: 'optional',
    brighten: [{ p: 'aperture' }, { p: 'iso' }, { p: 'shutter' }],
    darken: [{ p: 'shutter' }, { p: 'aperture' }],
    lens: { ffFocal: [100, 600], ideal: 400, maxAperture: 5.6, type: 'Telephoto zoom', tags: ['telephoto', 'super-telephoto'] },
    focus: 'AF-C with animal-eye detection',
    drive: 'High-speed continuous',
    metering: 'Matrix / evaluative',
    why: {
      aperture: 'Wide enough to let in light, with a little depth so the whole animal is sharp.',
      shutter: 'Fast enough to freeze an animal that moves suddenly.',
      iso: 'Raised before the shutter is slowed — a little grain beats a blurry animal.',
    },
    tips: ['Dark fur in shade: +0.3 to +0.7 EV.', 'White animals or snow: +0.7 to +1 EV so white stays white.'],
  },

  birds: {
    label: 'Birds in flight',
    icon: 'Bird',
    setting: 'outdoor',
    aperture: { target: 6.3, min: 4, max: 8 },
    shutter: { target: 1 / 2500, slowest: 1 / 1600, fastest: 1 / 4000 },
    iso: { start: 100 },
    tripod: 'never',
    brighten: [{ p: 'aperture' }, { p: 'iso' }, { p: 'shutter' }],
    darken: [{ p: 'shutter' }, { p: 'aperture' }],
    lens: { ffFocal: [300, 800], ideal: 600, maxAperture: 6.3, type: 'Super-telephoto zoom', tags: ['super-telephoto'] },
    focus: 'AF-C, wide-area tracking with bird detection',
    drive: 'High-speed continuous',
    metering: 'Matrix, or spot on the bird',
    why: {
      aperture: 'Your lens is probably wide open here — long lenses need all the light they can get.',
      shutter: 'Very fast, to freeze wing beats.',
      iso: 'Whatever it takes to keep that fast shutter.',
    },
    tips: ['Against bright sky: +0.7 to +1 EV or the bird turns into a silhouette.'],
  },

  landscape: {
    label: 'Landscape',
    icon: 'Mountain',
    setting: 'outdoor',
    aperture: { target: 11, min: 8, max: 11 },
    dofEquivalent: true,
    shutter: { target: 1 / 125, slowest: H, fastest: 1 / 8000 },
    iso: { start: 100 },
    tripod: 'prefer',
    brighten: [{ p: 'shutter' }, { p: 'iso' }, { p: 'aperture' }],
    darken: [{ p: 'shutter' }, { p: 'aperture', to: 16 }],
    lens: { ffFocal: [14, 35], ideal: 20, maxAperture: 4, type: 'Wide-angle zoom', tags: ['ultra-wide', 'wide'] },
    focus: 'AF-S, focus about a third into the scene',
    drive: 'Single shot, or 2s timer on a tripod',
    metering: 'Matrix / evaluative',
    why: {
      aperture: 'The sweet spot: front-to-back sharpness without diffraction softening.',
      shutter: 'Whatever the light needs — the landscape isn\'t going anywhere.',
      iso: 'Lowest ISO for the cleanest, most detailed file.',
    },
    tips: ['Snow: +1 EV.', 'Bright sky over a dark foreground: bracket ±2 EV or use a graduated ND.'],
  },

  portrait: {
    label: 'Portrait',
    icon: 'User',
    setting: 'outdoor',
    aperture: { target: 1.8, min: 1.4, max: 2.8 },
    shutter: { target: 1 / 250, slowest: 1 / 125, fastest: 1 / 8000 },
    iso: { start: 100 },
    tripod: 'never',
    flash: true,
    brighten: [{ p: 'shutter' }, { p: 'iso' }],
    darken: [{ p: 'shutter' }, { p: 'aperture' }],
    lens: { ffFocal: [50, 135], ideal: 85, maxAperture: 1.8, type: 'Fast prime', tags: ['portrait', 'prime'] },
    focus: 'AF-S or AF-C with eye detection',
    drive: 'Single shot (low continuous for kids)',
    metering: 'Spot / center-weighted on the face',
    why: {
      aperture: 'Wide open for a soft, blurred background that makes your subject pop.',
      shutter: 'Fast enough that small movements don\'t blur the eyes.',
      iso: 'Low for smooth skin tones.',
    },
    tips: ['Backlit subject: +0.7 to +1 EV, or add fill flash.'],
  },

  street: {
    label: 'Street',
    icon: 'Footprints',
    setting: 'city',
    aperture: { target: 8, min: 2.8, max: 11 },
    shutter: { target: 1 / 250, slowest: 1 / 125, fastest: 1 / 4000 },
    iso: { start: 100 },
    tripod: 'never',
    brighten: [{ p: 'iso', to: 3200 }, { p: 'aperture' }, { p: 'shutter' }, { p: 'iso' }],
    darken: [{ p: 'shutter' }, { p: 'aperture' }],
    lens: { ffFocal: [28, 50], ideal: 35, maxAperture: 2, type: 'Compact prime', tags: ['street', 'prime'] },
    focus: 'Zone focus (manual, ~3 m) or AF-C',
    drive: 'Continuous low',
    metering: 'Matrix / evaluative',
    why: {
      aperture: 'Deep focus so you can shoot fast without checking focus.',
      shutter: 'Freezes people walking past.',
      iso: 'Auto-ISO style: raised so aperture and shutter can stay where they\'re useful.',
    },
    tips: ['Harsh midday contrast: −0.3 EV to protect highlights.'],
  },

  sports: {
    label: 'Sports / action',
    icon: 'Trophy',
    setting: 'outdoor',
    aperture: { target: 2.8, min: 2.8, max: 5.6 },
    shutter: { target: 1 / 1000, slowest: 1 / 500, fastest: 1 / 4000 },
    iso: { start: 100 },
    tripod: 'never',
    brighten: [{ p: 'aperture' }, { p: 'iso' }, { p: 'shutter' }],
    darken: [{ p: 'shutter' }, { p: 'aperture' }],
    lens: { ffFocal: [70, 200], ideal: 200, maxAperture: 2.8, type: 'Fast telephoto zoom', tags: ['telephoto'] },
    focus: 'AF-C, zone or tracking',
    drive: 'High-speed continuous',
    metering: 'Matrix / evaluative',
    why: {
      aperture: 'Wide to gather light and separate players from the crowd.',
      shutter: 'Freezes fast action — balls, feet, splashes.',
      iso: 'Raised before the shutter is slowed.',
    },
    tips: ['Indoor arenas: pick "Bright indoors" lighting, expect ISO 3200+.'],
  },

  macro: {
    label: 'Macro',
    icon: 'Flower2',
    setting: 'outdoor',
    aperture: { target: 11, min: 8, max: 16 },
    dofEquivalent: true,
    shutter: { target: 1 / 200, slowest: H, fastest: 1 / 4000 },
    iso: { start: 100 },
    tripod: 'optional',
    handheldFactor: 2, // magnification multiplies shake
    flash: true,
    brighten: [{ p: 'shutter' }, { p: 'iso' }, { p: 'aperture' }],
    darken: [{ p: 'shutter' }, { p: 'aperture' }],
    lens: { ffFocal: [90, 105], ideal: 100, maxAperture: 2.8, type: 'True 1:1 macro', tags: ['macro'] },
    focus: 'Manual focus — rock gently in and out',
    drive: 'Continuous low (shoot bursts, keep the sharpest)',
    metering: 'Spot / center-weighted',
    why: {
      aperture: 'Depth of field is paper-thin up close; stopping down keeps more of the subject sharp.',
      shutter: 'Close-up magnifies shake, so this is twice as fast as normal handheld.',
      iso: 'As low as the light allows.',
    },
    tips: ['Use a diffused flash or reflector — it freezes motion and lets you stay at f/11+.', 'Turn on stabilization; use a tripod for still subjects.'],
  },

  astro: {
    label: 'Astro',
    icon: 'Sparkles',
    setting: 'outdoor',
    aperture: { target: 1.4, min: 1.4, max: 4 }, // target = widest; clamped by the lens
    shutter: { target: 'rule500', slowest: 'rule500', fastest: 1 / 4000 },
    iso: { start: 1600, min: 1600, max: 6400 }, // a bright moon shortens the shutter instead
    tripod: 'required',
    kelvin: 3900,
    brighten: [{ p: 'iso' }],
    // Too bright (moonlight)? Drop ISO, then stop a fast lens down to f/2.8 (sharper corners), then shorten.
    darken: [{ p: 'iso' }, { p: 'aperture', to: 2.8 }, { p: 'shutter' }],
    lens: { ffFocal: [14, 24], ideal: 14, maxAperture: 2.8, type: 'Fast ultra-wide', tags: ['ultra-wide', 'astro'] },
    focus: 'Manual focus on a bright star (live view, max zoom)',
    drive: '2s or 10s timer; turn stabilization off on a tripod',
    metering: 'Ignore it — trust these settings and check the histogram',
    why: {
      aperture: 'Wide open: stars are faint, every bit of light counts.',
      shutter: 'The 500 rule: the longest exposure before stars start to trail.',
      iso: 'High ISO to pull out faint stars; noise can be cleaned up later.',
    },
    tips: ['Turn on red night mode to keep your night vision.', 'Shoot RAW. Stack several frames for less noise.'],
  },

  nightCity: {
    label: 'Night city',
    icon: 'Building2',
    setting: 'city',
    aperture: { target: 8, min: 1.8, max: 11 },
    shutter: { target: 1 / 60, slowest: H, fastest: 1 / 4000 },
    iso: { start: 100 },
    tripod: 'prefer',
    brighten: [{ p: 'shutter' }, { p: 'iso' }, { p: 'aperture' }],
    darken: [{ p: 'shutter' }, { p: 'aperture' }],
    lens: { ffFocal: [16, 50], ideal: 24, maxAperture: 2.8, type: 'Wide zoom or fast prime', tags: ['wide', 'ultra-wide'] },
    kelvin: 3800,
    focus: 'AF-S on a bright edge',
    drive: '2s timer on a tripod',
    metering: 'Matrix, then −0.7 EV to keep lights from blowing out',
    why: {
      aperture: 'f/8 turns street lights into star bursts and keeps buildings sharp.',
      shutter: 'Long, on a tripod — moving cars become light trails.',
      iso: 'Low ISO for clean shadows.',
    },
    tips: ['−0.7 EV so bright signs don\'t blow out.'],
  },

  indoor: {
    label: 'Indoor / event',
    icon: 'PartyPopper',
    setting: 'indoor',
    aperture: { target: 2.8, min: 1.4, max: 4 },
    shutter: { target: 1 / 125, slowest: H, fastest: 1 / 4000 },
    iso: { start: 100 },
    tripod: 'never',
    flash: true,
    brighten: [{ p: 'aperture' }, { p: 'iso' }, { p: 'shutter' }],
    darken: [{ p: 'shutter' }, { p: 'aperture' }],
    lens: { ffFocal: [24, 70], ideal: 35, maxAperture: 2.8, type: 'Fast standard zoom or prime', tags: ['standard', 'prime'] },
    focus: 'AF-C with face detection',
    drive: 'Continuous low',
    metering: 'Matrix / evaluative',
    why: {
      aperture: 'Wide open — indoor light is several stops dimmer than it looks.',
      shutter: 'Fast enough to freeze people talking and gesturing.',
      iso: 'High ISO is normal indoors.',
    },
    tips: ['Bounce a flash off the ceiling for soft, even light.', 'Set WB manually; mixed lighting confuses auto WB.'],
  },

  waterfall: {
    label: 'Waterfall / long exposure',
    icon: 'Waves',
    setting: 'outdoor',
    aperture: { target: 11, min: 8, max: 16 },
    shutter: { target: 1, slowest: 2, fastest: 0.5 },
    iso: { start: 100 },
    tripod: 'required',
    brighten: [{ p: 'shutter' }, { p: 'aperture' }, { p: 'iso' }],
    darken: [{ p: 'aperture' }, { p: 'shutter' }],
    lens: { ffFocal: [16, 70], ideal: 24, maxAperture: 4, type: 'Wide / standard zoom', tags: ['wide', 'standard'] },
    focus: 'AF-S, then switch to manual to lock it',
    drive: '2s timer; stabilization off on a tripod',
    metering: 'Matrix / evaluative',
    why: {
      aperture: 'Stopped down to cut light and keep the scene sharp.',
      shutter: 'Half a second to two seconds turns rushing water silky.',
      iso: 'Lowest ISO — you want less light, not more.',
    },
    tips: ['Too bright for a slow shutter? An ND filter is the answer — see the ND suggestion.'],
  },

  sunset: {
    label: 'Sunset / golden hour',
    icon: 'Sunset',
    setting: 'outdoor',
    evOffset: 1, // shooting toward the sun: the sky is brighter than the ambient light on the land
    aperture: { target: 8, min: 5.6, max: 11 },
    shutter: { target: 1 / 250, slowest: H, fastest: 1 / 8000 },
    iso: { start: 100 },
    tripod: 'optional',
    kelvin: 6000,
    brighten: [{ p: 'shutter' }, { p: 'iso' }, { p: 'aperture' }],
    darken: [{ p: 'shutter' }, { p: 'aperture' }],
    lens: { ffFocal: [16, 200], ideal: 35, maxAperture: 4, type: 'Wide zoom (or tele for a big sun)', tags: ['wide', 'standard', 'telephoto'] },
    focus: 'AF-S on the horizon',
    drive: 'Single shot; bracket ±1 EV',
    metering: 'Matrix, metered off the sky beside the sun',
    why: {
      aperture: 'Sharp front to back, with a sun-star if the sun is in frame.',
      shutter: 'Exposed for the sky so the colours don\'t wash out.',
      iso: 'Low ISO keeps the gradients in the sky smooth.',
    },
    tips: ['Backlit by the sun: −1 EV for rich colour.', 'WB set to "Cloudy" (≈6000 K) warms the scene.'],
  },
};

export const SCENE_KEYS = Object.keys(SCENES);
