export const columnas = 3;
export type Posiciones = Record<string, number>;

export function distribuirMesas(ids: string[], guardado: string, ordenAnterior: string): Posiciones {
  let datos: Posiciones = {};
  try {
    const valor = JSON.parse(guardado);
    if (valor && typeof valor === "object" && !Array.isArray(valor)) datos = valor;
  } catch { /* La distribución inicial se usa también si el almacenamiento está vacío. */ }

  const posiciones: Posiciones = {};
  const ocupadas = new Set<number>();
  for (const id of ids) {
    const celda = datos[id];
    if (Number.isSafeInteger(celda) && celda >= 0 && celda < Math.max(300, ids.length * 3) && !ocupadas.has(celda)) {
      posiciones[id] = celda;
      ocupadas.add(celda);
    }
  }
  let siguiente = 0;
  const pendientes = new Set(ids.filter(id => posiciones[id] === undefined));
  for (const id of [...ordenAnterior.split(","), ...ids]) {
    if (!pendientes.delete(id)) continue;
    while (ocupadas.has(siguiente)) siguiente++;
    posiciones[id] = siguiente++;
  }
  return posiciones;
}

export function moverMesa(posiciones: Posiciones, id: string, destino: number): Posiciones {
  const origen = posiciones[id];
  if (origen === undefined || origen === destino) return posiciones;
  const otra = Object.keys(posiciones).find(clave => posiciones[clave] === destino);
  return { ...posiciones, ...(otra ? { [otra]: origen } : {}), [id]: destino };
}
