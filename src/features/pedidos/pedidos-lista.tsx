import type { PedidoListado } from "./pedidos";
import { formatearPrecio } from "../carta/formato";

const fechaHora = new Intl.DateTimeFormat("es-PE", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "America/Lima",
});

const estados: Record<PedidoListado["estado"], string> = {
  PENDING: "Pendiente",
  IN_PROGRESS: "En preparación",
  READY: "Listo",
  DELIVERED: "Entregado",
  CANCELLED: "Cancelado",
};

export function PedidosLista({ pedidos }: { pedidos: PedidoListado[] }) {
  return (
    <section aria-labelledby="pedidos-titulo" className="mt-8">
      <h2 id="pedidos-titulo" className="text-xl font-semibold">Pedidos recibidos</h2>
      {pedidos.length === 0 ? (
        <p className="mt-3 rounded-lg border p-4 text-zinc-700">Todavía no hay pedidos.</p>
      ) : (
        <ul className="mt-4 grid gap-4">
          {pedidos.map((pedido) => (
            <li key={pedido.id} className="rounded-xl border p-4">
              <header className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg font-bold">Pedido #{pedido.numero}</h3>
                  <p className="text-sm text-zinc-600">
                    {pedido.modalidad === "DINE_IN" ? `En mesa${pedido.mesa === null ? "" : ` ${pedido.mesa}`}` : "Para llevar"}
                  </p>
                  <time dateTime={pedido.creadoEn} className="text-sm text-zinc-600">{fechaHora.format(new Date(pedido.creadoEn))}</time>
                </div>
                <span className="rounded-full bg-amber-50 px-3 py-1 text-sm font-semibold text-amber-900">{estados[pedido.estado]}</span>
              </header>

              <ul aria-label={`Productos del pedido ${pedido.numero}`} className="mt-4 divide-y">
                {pedido.lineas.map((linea) => (
                  <li key={linea.id} className="py-3">
                    <div className="flex flex-wrap justify-between gap-2">
                      <span className="font-medium">{linea.cantidad} × {linea.producto}</span>
                      <span>{formatearPrecio(linea.subtotal)}</span>
                    </div>
                    <p className="text-sm text-zinc-600">Precio unitario: {formatearPrecio(linea.precioUnitario)}</p>
                    <p className="text-sm text-zinc-600">Observación: {linea.observacion || "Sin observaciones"}</p>
                  </li>
                ))}
              </ul>

              <p className="border-t pt-3 text-right font-bold">Total: {formatearPrecio(pedido.total)}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
