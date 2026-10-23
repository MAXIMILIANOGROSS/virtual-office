"use client";
// Escena 3D con three.js "a pelo" (sin react-three-fiber: su reconciler v8 no arranca con React 19 de Next 15 en el App Router).
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import { MTLLoader } from "three/examples/jsm/loaders/MTLLoader.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { CSS2DObject, CSS2DRenderer } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import { AGENTES } from "@/lib/oficina/agentes";
import { PROYECTO } from "@/oficina.config";
import { conversaciones, type LineaCharla } from "@/lib/oficina/charlas";
import { PANTALLA_COL, type EstadoAg, type PantallaAg } from "@/lib/oficina/mapa";
import { SALAS_ISO } from "@/components/OficinaIso";
import { ambienteEn, descTiempo } from "@/lib/oficina/ambiente";

type P = { x: number; y: number };
type Haz = { id: string; to: string; area: string; n: string };
export type Props = {
  pos: Map<string, P>; est: Map<string, { estado: EstadoAg; tarea: { instruccion: string } | null; pantalla?: PantallaAg }>;
  alto?: string; sel: string | null; onSel: (id: string) => void; haces: Haz[]; calma: boolean; ceo: P; porRevisar: number;
  estadoCol: Record<EstadoAg, string>; areaCol: Record<string, string>; nombreArea: Record<string, string>;
  rolDe?: Record<string, string>; etiquetasTodas?: boolean; giro?: boolean; propios?: Record<string, string>; enfocar?: { id: string; n: number } | null;
};
const S = 1 / 50; // plano → metros
const PANT_E: Record<EstadoAg, PantallaAg> = { trabajando: "ejecutando", esperando_revision: "pausa", en_cola: "cola", libre: "libre" };
const colPant = (it: { e: EstadoAg; p?: PantallaAg }) => PANTALLA_COL[it.p ?? PANT_E[it.e]];
const brillo = (it: { e: EstadoAg; p?: PantallaAg }) => ((it.p ?? PANT_E[it.e]) === "libre" ? 0.5 : 1.1);
const CENTRO = new THREE.Vector3(8.9, 0, 10.4);
// Modelos CC0 (Kenney Furniture Kit, ver public/oficina/glb/LICENSE-kenney-furniture-kit.txt). Si no cargan, se dibujan cajas.
const GLB: Record<string, THREE.Object3D | undefined> = {};
const GLB_NOMBRES = ["desk", "chairDesk", "computerKeyboard", "computerScreen", "pottedPlant", "bookcaseClosed"];
// Modelo 3D de la cabra (OBJ+MTL+PNG reconstruidos de tu imagen; la parte trasera es aproximada). Si no carga, se usan los sprites 360.
let CABRA3D: THREE.Object3D | undefined; let CABRA3D_P: Promise<void> | undefined;
function cargarCabra3D(): Promise<void> {
  return CABRA3D_P ||= (async () => {
    try {
      const ml = new MTLLoader(); ml.setPath("/models/cabra/"); const mats = await ml.loadAsync("cabra.mtl"); mats.preload();
      const ol = new OBJLoader(); ol.setMaterials(mats); ol.setPath("/models/cabra/"); const o = await ol.loadAsync("cabra.obj");
      const bb = new THREE.Box3().setFromObject(o); const sz = new THREE.Vector3(); bb.getSize(sz); const c = new THREE.Vector3(); bb.getCenter(c);
      const k = 0.96 / Math.max(sz.y, 0.001); o.scale.setScalar(k); o.position.set(-c.x * k, -bb.min.y * k, -c.z * k);
      o.traverse((m) => { const me = m as THREE.Mesh; if (me.isMesh) { me.castShadow = true; const mt = me.material as THREE.MeshPhongMaterial; if (mt?.map) mt.map.colorSpace = THREE.SRGBColorSpace; if (mt) { mt.alphaMap = null; mt.transparent = false; mt.alphaTest = 0.5; mt.side = THREE.DoubleSide; mt.needsUpdate = true; } } });
      const g = new THREE.Group(); g.add(o); CABRA3D = typeof window !== "undefined" && new URLSearchParams(window.location.search).has("cabra3d") ? g : undefined; // el modelo 3D reconstruido es experimental: por defecto se usan las 8 fotos reales (sprites 360°)
    } catch { CABRA3D = undefined; }
  })();
}
function cargarGlb(): Promise<void> {
  const l = new GLTFLoader();
  return Promise.all(GLB_NOMBRES.map((n) => GLB[n] ? Promise.resolve() : l.loadAsync(`/oficina/glb/${n}.glb`).then((g) => { GLB[n] = g.scene; }).catch(() => undefined))).then(() => undefined);
}
function colocarGlb(g: THREE.Object3D, nombre: string, ancho: number, x: number, z: number, rotY = 0) {
  const base = GLB[nombre]; if (!base) return null;
  const o = base.clone(true); const bb = new THREE.Box3().setFromObject(o); const sz = new THREE.Vector3(); bb.getSize(sz);
  const k = ancho / Math.max(sz.x, 0.001); o.scale.setScalar(k); o.rotation.y = rotY; o.updateMatrixWorld(true);
  const bb2 = new THREE.Box3().setFromObject(o); const c = new THREE.Vector3(); bb2.getCenter(c);
  o.position.set(x - c.x, -bb2.min.y, z - c.z);
  o.traverse((m) => { if ((m as THREE.Mesh).isMesh) { m.castShadow = true; m.receiveShadow = true; } });
  g.add(o); o.updateMatrixWorld(true);
  const fin = new THREE.Box3().setFromObject(o).applyMatrix4(new THREE.Matrix4()); o.userData.bb = fin; return o;
}
const corto = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s);
type It = { id: string; nombre: string; area: string; x: number; z: number; e: EstadoAg; p?: PantallaAg; t: string; humano?: boolean };

function webglOk(): boolean { try { const c = document.createElement("canvas"); return !!(c.getContext("webgl2") || c.getContext("webgl")); } catch { return false; } }
function etiqueta(it: It, estadoCol: Props["estadoCol"], areaCol: Props["areaCol"], conTarea: boolean, rol?: string, propio?: string): HTMLElement {
  const d = document.createElement("div");
  d.style.cssText = "text-align:center;pointer-events:none;font-family:system-ui,sans-serif";
  const p = document.createElement("div");
  p.style.cssText = `background:#0B1220D9;border:1px solid ${areaCol[it.area]};color:#EAF1FF;border-radius:12px;padding:2px 9px;font-size:12px;font-weight:700;white-space:nowrap;display:inline-flex;align-items:center;gap:6px`;
  const dot = document.createElement("span"); dot.style.cssText = `width:8px;height:8px;border-radius:4px;background:${estadoCol[it.e]};display:inline-block`;
  const tx = document.createElement("span"); tx.textContent = corto(propio || it.nombre, 16);
  p.append(dot, tx); d.append(p);
  const sub = rol || (propio ? it.nombre : "");
  if (sub) { const r = document.createElement("div"); r.style.cssText = "color:#FFE9A6;font-size:10px;margin-top:2px;white-space:nowrap;text-shadow:0 1px 2px #000"; r.textContent = corto(sub, 34); d.append(r); }
  if (conTarea && it.t !== "libre") { const t = document.createElement("div"); t.style.cssText = `color:${estadoCol[it.e]};font-size:10px;margin-top:2px;white-space:nowrap`; t.textContent = corto(it.t, 26); d.append(t); }
  return d;
}

export default function Oficina3D({ pos, est, sel, onSel, haces, calma, ceo, porRevisar, estadoCol, areaCol, nombreArea, rolDe, etiquetasTodas, giro, propios, enfocar, alto }: Props) {
  const mount = useRef<HTMLDivElement>(null);
  const [foco, setFoco] = useState("todas");
  const [ok, setOk] = useState(true);
  const [glbV, setGlbV] = useState(0);
  const [hud, setHud] = useState<{ hora: string; fase: string; temp: number | null; cond: string }>({ hora: "", fase: "", temp: null, cond: "" });
  const [tarj, setTarj] = useState<{ id: string; x: number; y: number } | null>(null); const fija = useRef<string | null>(null);
  useEffect(() => { let vivo = true; Promise.all([cargarGlb(), cargarCabra3D()]).then(() => { if (vivo) setGlbV(1); }); return () => { vivo = false; }; }, []);
  type Modo = { txt: string; alt: string; col: string; go: boolean; tx: number; tz: number };
  const anim = useRef({ cab: [] as { m3?: THREE.Object3D; id: string; mesh: THREE.Mesh; bub: HTMLElement; last: string; mat: THREE.MeshBasicMaterial; fr: THREE.Texture[]; bx: number; bz: number; vec: { id: string; x: number; z: number }[]; vel: number; pausa: number; social: number; radio: number; f: number }[], modo: new Map<string, Modo>(), walk: new Map<string, { ox: number; oz: number; tx: number; tz: number; next: number; h: number; visita?: string }>(), charla: new Map<string, { txt: string; fr: number }>(), fr: 0, slot: -1, conv: new Map<string, LineaCharla>() });
  const api = useRef<{ seguir?: string | null; giro?: boolean; dyn: THREE.Group; pick: THREE.Object3D[]; pulsos: THREE.Mesh[]; haces: THREE.Line[]; dest: { t: THREE.Vector3; d: number }; calma: boolean; onSel: (id: string) => void; onHover: (id: string | null, x: number, y: number, fija: boolean) => void } | null>(null);
  const items: It[] = useMemo(() => {
    const l: It[] = AGENTES.map((a) => { const p = pos.get(a.id), v = est.get(a.id); return p && v ? { id: a.id, nombre: a.nombre, area: a.area, x: p.x * S, z: p.y * S, e: v.estado, p: v.pantalla, t: v.tarea ? v.tarea.instruccion : "libre" } : null; }).filter(Boolean) as It[];
    l.push({ id: "__ceo", nombre: PROYECTO.ceo.trim() || "CEO", area: "direccion", x: ceo.x * S, z: ceo.y * S, e: porRevisar ? "esperando_revision" : "libre", t: porRevisar ? `CEO · ${porRevisar} por revisar` : "CEO · al día", humano: true });
    return l;
  }, [pos, est, ceo, porRevisar]);

  // Montaje único: renderer, cámara, luces, salas y bucle.
  useEffect(() => {
    const el = mount.current; if (!el) return;
    if (!webglOk()) { setOk(false); return; }
    const w0 = el.clientWidth || 800, h0 = el.clientHeight || 500;
    const renderer = new THREE.WebGLRenderer({ antialias: true }); renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6)); renderer.setSize(w0, h0);
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; el.appendChild(renderer.domElement);
    const lab = new CSS2DRenderer(); lab.setSize(w0, h0); Object.assign(lab.domElement.style, { position: "absolute", top: "0", left: "0", pointerEvents: "none" }); el.appendChild(lab.domElement);
    const lienzo = (w: number, h: number, f: (c: CanvasRenderingContext2D, w: number, h: number) => void) => { const c = document.createElement("canvas"); c.width = w; c.height = h; const g = c.getContext("2d"); if (g) f(g, w, h); const tx = new THREE.CanvasTexture(c); tx.colorSpace = THREE.SRGBColorSpace; return tx; };
    const scene = new THREE.Scene();
    // Fondo: cielo al atardecer (azul profundo arriba, turquesa en el horizonte).
    scene.background = lienzo(8, 256, (g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, "#050E24"); gr.addColorStop(0.55, "#0B2A5B"); gr.addColorStop(0.85, "#1A6AA6"); gr.addColorStop(1, "#46B3C9"); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
    const camera = new THREE.PerspectiveCamera(32, w0 / h0, 0.5, 800); camera.position.set(CENTRO.x + 17, 18, CENTRO.z + 17);
    const controls = new OrbitControls(camera, renderer.domElement); controls.target.copy(CENTRO); controls.enableDamping = true;
    controls.minPolarAngle = 0.25; controls.maxPolarAngle = 1.45; controls.autoRotateSpeed = 0.6; controls.minDistance = 6; controls.maxDistance = 42;
    const luzAmb = new THREE.AmbientLight("#ffffff", 0.8), luzHemi = new THREE.HemisphereLight("#BFD6FF", "#1B2A4A", 0.5); scene.add(luzAmb, luzHemi);
    const sun = new THREE.DirectionalLight("#FFF1D6", 1.2); sun.position.set(10, 22, 8); sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -20, right: 20, top: 20, bottom: -20 }); scene.add(sun);
    // === Ambiente en tiempo real: sol/luna, cielo, estrellas, niebla, hora y temperatura del lugar configurado ===
    const luna = new THREE.DirectionalLight("#9DB8FF", 0); luna.position.set(CENTRO.x - 30, 40, CENTRO.z - 20); scene.add(luna);
    sun.target.position.copy(CENTRO); scene.add(sun.target);
    const cvCielo = document.createElement("canvas"); cvCielo.width = 8; cvCielo.height = 256; const texCielo = new THREE.CanvasTexture(cvCielo); texCielo.colorSpace = THREE.SRGBColorSpace; scene.background = texCielo;
    const nEst = 700, posEst = new Float32Array(nEst * 3); for (let i = 0; i < nEst; i++) { const a = Math.random() * Math.PI * 2, e = 0.12 + Math.random() * 1.3, r = 600; posEst[i * 3] = Math.cos(a) * Math.cos(e) * r; posEst[i * 3 + 1] = Math.sin(e) * r; posEst[i * 3 + 2] = Math.sin(a) * Math.cos(e) * r; }
    const geoEst = new THREE.BufferGeometry(); geoEst.setAttribute("position", new THREE.BufferAttribute(posEst, 3)); const matEst = new THREE.PointsMaterial({ color: "#FFFFFF", size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false, fog: false }); const estrellas = new THREE.Points(geoEst, matEst); estrellas.position.set(CENTRO.x, 0, CENTRO.z); scene.add(estrellas);
    let temp: number | null = null, cond = "";
    const aplicarAmb = () => { const a = ambienteEn(new Date()); const g = cvCielo.getContext("2d"); if (g) { const gr = g.createLinearGradient(0, 0, 0, 256); gr.addColorStop(0, a.cielo[0]); gr.addColorStop(0.55, a.cielo[1]); gr.addColorStop(1, a.cielo[2]); g.fillStyle = gr; g.fillRect(0, 0, 8, 256); texCielo.needsUpdate = true; }
      sun.position.set(CENTRO.x + a.dir[0] * 40, Math.max(6, a.dir[1] * 40), CENTRO.z + a.dir[2] * 40); sun.intensity = a.solI; sun.color.set("#FFF1D6").lerp(new THREE.Color("#FF9A55"), a.low * 0.9);
      luzAmb.intensity = a.ambI; luzHemi.intensity = a.hemiI; luna.intensity = a.lunaI; matEst.opacity = a.estrellas; renderer.toneMappingExposure = a.exposicion; if (scene.fog) (scene.fog as THREE.Fog).color.set(a.niebla);
      setHud({ hora: a.hora, fase: a.fase, temp, cond }); };
    window.setTimeout(aplicarAmb, 0); const tAmb = window.setInterval(aplicarAmb, 30000);
    const pedirClima = async () => { try { if (PROYECTO.latitud === null || PROYECTO.longitud === null) return; const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${PROYECTO.latitud}&longitude=${PROYECTO.longitud}&current=temperature_2m,weather_code&timezone=${encodeURIComponent(PROYECTO.zonaHoraria || "UTC")}`); const j = await r.json(); const t = Number(j?.current?.temperature_2m); if (Number.isFinite(t)) { temp = Math.round(t); cond = descTiempo(Number(j.current.weather_code)); aplicarAmb(); } } catch {} };
    pedirClima(); const tClima = window.setInterval(pedirClima, 600000);
    // === SEDE EN DOWNTOWN: planta de oficina elevada con muro cortina, techo y una ciudad alrededor ===
    const rs = Object.values(SALAS_ISO);
    const x0 = Math.min(...rs.map((r) => r.x * S)) - 1.2, x1 = Math.max(...rs.map((r) => (r.x + r.w) * S)) + 1.2;
    const z0 = Math.min(...rs.map((r) => r.y * S)) - 1.2, z1 = Math.max(...rs.map((r) => (r.y + r.h) * S)) + 1.2;
    const pw = x1 - x0, pfd = z1 - z0, pcx = (x0 + x1) / 2, pcz = (z0 + z1) / 2, ALTO = 3.6, CALLE = -24;
    scene.fog = new THREE.Fog("#3F8EB5", 130, 560);
    // Suelo interior continuo (microcemento claro) y techo con paneles de luz (el techo se oculta al mirar desde arriba).
    const micro = lienzo(256, 256, (g, w, h) => { g.fillStyle = "#A8A59E"; g.fillRect(0, 0, w, h); for (let n = 0; n < 900; n++) { g.fillStyle = `rgba(${n % 2 ? "255,255,255" : "40,40,40"},.05)`; g.fillRect(Math.random() * w, Math.random() * h, 2 + Math.random() * 6, 2 + Math.random() * 6); } g.strokeStyle = "rgba(60,60,60,.25)"; g.lineWidth = 2; g.strokeRect(0, 0, w, h); });
    micro.wrapS = micro.wrapT = THREE.RepeatWrapping; micro.repeat.set(pw / 2.5, pfd / 2.5);
    const suelo = new THREE.Mesh(new THREE.PlaneGeometry(pw, pfd), new THREE.MeshStandardMaterial({ map: micro, roughness: 0.45, metalness: 0.05 })); suelo.rotation.x = -Math.PI / 2; suelo.position.set(pcx, -0.02, pcz); suelo.receiveShadow = true; scene.add(suelo);
    const panel = lienzo(128, 128, (g, w, h) => { g.fillStyle = "#E8E6E0"; g.fillRect(0, 0, w, h); g.fillStyle = "#FFFFFF"; g.fillRect(18, 18, w - 36, h - 36); g.strokeStyle = "#B8B6B0"; g.lineWidth = 3; g.strokeRect(1.5, 1.5, w - 3, h - 3); });
    panel.wrapS = panel.wrapT = THREE.RepeatWrapping; panel.repeat.set(pw / 1.8, pfd / 1.8);
    const techo = new THREE.Mesh(new THREE.PlaneGeometry(pw, pfd), new THREE.MeshStandardMaterial({ map: panel, emissive: "#FFF4DC", emissiveMap: panel, emissiveIntensity: 0.35, roughness: 0.9 })); techo.rotation.x = Math.PI / 2; techo.position.set(pcx, ALTO, pcz); scene.add(techo);
    // Muro cortina perimetral: vidrio de suelo a techo, montantes cada ~2,4 m y vigas de borde.
    { const vidrio = new THREE.MeshStandardMaterial({ color: "#B7DBFF", transparent: true, opacity: 0.1, roughness: 0.03, metalness: 0.2, side: THREE.DoubleSide, depthWrite: false });
      const acero = new THREE.MeshStandardMaterial({ color: "#2B3340", roughness: 0.5, metalness: 0.5 });
      const lados: [number, number, number, number][] = [[pcx, z0, pw, 0.05], [pcx, z1, pw, 0.05], [x0, pcz, 0.05, pfd], [x1, pcz, 0.05, pfd]];
      for (const [px, pz, w, d] of lados) {
        const v = new THREE.Mesh(new THREE.BoxGeometry(w, ALTO, d), vidrio); v.position.set(px, ALTO / 2, pz); scene.add(v);
        for (const y of [0.05, ALTO]) { const viga = new THREE.Mesh(new THREE.BoxGeometry(w + 0.12, 0.14, d + 0.12), acero); viga.position.set(px, y, pz); scene.add(viga); }
        const n = Math.max(2, Math.round((w > d ? w : d) / 2.4));
        for (let m = 0; m <= n; m++) { const mx = w > d ? px - w / 2 + (w * m) / n : px, mz = w > d ? pz : pz - d / 2 + (d * m) / n; const mont = new THREE.Mesh(new THREE.BoxGeometry(0.09, ALTO, 0.09), acero); mont.position.set(mx, ALTO / 2, mz); scene.add(mont); }
      }
    }
    // Torre bajo la planta + ciudad: calles con tráfico, manzanas con rascacielos (instanciados) y parques.
    const rnd = (() => { let a = 20261012; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; })();
    const fach = (col: string, enc: number, rx: number, ry: number) => { const tx = lienzo(128, 256, (g, w, h) => { g.fillStyle = col; g.fillRect(0, 0, w, h); for (let i = 0; i < 4; i++) for (let j = 0; j < 8; j++) { g.fillStyle = (i * 7 + j * 13 + enc) % 5 === 0 ? "#FFD98A" : j % 2 ? "#2A4565" : "#203A58"; g.fillRect(i * 32 + 5, j * 32 + 6, 22, 20); } }); tx.wrapS = tx.wrapT = THREE.RepeatWrapping; tx.repeat.set(rx, ry); return tx; };
    const cara = (tx: THREE.Texture) => new THREE.MeshStandardMaterial({ map: tx, roughness: 0.55, metalness: 0.25 });
    const techoEd = new THREE.MeshStandardMaterial({ color: "#4B5563", roughness: 0.9 });
    const torre = new THREE.Mesh(new THREE.BoxGeometry(pw + 0.3, -CALLE - 0.05, pfd + 0.3), [cara(fach("#16304F", 1, pw / 5.5, 12)), cara(fach("#16304F", 2, pw / 5.5, 12)), techoEd, techoEd, cara(fach("#16304F", 3, pfd / 5.5, 12)), cara(fach("#16304F", 4, pfd / 5.5, 12))]); torre.position.set(pcx, CALLE / 2 - 0.03, pcz); scene.add(torre);
    const asfalto = new THREE.Mesh(new THREE.PlaneGeometry(880, 880), new THREE.MeshStandardMaterial({ color: "#454B55", roughness: 0.95 })); asfalto.rotation.x = -Math.PI / 2; asfalto.position.set(pcx + 20, CALLE - 0.05, pcz + 20); scene.add(asfalto);
    { const clases = [{ h: 30, c: "#27415F" }, { h: 55, c: "#1F3652" }, { h: 85, c: "#2A3F57" }, { h: 120, c: "#1B2F4A" }];
      const pos: [number, number, number, number][][] = clases.map(() => []); const parques: [number, number][] = [];
      for (let ix = -8; ix <= 8; ix++) for (let iz = -8; iz <= 8; iz++) { if (Math.hypot(ix, iz) < 2.6) continue; const r = rnd(); const cx = pcx + ix * 40, cz = pcz + iz * 40; if (r < 0.1) { parques.push([cx, cz]); continue; } const dist = Math.hypot(ix, iz); const k = Math.min(3, Math.floor((rnd() * 2.2 + (dist < 3 ? 1.1 : 0)) * (dist > 6 ? 0.55 : 1))); pos[k].push([cx, cz, 0.85 + rnd() * 0.25, 0.85 + rnd() * 0.25]); }
      clases.forEach((cl, k) => { if (!pos[k].length) return; const ladoM = cara(fach(cl.c, k + 5, 2, cl.h / 28)); const im = new THREE.InstancedMesh(new THREE.BoxGeometry(22, cl.h, 22), [ladoM, ladoM, techoEd, techoEd, ladoM, ladoM], pos[k].length); const m4 = new THREE.Matrix4(); pos[k].forEach(([cx, cz, sx, sz], n) => { m4.makeScale(sx, 1, sz); m4.setPosition(cx, CALLE + cl.h / 2, cz); im.setMatrixAt(n, m4); }); im.instanceMatrix.needsUpdate = true; scene.add(im); });
      const verde = new THREE.MeshStandardMaterial({ color: "#2E6B3F", roughness: 1 }); for (const [cx, cz] of parques) { const pq = new THREE.Mesh(new THREE.BoxGeometry(24, 0.2, 24), verde); pq.position.set(cx, CALLE + 0.05, cz); scene.add(pq); }
    }
    let vivo = true;
    const fijas = new THREE.Group(); scene.add(fijas);
    for (const k of Object.keys(SALAS_ISO)) {
      const r = SALAS_ISO[k], w = r.w * S, h = r.h * S, cx = (r.x + r.w / 2) * S, cz = (r.y + r.h / 2) * S;
      const losa = new THREE.Mesh(new THREE.BoxGeometry(w, 0.08, h), new THREE.MeshStandardMaterial({ color: new THREE.Color(areaCol[k]).lerp(new THREE.Color("#CFCBC3"), 0.86), roughness: 0.55, metalness: 0.03 })); losa.position.set(cx, 0.04, cz); losa.receiveShadow = true; fijas.add(losa);
      // Paredes de cristal: altas al fondo y a la izquierda, bajas (barandilla) delante y a la derecha; marco luminoso del color del departamento.
      const cristal = (op: number) => new THREE.MeshStandardMaterial({ color: "#A8D4FF", transparent: true, opacity: op, roughness: 0.05, metalness: 0.15, side: THREE.DoubleSide, depthWrite: false });
      const marco = new THREE.MeshStandardMaterial({ color: areaCol[k], emissive: areaCol[k], emissiveIntensity: 0.55, roughness: 0.4 });
      const pared = (px: number, pz: number, pw: number, pd: number, alto: number, op: number) => {
        const v = new THREE.Mesh(new THREE.BoxGeometry(pw, alto, pd), cristal(op)); v.position.set(px, alto / 2, pz); fijas.add(v);
        const riel = new THREE.Mesh(new THREE.BoxGeometry(pw + 0.04, 0.07, pd + 0.04), marco); riel.position.set(px, alto, pz); fijas.add(riel);
        const zocalo = new THREE.Mesh(new THREE.BoxGeometry(pw + 0.04, 0.07, pd + 0.04), marco); zocalo.position.set(px, 0.06, pz); fijas.add(zocalo);
      };
      pared(cx, cz - h / 2, w, 0.06, 2.4, 0.14); pared(cx - w / 2, cz, 0.06, h, 2.4, 0.14); pared(cx, cz + h / 2, w, 0.06, 0.55, 0.22); pared(cx + w / 2, cz, 0.06, h, 0.55, 0.22);
      for (const [qx, qz] of [[cx - w / 2, cz - h / 2], [cx + w / 2, cz - h / 2], [cx - w / 2, cz + h / 2], [cx + w / 2, cz + h / 2]]) { const poste = new THREE.Mesh(new THREE.BoxGeometry(0.12, qz > cz ? 0.6 : 2.4, 0.12), marco); poste.position.set(qx, (qz > cz ? 0.6 : 2.4) / 2, qz); fijas.add(poste); }
      const d = document.createElement("div"); d.textContent = nombreArea[k]; d.style.cssText = `color:${areaCol[k]};font:800 16px system-ui,sans-serif;white-space:nowrap;text-shadow:0 1px 4px #000`;
      const t = new CSS2DObject(d); t.position.set(cx, 2.9, cz - h / 2); fijas.add(t);
    }
    // Marca: rótulo luminoso con el nombre del proyecto (oficina.config.ts) sobre el fondo del edificio.
    { const zs = Object.values(SALAS_ISO).map((r) => r.y * S), xs = Object.values(SALAS_ISO).map((r) => (r.x + r.w / 2) * S); const zMin = Math.min(...zs), xMed = (Math.min(...xs) + Math.max(...xs)) / 2;
      const rot = lienzo(1024, 160, (g, w, h) => { g.textAlign = "center"; g.fillStyle = "#FFD600"; g.font = "800 92px system-ui,sans-serif"; g.fillText((PROYECTO.nombre.trim() || "OFICINA VIRTUAL").toUpperCase(), w / 2, 92); g.fillStyle = "#A9C1E8"; g.font = "600 34px system-ui,sans-serif"; g.fillText(("VIRTUAL HQ" + (PROYECTO.ciudad.trim() ? " · " + PROYECTO.ciudad.trim() : "")).toUpperCase(), w / 2, 140); });
      const cartel = new THREE.Mesh(new THREE.PlaneGeometry(14, 2.19), new THREE.MeshBasicMaterial({ map: rot, transparent: true, depthWrite: false, toneMapped: false, fog: false })); cartel.position.set(xMed, 3.05, zMin - 1.1); fijas.add(cartel); }
    const dyn = new THREE.Group(); scene.add(dyn);
    const a = { dyn, pick: [] as THREE.Object3D[], pulsos: [] as THREE.Mesh[], haces: [] as THREE.Line[], dest: { t: CENTRO.clone(), d: 31 }, calma: false, giro: false as boolean | undefined, seguir: null as string | null | undefined, onSel: (_id: string) => {}, onHover: (_i: string | null, _x: number, _y: number, _f: boolean) => {} };
    api.current = a;
    const ray = new THREE.Raycaster(), v2 = new THREE.Vector2(); let down = { x: 0, y: 0 };
    const pd = (e: PointerEvent) => { a.seguir = null; down = { x: e.clientX, y: e.clientY }; };
    const pu = (e: PointerEvent) => {
      if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5) return;
      const r = renderer.domElement.getBoundingClientRect(); v2.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); ray.setFromCamera(v2, camera);
      const h = ray.intersectObjects(a.pick, false)[0]; const id = h?.object.userData.id as string | undefined; if (id && id !== "__ceo") { a.onSel(id); a.onHover(id, e.clientX, e.clientY, true); } else a.onHover(null, 0, 0, true);
    };
    const pm = (e: PointerEvent) => { if (e.buttons) return; const r = renderer.domElement.getBoundingClientRect(); v2.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); ray.setFromCamera(v2, camera); const h = ray.intersectObjects(a.pick, false)[0]; const id = h?.object.userData.id as string | undefined; renderer.domElement.style.cursor = id && id !== "__ceo" ? "pointer" : ""; a.onHover(id && id !== "__ceo" ? id : null, e.clientX, e.clientY, false); };
    renderer.domElement.addEventListener("pointerdown", pd); renderer.domElement.addEventListener("pointerup", pu); renderer.domElement.addEventListener("pointermove", pm);
    const ro = new ResizeObserver(() => { const w = el.clientWidth, h = el.clientHeight; if (!w || !h) return; renderer.setSize(w, h); lab.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix(); }); ro.observe(el);
    let raf = 0; const clock = new THREE.Clock(); const quieto = typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const loop = () => {
      raf = requestAnimationFrame(loop); const dt = clock.getDelta(), t = clock.elapsedTime;
      techo.visible = camera.position.y < 6;
      if (a.seguir) { const cc = anim.current.cab.find((x) => x.id === a.seguir); if (cc) { cc.mesh.getWorldPosition(a.dest.t); a.dest.t.y = 0.9; } }
      controls.target.lerp(a.dest.t, 0.08); const dir = camera.position.clone().sub(controls.target).normalize(); camera.position.lerp(controls.target.clone().add(dir.multiplyScalar(a.dest.d)), 0.06);
      controls.autoRotate = !!a.giro && !a.calma && !quieto; controls.update();
      const an = anim.current; an.fr++;
      for (const c of an.cab) {
        const m = an.modo.get(c.id); let w = an.walk.get(c.id); if (!w) { w = { ox: 0, oz: 0, tx: 0, tz: 0, next: 0, h: Math.PI }; an.walk.set(c.id, w); }
        if (a.calma || quieto) { w.tx = 0; w.tz = 0; }
        else if (m) { w.tx = m.go ? m.tx : 0; w.tz = m.go ? m.tz : 0; }
        else if (t > w.next) {
          const v = c.vec.length && Math.random() < c.social ? c.vec[Math.floor(Math.random() * c.vec.length)] : null;
          if (v) { w.tx = v.x - c.bx + 0.9; w.tz = v.z - c.bz; w.next = t + c.pausa + 9; w.visita = v.id; }
          else { w.visita = undefined; w.tx = (-0.8 + Math.random() * 1.8) * c.radio; w.tz = Math.random() * 0.9 * c.radio - 0.12; w.next = t + c.pausa * (0.6 + Math.random() * 0.8); }
        }
        const k = Math.min(1, dt * 1.6 * c.vel); w.ox += (w.tx - w.ox) * k; w.oz += (w.tz - w.oz) * k;
        const dx = w.tx - w.ox, dz = w.tz - w.oz; const mueve = Math.hypot(dx, dz) > 0.06;
        const hDest = mueve ? Math.atan2(dx, dz) : Math.PI; let dh = hDest - w.h; while (dh > Math.PI) dh -= 2 * Math.PI; while (dh < -Math.PI) dh += 2 * Math.PI; w.h += dh * Math.min(1, dt * 6);
        const gx = c.bx + 0.28 + w.ox, gz = c.bz + 0.62 + w.oz;
        const phi = Math.atan2(camera.position.x - gx, camera.position.z - gz);
        c.mesh.rotation.y = phi;
        let rel = phi - w.h; while (rel > Math.PI) rel -= 2 * Math.PI; while (rel < -Math.PI) rel += 2 * Math.PI;
        const idx = (((2 - Math.round(rel / (Math.PI / 4))) % 8) + 8) % 8;
        if (!c.m3 && idx !== c.f) { c.f = idx; c.mat.map = c.fr[idx]; }
        c.mesh.position.set(0.28 + w.ox, 0.98 + (mueve && !a.calma ? Math.abs(Math.sin(t * 9 * c.vel)) * 0.04 : 0), 0.62 + w.oz);
        if (c.m3) { c.m3.position.copy(c.mesh.position); c.m3.position.y -= 0.48; c.m3.rotation.y = w.h; }
        // Charla ambiente entre departamentos: parejas de áreas distintas hablan de su trabajo (datos del equipo; simulación, NO tareas reales).
        if (!m && !a.calma && !quieto) {
          const sl = Math.floor(t / 12);
          if (an.slot !== sl) { an.slot = sl; an.conv = conversaciones(sl, AGENTES); }
          const cv = an.conv.get(c.id);
          if (cv && cv.fase === ((t % 12) < 6 ? 0 : 1)) an.charla.set(c.id, { txt: cv.txt, fr: an.fr });
        }
        let txt = "", col = "", dash = false;
        const ch = an.charla.get(c.id);
        if (m) { txt = Math.floor(t / 3) % 2 && m.alt ? m.alt : m.txt; col = m.col; } else if (ch && an.fr - ch.fr < 4) { txt = ch.txt; col = "#64748B"; dash = true; } else if (mueve && !a.calma) { txt = "…"; col = "#64748B"; dash = true; }
        const key = txt + col;
        if (key !== c.last) { c.last = key; c.bub.style.display = txt ? "block" : "none"; c.bub.textContent = txt; c.bub.style.borderColor = col || "#64748B"; c.bub.style.borderStyle = dash ? "dashed" : "solid"; }
      }
      if (!a.calma) { for (const m of a.pulsos) (m.material as THREE.MeshBasicMaterial).opacity = 0.25 + 0.2 * Math.sin(t * 2.2); for (const l of a.haces) { (l.material as THREE.LineDashedMaterial & { dashOffset: number }).dashOffset -= dt * 1.5; } }
      renderer.render(scene, camera); lab.render(scene, camera);
    };
    loop();
    return () => {
      vivo = false; window.clearInterval(tAmb); window.clearInterval(tClima); cancelAnimationFrame(raf); ro.disconnect(); renderer.domElement.removeEventListener("pointerdown", pd); renderer.domElement.removeEventListener("pointerup", pu); renderer.domElement.removeEventListener("pointermove", pm);
      controls.dispose(); scene.traverse((o) => { const m = o as THREE.Mesh; if (m.geometry) m.geometry.dispose(); const mt = m.material as THREE.Material | THREE.Material[] | undefined; if (mt) (Array.isArray(mt) ? mt : [mt]).forEach((x) => { (x as THREE.MeshBasicMaterial).map?.dispose(); x.dispose(); }); });
      renderer.dispose(); el.removeChild(renderer.domElement); el.removeChild(lab.domElement); api.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Parte dinámica: puestos, cabras, etiquetas y haces según el estado real.
  useEffect(() => {
    const a = api.current; if (!a) return;
    a.onSel = onSel; a.onHover = (id, cx, cy, f) => { const r = mount.current?.getBoundingClientRect(); if (f) { fija.current = id; setTarj(id ? { id, x: cx - (r?.left || 0), y: cy - (r?.top || 0) } : null); return; } if (fija.current) return; setTarj(id ? { id, x: cx - (r?.left || 0), y: cy - (r?.top || 0) } : null); }; a.calma = calma; a.giro = !!giro;
    for (const o of [...a.dyn.children]) { a.dyn.remove(o); o.traverse((c) => { const m = c as THREE.Mesh; if (m.geometry) m.geometry.dispose(); const mt = m.material as THREE.Material | undefined; if (mt && !(mt as THREE.MeshBasicMaterial).map) mt.dispose(); if (c instanceof CSS2DObject) c.element.remove(); }); }
    a.pick = []; a.pulsos = []; a.haces = [];
    // Modos de las cabras: SOLO eventos reales (delegación, resultado listo, en cola, trabajando). Sin evento = ambiente (paseo, globo "…").
    const an = anim.current; an.cab = []; an.modo.clear();
    { const cp = pos.get("ciro"); let primero = true;
      for (const h of haces) { const q = pos.get(h.to); if (!q || !cp) continue;
        an.modo.set(h.to, { txt: "Recibido", alt: "Trabajando en ello", col: estadoCol.trabajando, go: false, tx: 0, tz: 0 });
        if (primero) { primero = false; an.modo.set("ciro", { txt: "Te paso esto", alt: "Te paso esto", col: areaCol.direccion, go: true, tx: (q.x - cp.x) * S + 0.9, tz: (q.y - cp.y) * S }); } }
      for (const it of items) { if (it.humano || an.modo.has(it.id)) continue;
        if (it.e === "esperando_revision") an.modo.set(it.id, { txt: "Resultado listo", alt: "", col: estadoCol.esperando_revision, go: false, tx: 0, tz: 0 });
        else if (it.e === "en_cola") an.modo.set(it.id, { txt: "En cola", alt: "", col: estadoCol.en_cola, go: false, tx: 0, tz: 0 });
        else if (it.e === "trabajando") an.modo.set(it.id, { txt: "Trabajando", alt: "", col: estadoCol.trabajando, go: false, tx: 0, tz: 0 }); } }
    const texs: Record<string, THREE.Texture> = (api.current as unknown as { texs?: Record<string, THREE.Texture> }).texs ||= {};
    const loader = new THREE.TextureLoader();
    const fr360 = (): THREE.Texture[] => { const c = texs as unknown as Record<string, THREE.Texture[]>; return c.__360 ||= Array.from({ length: 8 }, (_, i) => { const t = loader.load(`/cabra360/cabra-${i}.webp`); t.colorSpace = THREE.SRGBColorSpace; return t; }); };
    if (GLB.bookcaseClosed) for (const k of Object.keys(SALAS_ISO)) {
      const r = SALAS_ISO[k]; const x0 = r.x * S, z0 = r.y * S, w = r.w * S;
      for (let x = x0 + 1; x < x0 + w - 1; x += 2.6) colocarGlb(a.dyn, "bookcaseClosed", 0.75, x, z0 + 0.35);
      colocarGlb(a.dyn, "pottedPlant", 0.45, x0 + 0.5, z0 + (r.h * S) - 0.5); colocarGlb(a.dyn, "pottedPlant", 0.45, x0 + w - 0.5, z0 + (r.h * S) - 0.5);
    }
    for (const it of items) {
      const g = new THREE.Group(); g.position.set(it.x, 0, it.z); a.dyn.add(g);
      const on = sel === it.id, verTodos = foco !== "todas" && it.area === foco;
      const caja = (w: number, h: number, d: number, col: string, x: number, y: number, z: number, emis?: string, ei = 0) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color: col, roughness: 0.7, emissive: emis || "#000000", emissiveIntensity: ei })); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; g.add(m); return m; };
      if (it.e === "trabajando") { const h = new THREE.Mesh(new THREE.CircleGeometry(0.95, 40), new THREE.MeshBasicMaterial({ color: estadoCol.trabajando, transparent: true, opacity: 0.35 })); h.rotation.x = -Math.PI / 2; h.position.set(0, 0.1, 0.2); g.add(h); a.pulsos.push(h); }
      const usaGlb = !!GLB.desk;
      const top = caja(1.25, 0.06, 0.55, on ? "#9A7650" : "#6B4F3A", 0, 0.72, 0); top.userData.id = it.id; a.pick.push(top);
      if (usaGlb) { top.visible = false; colocarGlb(g, "desk", 1.25, 0, 0); }
      else { caja(0.05, 0.72, 0.5, "#2A1D18", -0.55, 0.36, 0); caja(0.05, 0.72, 0.5, "#2A1D18", 0.55, 0.36, 0); }
      if (on) { const r = new THREE.Mesh(new THREE.RingGeometry(0.75, 0.85, 40), new THREE.MeshBasicMaterial({ color: "#FFD600", side: THREE.DoubleSide })); r.rotation.x = -Math.PI / 2; r.position.set(0.1, 0.05, 0.3); g.add(r); }
      // Teclado y ratón sobre la mesa (el teclado GLB, si existe, ya lo pone arriba).
      // Teclado (con filas de teclas) y ratón, siempre sobre la mesa: la mesa mide 0.72 de alto.
      caja(0.46, 0.03, 0.16, "#CBD5E1", -0.28, 0.745, 0.15);
      for (let f = 0; f < 3; f++) caja(0.42, 0.012, 0.03, "#475569", -0.28, 0.768, 0.1 + f * 0.05);
      caja(0.075, 0.03, 0.12, "#E2E8F0", 0.04, 0.745, 0.15); caja(0.012, 0.012, 0.04, "#475569", 0.04, 0.765, 0.12);
      const mon = usaGlb ? colocarGlb(g, "computerScreen", 0.62, -0.28, -0.1) : null;
      if (mon) {
        mon.position.y += 0.72; const bb = new THREE.Box3().setFromObject(mon); const sz = new THREE.Vector3(); bb.getSize(sz);
        const pl = new THREE.Mesh(new THREE.PlaneGeometry(sz.x * 0.82, sz.y * 0.66), new THREE.MeshStandardMaterial({ color: "#0B1220", emissive: colPant(it), emissiveIntensity: brillo(it) }));
        pl.position.set((bb.min.x + bb.max.x) / 2, bb.min.y + sz.y * 0.6, bb.max.z + 0.004); g.add(pl);
      } else { caja(0.52, 0.34, 0.03, "#0B1220", -0.32, 0.93, -0.12, colPant(it), brillo(it)); caja(0.06, 0.08, 0.06, "#111827", -0.32, 0.77, -0.12); }
      if (!(usaGlb && !!colocarGlb(g, "chairDesk", 0.5, 0.28, 0.62, Math.PI))) { const silla = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.07, 20), new THREE.MeshStandardMaterial({ color: "#0B1220" })); silla.position.set(0.28, 0.4, 0.62); g.add(silla); }
      const frs = fr360(); const cmat = new THREE.MeshBasicMaterial({ map: frs[2], transparent: false, alphaTest: 0.5, depthWrite: true, toneMapped: false, side: THREE.DoubleSide }); const cabra = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.96), cmat); cabra.position.set(0.28, 0.98, 0.62); cabra.rotation.y = Math.PI / 4; cabra.userData.id = it.id; g.add(cabra); a.pick.push(cabra);
      if (!it.humano) { const b = document.createElement("div"); b.style.cssText = "display:none;background:#FFFFFFEE;color:#0B1220;border:2px solid #64748B;border-radius:10px;padding:2px 8px;font:700 11px system-ui,sans-serif;white-space:nowrap;pointer-events:none;transform:translateY(-4px)"; const lo = new CSS2DObject(b); lo.position.set(0, 0.62, 0); cabra.add(lo); let hh = 0; for (const ch of it.id) hh = (hh * 31 + ch.charCodeAt(0)) >>> 0; const r01 = (n: number) => ((hh >>> n) % 100) / 100; const m3 = CABRA3D ? (CABRA3D.clone(true) as THREE.Object3D) : undefined; if (m3) { cmat.visible = false; g.add(m3); const ring = new THREE.Mesh(new THREE.RingGeometry(0.34, 0.4, 32), new THREE.MeshBasicMaterial({ color: areaCol[it.area] || "#FFD600", side: THREE.DoubleSide })); ring.rotation.x = -Math.PI / 2; ring.position.set(0.28, 0.05, 0.62); g.add(ring); }
      anim.current.cab.push({ m3, id: it.id, mesh: cabra, bub: b, last: "", mat: cmat, fr: frs, bx: it.x, bz: it.z, vec: items.filter((o) => !o.humano && o.area === it.area && o.id !== it.id).map((o) => ({ id: o.id, x: o.x, z: o.z })), vel: 0.8 + r01(3) * 0.9, pausa: 4 + r01(7) * 6, social: 0.15 + r01(11) * 0.4, radio: 0.7 + r01(5) * 0.5, f: 2 }); }
      if (it.humano || etiquetasTodas) { const l = new CSS2DObject(etiqueta(it, estadoCol, areaCol, on || it.e === "trabajando" || !!it.humano, etiquetasTodas && foco !== "todas" ? rolDe?.[it.id] : undefined, propios?.[it.id])); l.position.set(0.28, 1.95, 0.62); g.add(l); }
    }
    const ciro = pos.get("ciro");
    if (ciro) for (const h of haces) {
      const q = pos.get(h.to); if (!q) continue;
      const A = new THREE.Vector3(ciro.x * S, 1.2, ciro.y * S), B = new THREE.Vector3(q.x * S, 1.2, q.y * S), M = A.clone().lerp(B, 0.5); M.y += 1.8;
      const pts = new THREE.QuadraticBezierCurve3(A, M, B).getPoints(40); const g = new THREE.BufferGeometry().setFromPoints(pts);
      const c1 = new THREE.Color(areaCol.direccion), c2 = new THREE.Color(areaCol[h.area]); const cols: number[] = []; pts.forEach((_, i) => { const c = c1.clone().lerp(c2, i / (pts.length - 1)); cols.push(c.r, c.g, c.b); });
      g.setAttribute("color", new THREE.Float32BufferAttribute(cols, 3));
      const ln = new THREE.Line(g, new THREE.LineDashedMaterial({ vertexColors: true, dashSize: 0.3, gapSize: 0.2 })); ln.computeLineDistances(); a.dyn.add(ln); a.haces.push(ln);
    }
  }, [items, sel, haces, calma, foco, pos, onSel, estadoCol, areaCol, glbV, rolDe, etiquetasTodas, propios]);

  useEffect(() => {
    const a = api.current; if (!a) return;
    if (foco === "todas" || !SALAS_ISO[foco]) a.dest = { t: CENTRO.clone(), d: 31 };
    else { const r = SALAS_ISO[foco]; a.dest = { t: new THREE.Vector3((r.x + r.w / 2) * S, 0, (r.y + r.h / 2) * S), d: 13 }; }
  }, [foco]);

  useEffect(() => {
    const a = api.current; if (!enfocar || !a) return;
    const c = anim.current.cab.find((x) => x.id === enfocar.id); if (!c) return;
    a.seguir = enfocar.id; a.dest = { t: new THREE.Vector3(), d: 5 }; fija.current = enfocar.id; setTarj({ id: enfocar.id, x: 16, y: 16 });
    mount.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enfocar?.n, enfocar?.id, glbV]);

  const salas = ["todas", ...Object.keys(SALAS_ISO)];
  if (!ok) return <p style={{ color: "#FBBF24", fontSize: 13 }}>Tu navegador no puede mostrar WebGL. Usa la vista “Isométrica 2D” o el “Plano 2D”.</p>;
  return (
    <div>
      <div ref={mount} style={{ position: "relative", height: alto || "min(72vh, 640px)", borderRadius: 12, overflow: "hidden", border: "1px solid #2A5CAA", background: "#07182E" }}>
        {hud.hora && <div role="status" aria-label="Hora y tiempo" style={{ position: "absolute", top: 8, right: 8, zIndex: 3, background: "rgba(6,20,46,.78)", border: "1px solid #2A5CAA", borderRadius: 10, padding: "6px 10px", color: "#F4F8FF", fontSize: 12, lineHeight: 1.35, textAlign: "right", pointerEvents: "none" }}><div style={{ fontSize: 18, fontWeight: 800 }}>{hud.fase === "noche" ? "🌙" : hud.fase === "día" ? "☀️" : "🌅"} {hud.hora}</div><div>{PROYECTO.ciudad.trim() ? PROYECTO.ciudad.trim() + " · " : ""}{hud.fase}</div><div style={{ color: "#A9C1E8" }}>{hud.temp !== null ? `${hud.temp} °C · ${hud.cond}` : "Temperatura: sin datos"}</div></div>}
        {tarj && (() => { const ag = AGENTES.find((x) => x.id === tarj.id); const it = items.find((x) => x.id === tarj.id); if (!ag || !it) return null; const w = mount.current?.clientWidth || 600; const izq = tarj.x > w - 280; return (
          <div role="dialog" aria-label={`Ficha de ${propios?.[ag.id] || ag.nombre}`} style={{ position: "absolute", left: izq ? undefined : Math.min(tarj.x + 14, w - 270), right: izq ? w - tarj.x + 14 : undefined, top: Math.max(8, tarj.y - 20), width: 256, background: "#0B2A5BF2", border: `1px solid ${areaCol[ag.area] || "#FFD600"}`, borderRadius: 12, padding: 10, color: "#F4F8FF", fontFamily: "system-ui,sans-serif", fontSize: 12, pointerEvents: fija.current ? "auto" : "none", zIndex: 5, boxShadow: "0 6px 24px #0008" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}><div><div style={{ fontWeight: 800, fontSize: 14 }}>{propios?.[ag.id] || ag.nombre}{ag.jefe ? " ★" : ""}</div><div style={{ color: "#FFE9A6", fontSize: 11 }}>{ag.nombre} · {nombreArea[ag.area]}</div></div>{fija.current && <button type="button" aria-label="Cerrar ficha" onClick={() => { fija.current = null; setTarj(null); }} style={{ background: "transparent", border: 0, color: "#F4F8FF", cursor: "pointer", fontSize: 16, lineHeight: 1 }}>×</button>}</div>
            <div style={{ marginTop: 6 }}><b>Puesto:</b> {ag.rol}</div>
            <div style={{ marginTop: 4 }}><span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 4, background: estadoCol[it.e], marginRight: 5 }} /><b>Ahora:</b> {it.e === "libre" ? "Sin tareas asignadas" : it.t}</div>
            {ag.habilidades?.length ? <div style={{ marginTop: 4, color: "#A9C1E8" }}><b style={{ color: "#F4F8FF" }}>Ficha técnica:</b> {ag.habilidades.join(" · ")}</div> : null}
            {!fija.current && <div style={{ marginTop: 4, color: "#7F98C4", fontSize: 10 }}>Haz clic para fijar la ficha</div>}
          </div>); })()}
      </div>
      <details style={{ marginTop: 8 }}><summary style={{ cursor: "pointer", color: "#FFD600", fontSize: 13, fontWeight: 700 }}>🏢 Salas ({salas.length})</summary><div role="tablist" aria-label="Sala" style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
        {salas.map((k) => <button key={k} type="button" role="tab" aria-selected={foco === k} onClick={() => setFoco(k)} style={{ padding: "5px 10px", borderRadius: 8, border: `1px solid ${foco === k ? "#FFD600" : "#1E3A66"}`, background: foco === k ? "#13294D" : "transparent", color: "#EAF1FF", cursor: "pointer", fontSize: 12 }}>{k === "todas" ? "Toda la oficina" : nombreArea[k]}</button>)}
      </div></details>
      <p style={{ fontSize: 11, color: "#9FB3D6", marginTop: 6 }}>Arrastra para girar, rueda para acercar, pasa el ratón o haz clic en una cabra para ver su nombre, lo que hace y su ficha técnica. El halo cian, los haces y los globos con texto salen de tareas reales; si una cabra pasea con un globo discontinuo “…”, es solo ambiente (sin trabajo real).</p>
    </div>
  );
}
