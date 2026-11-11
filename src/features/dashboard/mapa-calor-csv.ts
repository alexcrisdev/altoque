import type { PedidoMapa } from "./mapa-calor-logica";

export type DatosMapaCsv = {
  pedidos: PedidoMapa[];
  productos: { id: string; nombre: string }[];
  desde: string;
  hasta: string;
};

function leerCsv(texto: string): Record<string, string>[] {
  if (!texto.trim() || texto.length > 5_000_000) {
    throw new Error("El CSV está vacío o supera el límite de 5 millones de caracteres.");
  }

  const filas: string[][] = [];
  let fila: string[] = [];
  let campo = "";
  let citado = false;
  let cerrado = false;

  function guardarCampo() {
    fila.push(campo);
    campo = "";
    cerrado = false;
  }

  function guardarFila() {
    guardarCampo();
    if (fila.some((valor) => valor !== "")) filas.push(fila);
    fila = [];

    if (filas.length > 50_001) {
      throw new Error("El CSV supera las 50 000 filas.");
    }
  }

  const contenido = texto.replace(/^\uFEFF/, "");

  for (let i = 0; i < contenido.length; i++) {
    const caracter = contenido[i];

    if (citado) {
      if (caracter === '"') {
        if (contenido[i + 1] === '"') {
          campo += '"';
          i++;
        } else {
          citado = false;
          cerrado = true;
        }
      } else {
        campo += caracter;
      }
    } else if (caracter === ",") {
      guardarCampo();
    } else if (caracter === "\n" || caracter === "\r") {
      guardarFila();
      if (caracter === "\r" && contenido[i + 1] === "\n") i++;
    } else if (caracter === '"' && campo === "" && !cerrado) {
      citado = true;
    } else {
      if (cerrado || caracter === '"') {
        throw new Error("El CSV tiene comillas inválidas.");
      }

      campo += caracter;
    }
  }

  if (citado) {
    throw new Error("El CSV contiene comillas sin cerrar.");
  }

  if (campo !== "" || fila.length > 0 || cerrado) guardarFila();

  const cabecera = filas.shift();

  if (
    !cabecera ||
    cabecera.some((columna) => !columna.trim()) ||
    new Set(cabecera).size !== cabecera.length
  ) {
    throw new Error("La cabecera del CSV no es válida.");
  }

  return filas.map((valores) => {
    if (valores.length !== cabecera.length) {
      throw new Error("Una fila no coincide con las columnas del CSV.");
    }

    return Object.fromEntries(
      cabecera.map((nombre, indice) => [nombre, valores[indice]]),
    );
  });
}

function exigirColumnas(texto: string, columnas: string[]) {
  const filas = leerCsv(texto);

  if (filas.length === 0) {
    throw new Error("El CSV no contiene registros.");
  }

  if (columnas.some((columna) => !Object.hasOwn(filas[0], columna))) {
    throw new Error(`Faltan columnas: ${columnas.join(", ")}.`);
  }

  return filas;
}

function fechaLima(fecha: string): string {
  // US-074 exporta fechas locales con precisión de minutos, sin zona.
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(fecha)) {
    throw new Error("Las fechas deben tener el formato AAAA-MM-DDTHH:MM de US-074.");
  }

  const instante = Date.parse(`${fecha}-05:00`);

  if (
    !Number.isFinite(instante) ||
    new Date(instante - 5 * 3_600_000).toISOString().slice(0, 16) !== fecha
  ) {
    throw new Error("El CSV contiene una fecha inválida.");
  }

  return `${fecha}-05:00`;
}

export function leerPedidosSinteticos(
  textoPedidos: string,
  textoLineas: string,
): DatosMapaCsv {
  const filas = exigirColumnas(textoPedidos, [
    "pedido_id", "creado_en", "estado",
  ]);

  const lineas = exigirColumnas(textoLineas, [
    "pedido_id", "producto_id", "producto", "cantidad",
  ]);

  const pedidos = new Map<string, PedidoMapa>();
  const productos = new Map<string, string>();
  const estados = new Set([
    "PENDING", "ACCEPTED", "IN_PROGRESS",
    "READY", "DELIVERED", "CANCELLED",
  ]);

  for (const fila of filas) {
    if (
      !fila.pedido_id.trim() ||
      pedidos.has(fila.pedido_id) ||
      !estados.has(fila.estado)
    ) {
      throw new Error("Hay pedidos duplicados o con datos inválidos.");
    }

    pedidos.set(fila.pedido_id, {
      id: fila.pedido_id,
      creadoEn: fechaLima(fila.creado_en),
      cancelado: fila.estado === "CANCELLED",
      productos: [],
    });
  }

  for (const linea of lineas) {
    const pedido = pedidos.get(linea.pedido_id);
    const cantidad = Number(linea.cantidad);

    if (
      !pedido ||
      !linea.producto_id.trim() ||
      !linea.producto.trim() ||
      !/^\d+$/.test(linea.cantidad) ||
      !Number.isSafeInteger(cantidad) ||
      cantidad <= 0
    ) {
      throw new Error("Hay líneas inválidas o asociadas a un pedido inexistente.");
    }

    pedido.productos = [
      ...new Set([...pedido.productos, linea.producto_id]),
    ];

    if (!pedido.cancelado) {
      productos.set(linea.producto_id, linea.producto);
    }
  }

  const lista = [...pedidos.values()];

  if (lista.some((pedido) => pedido.productos.length === 0)) {
    throw new Error(
      "Hay pedidos sin líneas. Comprueba que ambos CSV sean de la misma generación.",
    );
  }

  const fechas = lista.map(
    (pedido) => pedido.creadoEn.slice(0, 10),
  ).sort();

  return {
    pedidos: lista,
    productos: [...productos]
      .map(([id, nombre]) => ({ id, nombre }))
      .sort((a, b) =>
        a.nombre.localeCompare(b.nombre, "es") ||
        a.id.localeCompare(b.id),
      ),
    desde: fechas[0],
    hasta: fechas[fechas.length - 1],
  };
}