// Posicion solar real (aproximacion NOAA/Meeus, error < 0,5 grados). Logica pura.
export type Sun = { altitude: number; azimuth: number }; // radianes; azimut desde el norte, hacia el este
const rad = Math.PI / 180;
export function solarPosition(date: Date, lat: number, lng: number): Sun {
  const jd = date.getTime() / 86400000 + 2440587.5; const n = jd - 2451545.0;
  const L = (280.46 + 0.9856474 * n) % 360, g = ((357.528 + 0.9856003 * n) % 360) * rad;
  const lam = (L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * rad; const eps = (23.439 - 0.0000004 * n) * rad;
  const ra = Math.atan2(Math.cos(eps) * Math.sin(lam), Math.cos(lam)); const dec = Math.asin(Math.sin(eps) * Math.sin(lam));
  const gmst = (18.697374558 + 24.06570982441908 * n) % 24; const lst = ((gmst * 15 + lng) % 360) * rad; const H = lst - ra;
  const la = lat * rad; const alt = Math.asin(Math.sin(la) * Math.sin(dec) + Math.cos(la) * Math.cos(dec) * Math.cos(H));
  const az = Math.atan2(-Math.sin(H) * Math.cos(dec), Math.sin(dec) * Math.cos(la) - Math.cos(dec) * Math.sin(la) * Math.cos(H));
  return { altitude: alt, azimuth: (az + 2 * Math.PI) % (2 * Math.PI) };
}
/** Direccion hacia el sol en coordenadas del mundo (+x este, -z norte). */
export function sunDir(s: Sun): [number, number, number] { const c = Math.cos(s.altitude); return [Math.sin(s.azimuth) * c, Math.sin(s.altitude), -Math.cos(s.azimuth) * c]; }
/** 0 = noche cerrada, 1 = pleno dia (transicion suave en el crepusculo). */
export const daylight = (alt: number) => Math.max(0, Math.min(1, (Math.sin(alt) + 0.1) / 0.4));
/** 0..1: cuanto de "hora dorada/atardecer" hay (sol bajo). */
export const lowSun = (alt: number) => 1 - Math.max(0, Math.min(1, Math.sin(alt) * 2.5));
