export type FilaVentaCsv = {
  fechaHora: string;
  pagoId: string;
  cuentaId: string;
  modalidad: string;
  importeCentimos: number;
};

function protegerFormula(valor: string): string {
  // Excel puede ignorar espacios y controles antes de interpretar una fórmula.
  return /^[\s\u0000-\u001f\u007f-\u009f]*[=+\-@＝＋－＠]/u.test(valor)
    ? `'${valor}`
    : valor;
}

function escaparCampo(valor: string): string {
  return `"${protegerFormula(valor).replaceAll('"', '""')}"`;
}

export function crearCsvVentas(filas: readonly FilaVentaCsv[]): string {
  const cabecera = [
    "Fecha y hora de confirmación",
    "ID del pago",
    "ID de cuenta o pedido",
    "Modalidad del pedido",
    "Importe del pago (S/)",
  ];
  const registros = filas.map((fila) => {
    if (!Number.isSafeInteger(fila.importeCentimos) || fila.importeCentimos <= 0) {
      throw new Error("El pago contiene un importe inválido.");
    }
    return [
      escaparCampo(fila.fechaHora),
      escaparCampo(fila.pagoId),
      escaparCampo(fila.cuentaId),
      escaparCampo(fila.modalidad),
      (fila.importeCentimos / 100).toFixed(2),
    ].join(",");
  });

  return `\uFEFF${[cabecera.map(escaparCampo).join(","), ...registros].join("\r\n")}\r\n`;
}

export function fechaNombreCsv(fecha: Date): string {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(fecha);
  const valor = (tipo: string) => partes.find((parte) => parte.type === tipo)?.value ?? "";
  return `${valor("year")}-${valor("month")}-${valor("day")}`;
}

export function fechaHoraLima(fecha: string): string {
  return new Intl.DateTimeFormat("es-PE", {
    timeZone: "America/Lima", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  }).format(new Date(fecha));
}
