// Phone-camera light meter.
//
// Honest caveat: phone cameras run their own auto-exposure, which normalises frame brightness.
// So we use two methods:
//   'exposure'  — Chrome on Android exposes the camera's live exposure time and ISO via
//                 track.getSettings(). Then EV100 = log2(N²/t) − log2(ISO/100) + log2(Ȳ/0.18),
//                 a real reflected-light reading (N assumed f/1.8, the typical main camera).
//   'luminance' — everywhere else we only have pixel brightness. EV ≈ 10 + log2(Ȳ/0.18), which is
//                 little more than a guess until the user calibrates it against a real camera.

const PHONE_APERTURE = 1.8;

export function cameraSupported() {
  return !!navigator.mediaDevices?.getUserMedia;
}

/** Start the rear camera into a <video> element. Returns the MediaStream. */
export async function startCamera(video) {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: { ideal: 'environment' }, width: { ideal: 640 }, height: { ideal: 480 } },
    audio: false,
  });
  video.srcObject = stream;
  video.muted = true;
  video.playsInline = true;
  await video.play();
  return stream;
}

export function stopCamera(stream) {
  stream?.getTracks().forEach((t) => t.stop());
}

// sRGB (0..255) → linear light, lookup table.
const LIN = Array.from({ length: 256 }, (_, i) => {
  const c = i / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
});

/** Mean linear luminance (0..1) of the current video frame, sampled at low resolution. */
export function frameLuminance(video, canvas) {
  const w = 64;
  const h = 48;
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(video, 0, 0, w, h);
  const { data } = ctx.getImageData(0, 0, w, h);
  let sum = 0;
  for (let i = 0; i < data.length; i += 4) {
    sum += 0.2126 * LIN[data[i]] + 0.7152 * LIN[data[i + 1]] + 0.0722 * LIN[data[i + 2]];
  }
  return sum / (w * h);
}

/** Convert a mean luminance (+ camera exposure settings if exposed) to an EV100 estimate. */
export function luminanceToEv(meanY, track) {
  const y = Math.max(meanY, 1e-4);
  const s = track?.getSettings?.() ?? {};
  // exposureTime is specified in units of 100 µs (Media Capture Image spec).
  if (s.exposureTime > 0 && s.iso > 0) {
    const t = s.exposureTime * 1e-4;
    const ev = Math.log2((PHONE_APERTURE * PHONE_APERTURE) / t) - Math.log2(s.iso / 100) + Math.log2(y / 0.18);
    return { ev, method: 'exposure', detail: { t, iso: s.iso } };
  }
  return { ev: 10 + Math.log2(y / 0.18), method: 'luminance', detail: {} };
}

/**
 * Sample `frames` frames over ~1.5 s (after letting auto-exposure settle) and average them.
 * @returns {Promise<{ ev, method, meanY }>}
 */
export async function measure(video, canvas, stream, { frames = 10, settleMs = 700, onProgress } = {}) {
  await new Promise((r) => setTimeout(r, settleMs));
  const ys = [];
  for (let i = 0; i < frames; i++) {
    ys.push(frameLuminance(video, canvas));
    onProgress?.((i + 1) / frames);
    await new Promise((r) => setTimeout(r, 150));
  }
  // Median is robust against a frame caught mid-AE adjustment.
  const meanY = ys.sort((a, b) => a - b)[Math.floor(ys.length / 2)];
  const { ev, method } = luminanceToEv(meanY, stream.getVideoTracks()[0]);
  return { ev, method, meanY };
}
