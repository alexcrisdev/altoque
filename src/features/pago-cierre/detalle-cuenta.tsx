import { formatearPrecio } from "@/features/carta/formato";
import { ETIQUETA_ESTADO } from "@/features/pedidos/estados";
import {
  ETIQUETA_ESTADO_PAGO,
  ETIQUETA_METODO,
  subtotalCentimos,
  type PagoCuenta,
  type ResumenCuenta,
} from "./cuenta-logica";
import type { CuentaACobrar } from "./pago-logica";
import { VerificarPago } from "./verificar-pago";

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
        <span>
          {ETIQUETA_METODO[pago.metodo]} · {hora(pago.creadoEn)} · {ETIQUETA_ESTADO_PAGO[pago.estado]}
          {pago.recibidoCentimos != null && (
            <span className="block text-sm text-zinc-600">
              Recibido {soles(pago.recibidoCentimos)} · vuelto {soles(pago.vueltoCentimos ?? 0)}
            </span>
          )}
          {pago.referencia && <span className="block text-sm text-zinc-600">Operación {pago.referencia}</span>}
          {pago.verificadoPor && pago.verificadoEn && (
            <span className="block text-sm text-zinc-600">
              {pago.estado === "CONFIRMED" ? "Confirmado" : "Rechazado"} por {pago.verificadoPor} a las {hora(pago.verificadoEn)}
            </span>
          )}
        </span>
        <span className="font-medium">{soles(pago.montoCentimos)}</span>
      </div>
      {verificable && verificacion?.puedeVerificar && <VerificarPago cuenta={verificacion.cuenta} pagoId={pago.id} />}
      {verificable && verificacion && !verificacion.puedeVerificar && (
        <p className="mt-1 text-sm text-amber-900">Pide a caja o al administrador que confirme este Yape.</p>
      )}
    </li>
  );
}

export function DetalleCuenta({
  cuenta,
  cerrada = false,
  verificacion,
}: {
  cuenta: ResumenCuenta;
  cerrada?: boolean;
  verificacion?: Verificacion;
}) {
  const saldo = cuenta.saldoCentimos;

  return (
    <div className="mt-6 grid gap-6">
      <section aria-labelledby="consumos">
        <h2 id="consumos" className="text-xl font-semibold">Consumos</h2>
        {cuenta.pedidos.length === 0 ? (
          <p className="mt-3 rounded-lg border p-4 text-zinc-700">Esta cuenta todavía no tiene pedidos.</p>
        ) : (
          <ul className="mt-3 grid gap-3">
            {cuenta.pedidos.map((pedido) => (
              <li key={pedido.id} className="rounded-xl border p-4">
                <p className="flex flex-wrap justify-between gap-2 font-semibold">
                  <span>N.º {pedido.numero} · {hora(pedido.creadoEn)}</span>
                  <span className="text-sm font-normal text-zinc-600">{ETIQUETA_ESTADO[pedido.estado]}</span>
                </p>
                <table className="mt-2 w-full text-sm">
                  <thead className="sr-only">
                    <tr><th>Producto</th><th>Precio unitario</th><th>Importe</th></tr>
                  </thead>
                  <tbody>
                    {pedido.lineas.map((linea, i) => (
                      <tr key={i} className="align-top">
                        <td className="py-1">
                          {linea.cantidad} × {linea.nombre}
                          {linea.observacion && <span className="block text-zinc-600">“{linea.observacion}”</span>}
                        </td>
                        <td className="py-1 text-right text-zinc-600">{soles(linea.precioUnitarioCentimos)}</td>
                        <td className="w-24 py-1 text-right">{soles(subtotalCentimos(linea))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="mt-2 text-right font-semibold">Subtotal {soles(pedido.totalCentimos)}</p>
              </li>
            ))}
          </ul>
        )}
        {cuenta.cancelados.length > 0 && (
          <p className="mt-3 text-sm text-zinc-600">
            No se cobran {cuenta.cancelados.length} pedido(s) cancelado(s):{" "}
            {cuenta.cancelados.map((p) => `N.º ${p.numero}`).join(", ")}.
          </p>
        )}
      </section>

      <section aria-labelledby="pagos">
        <h2 id="pagos" className="text-xl font-semibold">Pagos</h2>
        {cuenta.pagosConfirmados.length === 0 && cuenta.pagosNoVerificados.length === 0 ? (
          <p className="mt-3 text-zinc-700">Todavía no hay pagos registrados.</p>
        ) : (
          <ul className="mt-2 divide-y">
            {cuenta.pagosConfirmados.map((pago) => <FilaPago key={pago.id} pago={pago} />)}
          </ul>
        )}
        {cuenta.pagosNoVerificados.length > 0 && (
          <>
            <p className="mt-3 text-sm font-medium text-amber-900">No descuentan del saldo hasta confirmarse:</p>
            <ul className="divide-y text-sm text-amber-900">
              {cuenta.pagosNoVerificados.map((pago) => (
                <FilaPago key={pago.id} pago={pago} verificacion={cerrada ? undefined : verificacion} />
              ))}
            </ul>
          </>
        )}
      </section>

      <section aria-label="Resumen de la cuenta" className="rounded-xl border-2 p-4">
        <dl className="grid grid-cols-2 gap-y-1">
          <dt>Consumo</dt>
          <dd className="text-right">{soles(cuenta.consumoCentimos)}</dd>
          <dt>Pagado</dt>
          <dd className="text-right">− {soles(cuenta.pagadoCentimos)}</dd>
          <dt className="pt-2 text-lg font-bold">Saldo pendiente</dt>
          <dd className={`pt-2 text-right text-lg font-bold ${saldo > 0 ? "text-red-700" : "text-emerald-800"}`}>
            {soles(Math.max(saldo, 0))}
          </dd>
        </dl>
        {saldo < 0 && (
          <p className="mt-2 text-sm text-amber-900">Saldo a favor del cliente: {soles(-saldo)}.</p>
        )}
        <p className="mt-3 text-sm text-zinc-700">
          {cerrada
            ? "Esta cuenta ya está cerrada."
            : cuenta.puedeCerrar
              ? "La cuenta no tiene saldo pendiente: se puede cerrar."
              : "No se puede cerrar la cuenta mientras haya saldo pendiente."}
        </p>
      </section>
    </div>
  );
}
