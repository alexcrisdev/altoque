// US-088. Lógica incorporada en el nodo Code del JSON por generar-boleta.mjs.
// No lee credenciales, variables del servidor ni realiza peticiones.
export function prepararBoleta(aviso, ahora = new Date()) {
  const reserva = aviso?.comprobante;
  if (aviso?.version !== 2 || aviso.evento !== "pago_confirmado" || aviso.cuenta?.saldo_restante !== "0.00"
    || !reserva || reserva.is_test !== true || reserva.estado === "EMITIDO") return null;
  if (!/^B[A-Z0-9]{3}$/.test(reserva.serie) || !Number.isInteger(reserva.numero) || reserva.numero < 1 || reserva.numero > 99999999) {
    throw new Error("Reserva de boleta inválida");
  }
  if (!Array.isArray(aviso.platos) || !aviso.platos.length) throw new Error("Cuenta sin platos");
  const centimos = (texto) => {
    if (typeof texto !== "string" || !/^\d+\.\d{2}$/.test(texto)) throw new Error("Monto inválido");
    const valor = Math.round(Number(texto) * 100);
    if (!Number.isSafeInteger(valor)) throw new Error("Monto fuera de rango");
    return valor;
  };
  let total = 0;
  let neto = 0;
  const items = aviso.platos.map((plato) => {
    const bruto = centimos(plato.subtotal);
    const unitario = centimos(plato.precio_unitario);
    if (!Number.isInteger(plato.cantidad) || plato.cantidad <= 0 || unitario <= 0
      || bruto !== unitario * plato.cantidad || typeof plato.nombre !== "string" || !plato.nombre.trim()) throw new Error("Plato inválido");
    const base = Math.round(bruto * 100 / 118);
    total += bruto;
    neto += base;
    return {
      unidad_de_medida: "NIU", descripcion: plato.nombre, cantidad: plato.cantidad,
      valor_unitario: Number((unitario / 118).toFixed(10)), precio_unitario: unitario / 100,
      subtotal: base / 100, tipo_de_igv: 1, igv: (bruto - base) / 100, total: bruto / 100,
      anticipo_regularizacion: false,
    };
  });
  if (total <= 0 || total >= 70000) throw new Error("Boleta VARIOS solo para importes menores de S/ 700");
  const fecha = new Date(ahora);
  if (!Number.isFinite(fecha.getTime())) throw new Error("Fecha de pago inválida");
  const partes = new Intl.DateTimeFormat("en-GB", { timeZone: "America/Lima", year: "numeric", month: "2-digit", day: "2-digit" }).format(fecha).split("/");
  return {
    operacion: "generar_comprobante", tipo_de_comprobante: 2,
    serie: reserva.serie, numero: reserva.numero, sunat_transaction: 1,
    cliente_tipo_de_documento: "-", cliente_numero_de_documento: "-", cliente_denominacion: "VARIOS",
    fecha_de_emision: partes.join("-"), moneda: 1, porcentaje_de_igv: 18,
    total_gravada: neto / 100, total_igv: (total - neto) / 100, total: total / 100,
    enviar_automaticamente_al_cliente: false, enviar_automaticamente_a_la_sunat: false,
    observaciones: "COMPROBANTE DE PRUEBA SIN VALOR TRIBUTARIO", items,
  };
}

export function resultadoNubefact(respuesta, aviso) {
  const reserva = aviso.comprobante;
  const body = respuesta?.body ?? respuesta;
  // Code se ejecuta en un sandbox: no depende de URL ni de módulos adicionales.
  // AlToque vuelve a validar los enlaces con URL antes de guardarlos.
  const segura = (valor) => typeof valor === "string" && valor.length <= 2048
    && /^https:\/\/[a-z0-9.-]+(?::443)?\/[^\s]*$/i.test(valor);
  const correcto = !body?.errors && body?.serie === reserva.serie && Number(body?.numero) === reserva.numero
    && segura(body?.enlace_del_pdf) && segura(body?.enlace_del_xml);
  return {
    pago_id: aviso.id, serie: reserva.serie, numero: reserva.numero,
    estado: correcto ? "EMITIDO" : "ERROR",
    enlace_pdf: correcto ? body.enlace_del_pdf : null,
    enlace_xml: correcto ? body.enlace_del_xml : null,
  };
}
