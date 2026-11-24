// Unidades del modelo, con z vertical. La misma cámara proyecta los muebles y los botones.
export type Punto3D = [number, number, number];
export type Cara = { vertices: Punto3D[]; color: string };
export type Mueble = { centro: Punto3D; caras: Cara[] };
export type Asiento = { celda: number; estado: "libre" | "ocupada" | "espera" | "inactiva" };

const pintura = {
  blanco: "var(--color-superficie)", crema: "var(--color-aviso-fondo)", madera: "var(--color-aviso-borde)",
  azul: "var(--v2-coral)", marino: "var(--v2-pizarra)", claro: "var(--v2-azul-suave)",
  sombra: "var(--color-info-borde)", gris: "var(--v2-borde)", verde: "var(--v2-salvia)",
};
const tapices = { libre: pintura.verde, ocupada: pintura.azul, espera: "var(--v2-ambar)", inactiva: "var(--color-neutro-texto)" };

export function camara(filas: number, grados: number, mostrador = false) {
  const ancho = mostrador ? 300 : 360;
  const fondo = mostrador ? 180 : filas * 130;
  const giro = grados * Math.PI / 180;
  const c = Math.cos(giro), s = Math.sin(giro);
  const inclinacion = Math.PI / 4;
  const alto = Math.sin(inclinacion), vertical = Math.cos(inclinacion);
  function proyectar([x, y, z]: Punto3D) {
    return { x: c * x - s * y, y: (s * x + c * y) * alto - z * vertical };
  }
  const limites = [0, ancho].flatMap(x => [0, fondo].flatMap(y => [-9, 62].map(z => proyectar([x, y, z]))));
  const margen = 12;
  const izquierda = Math.min(...limites.map(p => p.x)) - margen;
  const arriba = Math.min(...limites.map(p => p.y)) - margen;
  const w = Math.max(...limites.map(p => p.x)) + margen - izquierda;
  const h = Math.max(...limites.map(p => p.y)) + margen - arriba;
  return {
    ancho, fondo, grados, w, h, izquierda, arriba, proyectar,
    distancia: ([x, y, z]: Punto3D) => (s * x + c * y) * vertical + z * alto,
    posicion(p: Punto3D) {
      const punto = proyectar(p);
      return { left: (punto.x - izquierda) / w * 100 + "%", top: (punto.y - arriba) / h * 100 + "%" };
    },
    celdaEnSuelo(u: number, v: number) {
      const horizontal = izquierda + u * w;
      const profundidad = (arriba + v * h) / alto;
      const x = c * horizontal + s * profundidad;
      const y = -s * horizontal + c * profundidad;
      return x >= 0 && x < ancho && y >= 0 && y < fondo
        ? Math.floor(y / 130) * 3 + Math.floor(x / 120) : null;
    },
  };
}
export type Camara = ReturnType<typeof camara>;
export function centroCelda(celda: number, altura = 32): Punto3D {
  return [60 + (celda % 3) * 120, 65 + Math.floor(celda / 3) * 130, altura];
}

function cara(color: string, ...vertices: Punto3D[]): Cara { return { color, vertices }; }

// Ordenamos las caras de cada pieza por profundidad, incluidas las laterales al girar.
function bloque(x: number, y: number, z: number, w: number, d: number, h: number, tapa: string, frente: string, lado: string): Mueble {
  const a: Punto3D = [x, y, z + h], b: Punto3D = [x + w, y, z + h], c: Punto3D = [x + w, y + d, z + h], e: Punto3D = [x, y + d, z + h];
  return {
    centro: [x + w / 2, y + d / 2, z + h / 2], caras: [
      cara(frente, [x, y + d, z], [x + w, y + d, z], c, e),
      cara(lado, [x, y, z], [x, y + d, z], e, a),
      cara(lado, [x + w, y + d, z], [x + w, y, z], b, c),
      cara(tapa, a, b, c, e),
    ]
  };
}
function cilindro(x: number, y: number, z: number, r: number, h: number, tapa: string, canto: string): Mueble {
  const puntos = Array.from({ length: 32 }, (_, i): Punto3D => [x + r * Math.cos(i * Math.PI / 16), y + r * Math.sin(i * Math.PI / 16), z + h]);
  const caras = puntos.map((a, i) => {
    const b = puntos[(i + 1) % puntos.length];
    return cara(canto, [a[0], a[1], z], [b[0], b[1], z], b, a);
  });
  return { centro: [x, y, z + h / 2], caras: [...caras, cara(tapa, ...puntos)] };
}

export function mosaico(c: Camara) {
  const piezas: Cara[] = [];
  for (let x = 0; x < c.ancho; x += 30) for (let y = 0; y < c.fondo; y += 30) {
    const x2 = Math.min(x + 30, c.ancho), y2 = Math.min(y + 30, c.fondo);
    const color = (x + y) % 60 === 0 ? pintura.blanco : "var(--v2-gris-frio)";
    piezas.push(cara(color, [x, y, 0], [x2, y, 0], [x2, y2, 0], [x, y2, 0]));
  }
  return piezas;
}

export function sombras(asientos: Asiento[], mostrador: boolean): Cara[] {
  if (mostrador) return [cara(pintura.marino, [76, 65, 0], [230, 65, 0], [241, 120, 0], [83, 120, 0])];
  return asientos.map(a => {
    const [x, y] = centroCelda(a.celda);
    const vertices = Array.from({ length: 32 }, (_, i): Punto3D => [
      x + 7 + 38 * Math.cos(i * Math.PI / 16), y + 9 + 32 * Math.sin(i * Math.PI / 16), 0,
    ]);
    return { color: pintura.marino, vertices };
  });
}

export function paredes(c: Camara): Cara[] {
  const { ancho: w, fondo: d } = c;
  const lateral = c.grados >= 0 ? 0 : w;
  const piezas = [
    cara(pintura.gris, [lateral, 0, 0], [lateral, d, 0], [lateral, d, 24], [lateral, 0, 24]),
    cara(pintura.claro, [0, 0, 0], [w, 0, 0], [w, 0, 52], [0, 0, 52]),
    cara(pintura.azul, [0, 0, 48], [w, 0, 48], [w, 0, 52], [0, 0, 52]),
  ];
  // Celosías y tres ventanas altas en la pared del fondo.
  for (let i = 0; i < 3; i++) {
    const x = w * (.09 + i * .29), ancho = w * .21;
    piezas.push(cara(pintura.sombra, [x, 1, 15], [x + ancho, 1, 15], [x + ancho, 1, 40], [x, 1, 40]));
    for (let j = 0; j < 3; j++) {
      const a = x + 2 + j * (ancho - 3) / 3, b = a + (ancho - 3) / 3 - 2;
      piezas.push(cara(pintura.blanco, [a, 2, 18], [b, 2, 18], [b, 2, 37], [a, 2, 37]));
    }
  }
  return piezas;
}

export function mueblesMesa(asiento: Asiento) {
  const [x, y] = centroCelda(asiento.celda);
  const tapiz = tapices[asiento.estado];
  const muebles: Mueble[] = [];
  for (const [dx, dy] of [[0, -38], [0, 38], [-38, 0], [38, 0]]) {
    const a = x + dx, b = y + dy;
    muebles.push(bloque(a - 6, b - 6, 0, 12, 12, 12, pintura.marino, pintura.gris, pintura.sombra),
      bloque(a - 10, b - 10, 12, 20, 20, 4, tapiz, pintura.sombra, pintura.sombra),
      bloque(a + (dx > 0 ? 7 : -10), b + (dy > 0 ? 7 : -10), 15, dx === 0 ? 20 : 3, dy === 0 ? 20 : 3, 14, tapiz, tapiz, pintura.sombra));
  }
  const tablero = cilindro(x, y, 27, 28, 5, pintura.crema, pintura.madera);
  // Las servilletas están sobre la tapa y dejan libre su centro para el número.
  const servicio = bloque(x - 19, y - 6, 32, 5, 12, .8, pintura.blanco, pintura.gris, pintura.gris);
  tablero.caras.push(...servicio.caras);
  muebles.push(cilindro(x, y, 0, 12, 3, pintura.sombra, pintura.marino),
    bloque(x - 3, y - 3, 3, 6, 6, 24, pintura.sombra, pintura.marino, pintura.azul),
    tablero);
  return muebles;
}

export function mueblesMostrador() {
  const p = pintura;
  const piezas = [
    bloque(80, 60, 0, 140, 48, 35, p.madera, p.azul, p.marino),
    bloque(76, 57, 35, 148, 54, 5, p.crema, p.madera, p.madera),
    bloque(104, 66, 40, 18, 12, 2, p.marino, p.azul, p.marino),
    bloque(110, 69, 42, 5, 4, 7, p.azul, p.marino, p.marino),
    bloque(99, 67, 49, 28, 4, 18, p.sombra, p.marino, p.azul),
    bloque(102, 71, 52, 22, 1, 12, p.claro, p.claro, p.claro),
    bloque(177, 68, 40, 14, 10, 17, p.madera, p.crema, p.madera),
    bloque(181, 71, 57, 6, 2, 4, p.madera, p.madera, p.madera),
  ];
  for (let x = 88; x < 217; x += 10) piezas.push(bloque(x, 108, 4, 2, 1, 27, p.claro, p.sombra, p.marino));
  return piezas;
}

export function maceta(x: number, y: number): Mueble {
  const base = cilindro(x, y, 0, 9, 13, pintura.madera, pintura.crema);
  for (let i = 0; i < 9; i++) {
    const a = i * Math.PI * 2 / 9, r = i % 2 ? 10 : 7, z = i % 2 ? 28 : 34;
    base.caras.push(cara(i % 2 ? pintura.verde : "var(--color-acento)", [x, y, 12], [x + Math.cos(a + .5) * r, y + Math.sin(a + .5) * r, 22],
      [x + Math.cos(a) * r * 1.3, y + Math.sin(a) * r * 1.3, z], [x + Math.cos(a - .5) * r, y + Math.sin(a - .5) * r, 21]));
  }
  return base;
}
