import { AvisoAlergia } from "../pedidos/aviso-alergia";
import { formatearPrecio } from "../carta/formato";
import { ETIQUETA_ESTADO } from "../pedidos/estados";
import {
  ETIQUETA_ESTADO_PAGO,
  etiquetaMetodoPago,
  subtotalCentimos,
  type PagoCuenta,
  type ResumenCuenta,
} from "./cuenta-logica";
import type { CuentaACobrar } from "./pago-logica";
import { VerificarPago } from "./verificar-pago";
import { Insignia } from "../../components/ui";
import type { ComprobanteCuenta } from "./comprobante-logica";

// US-021: detalle de la cuenta (lo mismo para mesa y para llevar).

const soles = (centimos: number) => formatearPrecio(centimos / 100);

function hora(fecha: string) {
  return new Date(fecha).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit", timeZone: "America/Lima" });
}

// Quién puede verificar Yape en esta cuenta (US-023). Sin esto, la lista es solo lectura.
type Verificacion = { cuenta: CuentaACobrar; puedeVerificar: boolean };

function FilaPago({ pago, verificacion }: { pago: PagoCuenta; verificacion?: Verificacion }) {
  const verificable = pago.estado === "PENDING" && pago.metodo === "YAPE";
  return (
    <li className="py-2">
      <div className="flex justify-between gap-3">
        <span className="min-w-0 break-words">
          {etiquetaMetodoPago(pago)} · {hora(pago.creadoEn)} · {ETIQUETA_ESTADO_PAGO[pago.estado]}
          {pago.recibidoCentimos != null && (
            <span className="block text-sm text-texto-suave">
              Recibido {soles(pago.recibidoCentimos)} · vuelto {soles(pago.vueltoCentimos ?? 0)}
            </span>
          )}
          {pago.referencia && (
            <span className="block text-sm text-texto-suave">
              {pago.stripe ? "Ref. Stripe" : pago.metodo === "CARD" ? "Voucher" : "Operación"} {pago.referencia}
            </span>
          )}
          {pago.registradoPor && (
            <span className="block text-sm text-texto-suave">Registrado por {pago.registradoPor}</span>
          )}
          {pago.verificadoPor && pago.verificadoEn && (
            <span className="block text-sm text-texto-suave">
              {pago.estado === "CONFIRMED" ? "Confirmado" : "Rechazado"} por {pago.verificadoPor} a las {hora(pago.verificadoEn)}
            </span>
          )}
        </span>
        <span className="shrink-0 font-semibold tabular-nums">{soles(pago.montoCentimos)}</span>
      </div>
      {verificable && pago.capturaId && verificacion?.puedeVerificar && <p className="mt-2"><a href="/caja" className="font-semibold underline">Verificar captura Yape/Plin en caja</a></p>}
      {verificable && !pago.capturaId && verificacion?.puedeVerificar && <VerificarPago cuenta={verificacion.cuenta} pagoId={pago.id} />}
      {/* US-106: solo caja confirma; los demás solo ven que falta. */}
      {verificable && verificacion && !verificacion.puedeVerificar && (
        <p className="mt-1 text-sm text-aviso-texto">Pendiente: caja debe confirmar este Yape/Plin.</p>
      )}
    </li>
  );
}

export function DetalleCuenta({
  cuenta,
  cerrada = false,
  verificacion,
}: {
  cuenta: ResumenCuenta & { comprobante?: ComprobanteCuenta | null };
  cerrada?: boolean;
  verificacion?: Verificacion;
}) {
  const saldo = cuenta.saldoCentimos;

  return (
    <div className="detalle-cuenta mt-6 grid items-start gap-6 lg:grid-cols-[1.25fr_1fr]">
      {cuenta.comprobante?.is_test && <section aria-label="Boleta de prueba" className="rounded-xl border border-info-borde bg-info-fondo p-4 text-texto lg:col-span-2">
        <Insignia tono="info">Boleta {cuenta.comprobante.series}-{cuenta.comprobante.number} (prueba)</Insignia>
        {cuenta.comprobante.status === "EMITIDO" && cuenta.comprobante.pdf_url
          ? <a className="ml-2 inline-flex min-h-11 items-center font-semibold underline" href={cuenta.comprobante.pdf_url} target="_blank" rel="noopener noreferrer">Ver PDF</a>
          : <p className="mt-2">{cuenta.comprobante.status === "ERROR" ? "No se pudo emitir. El pago sigue registrado; avisa al administrador." : "Emisión pendiente."}</p>}
        <p className="mt-2 text-sm">Comprobante de prueba, sin valor tributario</p>
      </section>}
      <section aria-labelledby="consumos" className="min-w-0 lg:row-span-2">
        <h2 id="consumos" className="text-xl font-semibold">Consumos</h2>
        {cuenta.pedidos.length === 0 ? (
          <p className="mt-3 rounded-lg border p-4 text-texto-suave">Esta cuenta todavía no tiene pedidos.</p>
        ) : (
          <ul className="mt-3 grid gap-3">
            {cuenta.pedidos.map((pedido) => (
              <li key={pedido.id} className="rounded-2xl border border-borde bg-superficie p-4">
                <p className="flex flex-wrap justify-between gap-2 font-semibold">
                  <span>N.º {pedido.numero} · {hora(pedido.creadoEn)}</span>
                  <span className="text-sm font-normal text-texto-suave">{ETIQUETA_ESTADO[pedido.estado]}</span>
                </p>
                <div tabIndex={0} role="region" aria-label={`Consumos del pedido ${pedido.numero}`} className="tabla-consumos mt-3 overflow-x-auto rounded-lg">
                <table className="w-full text-sm">
                  <thead className="sr-only">
                    <tr><th scope="col">Producto</th><th scope="col">Precio unitario</th><th scope="col">Importe</th></tr>
                  </thead>
                  <tbody>
                    {pedido.lineas.map((linea, i) => (
                      <tr key={i} className="align-top">
                        <td className="py-1">
                          {linea.cantidad} × {linea.nombre}
                          {linea.observacion && <span className="block text-texto-suave">“{linea.observacion}”</span>}
                        </td>
                        <td className="py-1 text-right text-texto-suave">{soles(linea.precioUnitarioCentimos)}</td>
                        <td className="w-24 py-1 text-right">{soles(subtotalCentimos(linea))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table></div>
      <AvisoAlergia alergia={pedido.alergia} />
                <p className="mt-2 text-right font-semibold">Subtotal {soles(pedido.totalCentimos)}</p>
              </li>
            ))}
          </ul>
        )}
        {cuenta.cancelados.length > 0 && (
          <p className="mt-3 text-sm text-texto-suave">
            No se cobran {cuenta.cancelados.length} pedido(s) cancelado(s):{" "}
            {cuenta.cancelados.map((p) => `N.º ${p.numero}`).join(", ")}.
          </p>
        )}
      </section>

      <section aria-labelledby="pagos" className="min-w-0 rounded-2xl border border-borde bg-superficie p-5">
        <h2 id="pagos" className="text-xl font-semibold">Pagos</h2>
        {cuenta.pagosConfirmados.length === 0 && cuenta.pagosNoVerificados.length === 0 ? (
          <p className="mt-3 text-texto-suave">Todavía no hay pagos registrados.</p>
        ) : (
          <ul className="mt-2 divide-y">
            {cuenta.pagosConfirmados.map((pago) => <FilaPago key={pago.id} pago={pago} />)}
          </ul>
        )}
        {cuenta.pagosNoVerificados.length > 0 && (
          <>
            <p className="mt-3 text-sm font-medium text-aviso-texto">No descuentan del saldo (por verificar o rechazados):</p>
            <ul className="divide-y text-sm text-aviso-texto">
              {cuenta.pagosNoVerificados.map((pago) => (
                <FilaPago key={pago.id} pago={pago} verificacion={cerrada ? undefined : verificacion} />
              ))}
            </ul>
          </>
        )}
      </section>

      <section aria-label="Resumen de la cuenta" className="rounded-2xl border border-info-borde bg-info-fondo p-5 tabular-nums lg:col-start-2">
        <dl className="grid grid-cols-2 gap-y-1">
          <dt>Consumo</dt>
          <dd className="text-right">{soles(cuenta.consumoCentimos)}</dd>
          <dt>Pagado</dt>
          <dd className="text-right">− {soles(cuenta.pagadoCentimos)}</dd>
          <dt className="pt-3 text-xl font-bold">Saldo pendiente</dt>
          <dd className={`pt-3 text-right text-xl font-bold ${saldo > 0 ? "text-peligro-texto" : "text-exito-texto"}`}>
            {soles(Math.max(saldo, 0))}
          </dd>
        </dl>
        {saldo < 0 && (
          <p className="mt-2 text-sm text-aviso-texto">Saldo a favor del cliente: {soles(-saldo)}.</p>
        )}
        <p className="mt-3 text-sm text-texto-suave">
          {cerrada
            ? "Esta cuenta ya está cerrada."
            : verificacion?.cuenta.tipo === "MESA" && cuenta.pedidosSinEntregar > 0
              ? "Hay pedidos sin entregar: no se puede cerrar la mesa hasta entregarlos o cancelarlos."
              : cuenta.puedeCerrar
              ? "La cuenta no tiene saldo pendiente: se puede cerrar."
              : saldo > 0
                ? "No se puede cerrar la cuenta mientras haya saldo pendiente."
                : "Antes de cerrar, confirma o rechaza los pagos Yape por verificar."}
        </p>
      </section>
    </div>
  );
}
