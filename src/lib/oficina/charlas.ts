// Charlas ambiente entre departamentos. Se generan con datos REALES del equipo (área, rol, habilidades) pero son una simulación visual:
// no son tareas ni mensajes reales. Determinista por "slot" de tiempo (mismo slot => mismas parejas), sin Math.random.
export type PerfilCharla = { id: string; nombre: string; area: string; rol: string; habilidades: string[] };
export type LineaCharla = { txt: string; fase: 0 | 1 };

const AREA_CORTA: Record<string, string> = { direccion: "Dirección", estrategia: "Estrategia", tecnologia: "Tecnología", crecimiento: "Crecimiento" };
const bajo = (s: string) => (s ? s.charAt(0).toLowerCase() + s.slice(1) : s);
function rng(seed: number) { let s = (seed * 2654435761) >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }

export function plantillas(a: PerfilCharla, b: PerfilCharla, k: number): [string, string] {
  const aA = AREA_CORTA[a.area] ?? a.area, aB = AREA_CORTA[b.area] ?? b.area;
  const hA = bajo(a.habilidades[k % a.habilidades.length] || a.rol), hB = bajo(b.habilidades[(k + 1) % b.habilidades.length] || b.rol);
  const t: [string, string][] = [
    [`En ${aA} me ocupo de ${hA}. ¿Y en ${aB}?`, `Nosotros, de ${hB}.`],
    [`Para ${hA} necesito ${hB} de ${aB}`, `Te lo preparo hoy: ${hB}`],
    [`¿Cómo va ${hB}?`, `Avanzando; luego lo cruzo con tu ${hA}`],
    [`Mi ${hA} depende de ${aB}`, `Tranquilo, yo soy ${bajo(b.rol)}`],
  ];
  return t[k % t.length];
}

/** Para un slot de tiempo, devuelve qué dice cada cabra implicada (parejas siempre de departamentos distintos). */
export function conversaciones(slot: number, perfiles: PerfilCharla[], parejas = 3): Map<string, LineaCharla> {
  const out = new Map<string, LineaCharla>();
  if (perfiles.length < 2) return out;
  const r = rng(slot + 1); const libres = perfiles.slice();
  for (let n = 0; n < parejas; n++) {
    if (libres.length < 2) break;
    const i = Math.floor(r() * libres.length); const a = libres.splice(i, 1)[0];
    const cand = libres.filter((x) => x.area !== a.area); if (!cand.length) continue;
    const b = cand[Math.floor(r() * cand.length)]; libres.splice(libres.indexOf(b), 1);
    const [la, lb] = plantillas(a, b, Math.floor(r() * 1000));
    out.set(a.id, { txt: la, fase: 0 }); out.set(b.id, { txt: lb, fase: 1 });
  }
  return out;
}
