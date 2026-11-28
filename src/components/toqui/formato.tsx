// US-152: Toqui escribe un poco de Markdown («**negrita**» y viñetas «- »). Aquí se convierte
// en elementos de React (nunca HTML crudo: sin dangerouslySetInnerHTML), así el texto que
// llega de la IA no puede inyectar etiquetas.
import type { ReactNode } from "react";

export type Parte = { texto: string; negrita: boolean };
export type Bloque = { tipo: "parrafo"; partes: Parte[] } | { tipo: "lista"; items: Parte[][] };

const VINETA = /^\s*[-•]\s+/;

/** «Hoy **S/ 840** vendiste» → [texto, negrita, texto]. Un «**» sin pareja queda como texto. */
export function partesEnLinea(linea: string): Parte[] {
  const partes: Parte[] = [];
  const trozos = linea.split("**");
  // Con un número par de «**» el último queda sin cerrar: ese se devuelve tal cual.
  const cerrados = trozos.length % 2 === 1 ? trozos.length : trozos.length - 1;
  for (let i = 0; i < cerrados; i++) {
    if (trozos[i]) partes.push({ texto: trozos[i], negrita: i % 2 === 1 });
  }
  if (cerrados < trozos.length) {
    const resto = `**${trozos[trozos.length - 1]}`;
    const ultima = partes.at(-1);
    if (ultima && !ultima.negrita) ultima.texto += resto;
    else partes.push({ texto: resto, negrita: false });
  }
  return partes;
}

/** Separa el mensaje en párrafos y listas (líneas seguidas que empiezan con «- »). */
export function analizarMensaje(texto: string): Bloque[] {
  const bloques: Bloque[] = [];
  for (const linea of texto.replace(/\r\n?/g, "\n").split("\n")) {
    if (!linea.trim()) continue;
    if (VINETA.test(linea)) {
      const item = partesEnLinea(linea.replace(VINETA, "").trim());
      const ultimo = bloques.at(-1);
      if (ultimo?.tipo === "lista") ultimo.items.push(item);
      else bloques.push({ tipo: "lista", items: [item] });
    } else {
      bloques.push({ tipo: "parrafo", partes: partesEnLinea(linea.trim()) });
    }
  }
  return bloques;
}

function Partes({ partes }: { partes: Parte[] }) {
  return partes.map((parte, i) => (parte.negrita ? <strong key={i}>{parte.texto}</strong> : <span key={i}>{parte.texto}</span>));
}

/** Mensaje de Toqui con negritas y viñetas, armado con elementos de React. */
export function MensajeFormateado({ texto }: { texto: string }): ReactNode {
  return analizarMensaje(texto).map((bloque, i) =>
    bloque.tipo === "lista" ? (
      <ul key={i}>
        {bloque.items.map((item, j) => <li key={j}><Partes partes={item} /></li>)}
      </ul>
    ) : (
      <p key={i}><Partes partes={bloque.partes} /></p>
    ),
  );
}
