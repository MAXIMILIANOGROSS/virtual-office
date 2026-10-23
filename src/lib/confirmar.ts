"use client";

/**
 * Sustituye a window.confirm: diálogo nativo <dialog> propio, accesible (foco atrapado, Esc cancela)
 * y con el estilo de la oficina. Devuelve una promesa: true si acepta, false si cancela.
 * Uso: `if (!(await confirmar("¿Borrar esto?"))) return;`
 */
export function confirmar(mensaje: string, opciones?: { aceptar?: string; cancelar?: string; peligro?: boolean }): Promise<boolean> {
  if (typeof document === "undefined") return Promise.resolve(false);
  return new Promise((resolve) => {
    const d = document.createElement("dialog");
    d.className = "ic-dialog";
    d.setAttribute("aria-label", mensaje.slice(0, 120));
    const cuerpo = document.createElement("div");
    cuerpo.className = "ic-dialog-body";
    const p = document.createElement("p");
    p.style.cssText = "margin:0 0 18px;font-size:17px;line-height:1.45;white-space:pre-line";
    p.textContent = mensaje;
    const fila = document.createElement("div");
    fila.style.cssText = "display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap";
    const no = document.createElement("button");
    no.type = "button"; no.className = "ic-btn ghost"; no.textContent = opciones?.cancelar ?? "Cancelar";
    const si = document.createElement("button");
    si.type = "button"; si.className = "ic-btn"; si.textContent = opciones?.aceptar ?? "Aceptar";
    if (opciones?.peligro) si.style.background = "#c0392b", si.style.color = "#fff";
    fila.append(no, si); cuerpo.append(p, fila); d.append(cuerpo);
    let hecho = false;
    const cerrar = (v: boolean) => { if (hecho) return; hecho = true; try { d.close(); } catch { /* ya cerrado */ } d.remove(); resolve(v); };
    no.addEventListener("click", () => cerrar(false));
    si.addEventListener("click", () => cerrar(true));
    d.addEventListener("cancel", (e) => { e.preventDefault(); cerrar(false); });
    d.addEventListener("click", (e) => { if (e.target === d) cerrar(false); });
    document.body.append(d);
    try { d.showModal(); no.focus(); } catch { cerrar(window.confirm(mensaje)); }
  });
}
