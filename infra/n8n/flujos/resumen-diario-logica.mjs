// El generador incorpora esta función al nodo Code de n8n.
// No consulta datos ni envía correos.
export function crearMensajeResumenDiario(resumen) {
  const texto = valor => {
    if (typeof valor !== "string" || !valor.trim()) {
      throw new Error("Texto del resumen inválido.");
    }
    return valor;
  };

  const entero = valor => {
    if (!Number.isSafeInteger(valor) || valor < 0) {
      throw new Error("Cantidad del resumen inválida.");
    }
    return valor;
  };

  const centimos = valor => {
    if (
      typeof valor !== "number" ||
      !Number.isFinite(valor) ||
      valor < 0 ||
      !Number.isSafeInteger(Math.round(valor * 100)) ||
      Math.abs(valor * 100 - Math.round(valor * 100)) > 0.000001
    ) {
      throw new Error("Importe del resumen inválido.");
    }
    return Math.round(valor * 100);
  };

  const moneda = valor =>
    `S/ ${(centimos(valor) / 100).toLocaleString("es-PE", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;

  const escapar = valor =>
    texto(valor).replace(/[&<>"']/g, caracter => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    })[caracter]);

  const fechaValida = valor => {
    if (
      typeof valor !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(valor) ||
      valor.startsWith("0000-")
    ) {
      throw new Error("Fecha del resumen inválida.");
    }

    const fecha = new Date(`${valor}T12:00:00Z`);

    if (
      !Number.isFinite(fecha.getTime()) ||
      fecha.toISOString().slice(0, 10) !== valor
    ) {
      throw new Error("Fecha del resumen inválida.");
    }

    return valor;
  };

  const nombre = texto(resumen?.restaurante?.nombre);
  const fecha = fechaValida(resumen.fecha);
  const pedidos = entero(resumen.pedidos);
  const metodos = resumen.ventas_por_metodo;

  const filas = [
    ["Efectivo", metodos?.efectivo],
    ["Yape", metodos?.yape],
    ["Tarjeta en caja", metodos?.tarjeta_caja],
    ["Tarjeta en línea", metodos?.tarjeta_en_linea],
  ];

  const total = moneda(resumen.total_vendido);

  if (
    filas.reduce(
      (suma, [, monto]) => suma + centimos(monto),
      0,
    ) !== centimos(resumen.total_vendido)
  ) {
    throw new Error(
      "El desglose no coincide con el total vendido.",
    );
  }

  const plato = resumen.plato_mas_vendido;

  const masVendido = plato === null
    ? "Sin pedidos no cancelados."
    : `${texto(plato?.nombre)} · ${entero(plato?.cantidad)} unidades`;

  const cierres = resumen.cierres_con_excepcion;
  const cantidadCierres = entero(cierres?.cantidad);

  if (
    !Array.isArray(cierres.motivos) ||
    cierres.motivos.length !== cantidadCierres
  ) {
    throw new Error("Cierres del resumen inválidos.");
  }

  const motivos = cierres.motivos.map(texto);

  if (
    !Array.isArray(resumen.manana_prepara) ||
    resumen.manana_prepara.length > 3
  ) {
    throw new Error("Predicciones del resumen inválidas.");
  }

  const manana = new Date(`${fecha}T12:00:00Z`);
  manana.setUTCDate(manana.getUTCDate() + 1);

  const fechaManana = manana.toISOString().slice(0, 10);

  const dia = new Intl.DateTimeFormat("es-PE", {
    timeZone: "America/Lima",
    weekday: "long",
  }).format(manana);

  const previstos = resumen.manana_prepara.map(plato => {
    if (
      plato.fecha !== fechaManana ||
      plato.dia !== dia
    ) {
      throw new Error(
        "La predicción no corresponde a mañana.",
      );
    }

    texto(plato.modelo);

    return `~${entero(plato.cantidad)} ${texto(plato.nombre)}`;
  });

  const preparacion = previstos.length
    ? `Mañana ${dia}: prepara ${previstos.join(", ")}`
    : "";

  const demo = resumen.manana_prepara.some(
    plato => plato.modelo.endsWith("-demo"),
  );

  const lineas = [
    `${nombre} · Resumen del ${fecha} (hora de Lima)`,
    `Total vendido: ${total}`,
    `Pedidos no cancelados: ${pedidos}`,
    ...filas.map(
      ([metodo, monto]) => `${metodo}: ${moneda(monto)}`,
    ),
    `Plato más vendido: ${masVendido}`,
    `Cierres con excepción: ${cantidadCierres}`,
    ...motivos.map(motivo => `- ${motivo}`),
    "Corte: datos disponibles al ejecutar el resumen. Ventas por confirmación; pedidos por creación.",
    ...(demo
      ? ["Preparación basada en predicciones de demostración con fechas desplazadas."]
      : []),
    ...(preparacion ? [preparacion] : []),
  ];

  const html =
    `<html lang="es"><body style="margin:0;background:#FAF8F5;color:#1E2A3B;font-family:Arial,sans-serif;padding:20px">`
    + `<div style="max-width:600px;margin:auto">`
    + `<h1 style="font-size:24px;color:#1E2A3B">${escapar(nombre)}</h1>`
    + `<p>Resumen del ${fecha} · hora de Lima</p>`
    + `<p>Total vendido</p>`
    + `<p style="font-size:30px;font-weight:bold;color:#E5634D">${total}</p>`
    + `<p>Pedidos no cancelados: <strong>${pedidos}</strong></p>`
    + `<table style="width:100%;border-collapse:collapse">`
    + filas.map(([metodo, monto]) =>
      `<tr><th scope="row" style="text-align:left;padding:8px 0">${metodo}</th>`
      + `<td style="text-align:right">${moneda(monto)}</td></tr>`,
    ).join("")
    + `</table>`
    + `<p><strong>Plato más vendido:</strong> ${escapar(masVendido)}</p>`
    + `<p><strong>Cierres con excepción:</strong> ${cantidadCierres}</p>`
    + (motivos.length
      ? `<ul>${motivos.map(
          motivo => `<li>${escapar(motivo)}</li>`,
        ).join("")}</ul>`
      : "")
    + `<p style="font-size:12px">Corte: datos disponibles al ejecutar el resumen. Ventas por confirmación; pedidos por creación.</p>`
    + (demo
      ? "<p>Preparación basada en predicciones de demostración con fechas desplazadas.</p>"
      : "")
    + (preparacion
      ? `<p style="font-weight:bold">${escapar(preparacion)}</p>`
      : "")
    + "</div></body></html>";

  return {
    asunto: `AlToque · ${nombre.replace(/[\r\n]/g, " ")} · ${fecha}`,
    texto: lineas.join("\n"),
    html,
  };
}