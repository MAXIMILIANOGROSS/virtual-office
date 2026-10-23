import { PROYECTO, horaLocalTexto } from "../../oficina.config.ts";
import { daylight, lowSun, solarPosition, sunDir } from "../sun.ts";
/** Ambiente de la oficina según el sol REAL del lugar configurado en oficina.config.ts (si no hay coordenadas, usa Madrid). Lógica pura. */
export const LAT = PROYECTO.latitud ?? 40.4168, LNG = PROYECTO.longitud ?? -3.7038;
export type Fase = "noche" | "amanecer" | "día" | "atardecer";
export type Ambiente = { sl: number; low: number; dir: [number, number, number]; fase: Fase; hora: string; cielo: [string, string, string]; niebla: string; ambI: number; hemiI: number; solI: number; lunaI: number; estrellas: number; exposicion: number };
const mix = (a: string, b: string, t: number) => { const p = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)); const A = p(a), B = p(b); return "#" + A.map((v, i) => Math.round(v + (B[i] - v) * Math.max(0, Math.min(1, t))).toString(16).padStart(2, "0")).join(""); };
export function horaZona(d: Date): string { return horaLocalTexto(d); } // nombre histórico: usa la zona horaria de oficina.config.ts
export function ambienteEn(d: Date): Ambiente {
  const s = solarPosition(d, LAT, LNG); const sl = daylight(s.altitude), low = lowSun(s.altitude) * sl;
  const subiendo = Number(new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hour12: false, timeZone: PROYECTO.zonaHoraria || "UTC" }).format(d)) < 13;
  const fase: Fase = sl < 0.08 ? "noche" : sl < 0.85 ? (subiendo ? "amanecer" : "atardecer") : "día";
  const nocheC: [string, string, string] = ["#030814", "#0A1B3D", "#16345F"], diaC: [string, string, string] = ["#2F7FD0", "#7DBFEA", "#CFE9F7"], doradoC: [string, string, string] = ["#2B3F7A", "#F08A5D", "#FFD6A0"];
  const base = nocheC.map((c, i) => mix(c, diaC[i], sl)) as [string, string, string];
  const cielo = base.map((c, i) => mix(c, doradoC[i], low * 0.85)) as [string, string, string];
  return { sl, low, dir: sunDir(s), fase, hora: horaZona(d), cielo, niebla: mix(mix("#0A1B3D", "#BFDDF0", sl), "#F1B58A", low * 0.6), ambI: 0.25 + 0.55 * sl, hemiI: 0.2 + 0.4 * sl, solI: (0.02 + 1.3 * sl) * (1 - 0.3 * low), lunaI: (1 - sl) * 0.5, estrellas: Math.max(0, 1 - sl * 2.2), exposicion: 0.9 };
}
export function descTiempo(c: number): string { return c === 0 ? "Despejado" : c <= 2 ? "Poco nublado" : c === 3 ? "Nublado" : c <= 48 ? "Niebla" : c <= 57 ? "Llovizna" : c <= 67 ? "Lluvia" : c <= 82 ? "Chubascos" : "Tormenta"; }
