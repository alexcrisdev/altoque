// US-099: panel del dueño en vivo y compacto (componente de servidor).
import { Insignia, Tarjeta } from "@/components/ui";
import { formatearPrecio } from "@/features/carta/formato";
import { ETIQUETA_METODO, type MetodoPago } from "@/features/pago-cierre/cuenta-logica";
import type { PanelVivo } from "./panel-vivo";
import { textoVariacion, type Comparacion } from "./panel-vivo-logica";

const METODOS: MetodoPago[] = ["CASH", "YAPE", "CARD"];
const soles = (centimos: number) => formatearPrecio(centimos / 100);

function Indicador({
  titulo, comparacion, formato, menosEsMejor = false,
}: {
  titulo: string; comparacion: Comparacion; formato: (n: number) => string; menosEsMejor?: boolean;
}) {
  const v = comparacion.variacionPct;
  const bueno = v === null || v === 0 ? null : menosEsMejor ? v < 0 : v > 0;
  return (
    <Tarjeta className="space-y-1 p-4">
      <p className="text-sm text-texto-suave">{titulo}</p>
      <p className="text-2xl font-bold tabular-nums">
        {comparacion.hoy === null ? "—" : formato(comparacion.hoy)}
      </p>
      <p className={`text-xs font-semibold ${
        bueno === null ? "text-texto-suave" : bueno ? "text-exito-texto" : "text-peligro-texto"
      }`}>
        {textoVariacion(comparacion)}
      </p>
    </Tarjeta>
  );
}

function VentasPorHora({ horas }: { horas: number[] }) {
  // Solo de 8:00 a 23:00, el horario típico de atención.
  const visibles = horas.slice(8, 24);
  const maximo = Math.max(...visibles, 1);
  const ancho = 320;
  const alto = 120;
  const barra = ancho / visibles.length;
  return (
    <figure>
      <svg viewBox={`0 0 ${ancho} ${alto + 16}`} role="img"
        aria-label="Ventas por hora de hoy" className="h-40 w-full">
        {visibles.map((valor, i) => {
          const h = Math.round((valor / maximo) * alto);
          return (
            <g key={i}>
              <rect x={i * barra + 2} y={alto - h} width={barra - 4} height={h} rx={2}
                className="fill-marca">
                <title>{`${i + 8}:00 · ${soles(valor)}`}</title>
              </rect>
              {i % 2 === 0 && (
                <text x={i * barra + barra / 2} y={alto + 12} textAnchor="middle"
                  className="fill-texto-suave text-[9px]">{i + 8}</text>
              )}
            </g>
          );
        })}
      </svg>
      <figcaption className="sr-only">
        {visibles.map((v, i) => `${i + 8}:00 ${soles(v)}`).join(", ")}
      </figcaption>
    </figure>
  );
}

const ESTILO_MESA = {
  LIBRE: { clase: "border-borde bg-superficie text-texto-suave", texto: "Libre" },
  OCUPADA: { clase: "border-info-borde bg-info-fondo text-info-texto", texto: "Ocupada" },
  ESPERA_PAGO: { clase: "border-aviso-borde bg-aviso-fondo text-aviso-texto", texto: "Espera pago" },
} as const;

export function PanelVivoVista({ panel }: { panel: PanelVivo }) {
  const totalMetodos = panel.porMetodo ? METODOS.reduce((s, m) => s + panel.porMetodo![m], 0) : 0;
  const alertas = [
    ...(panel.esperandoPago ? [{ tono: "aviso" as const, texto: `${panel.esperandoPago} pedido(s) esperando pago` }] : []),
    ...(panel.stock?.bajo.map((p) => ({ tono: "aviso" as const, texto: `Stock bajo: ${p.nombre} (quedan ${p.quedan})` })) ?? []),
    ...(panel.stock?.agotados.map((n) => ({ tono: "peligro" as const, texto: `Agotado: ${n}` })) ?? []),
  ];

  return (
    <div className="space-y-4">
      <section aria-label="Indicadores de hoy" className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Indicador titulo="Ventas" comparacion={panel.ventas} formato={soles} />
        <Indicador titulo="Pedidos" comparacion={panel.pedidos} formato={(n) => String(n)} />
        <Indicador titulo="Ticket promedio" comparacion={panel.ticket} formato={soles} />
        <Indicador titulo="Tiempo de cocina" comparacion={panel.cocinaMin} formato={(n) => `${n} min`} menosEsMejor />
        <Indicador titulo="Satisfacción" comparacion={panel.satisfaccion} formato={(n) => `${n.toFixed(1)} ★`} />
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        <Tarjeta className="space-y-2 lg:col-span-2">
          <h2 className="font-bold">Ventas por hora (hoy)</h2>
          <VentasPorHora horas={panel.porHora} />
        </Tarjeta>

        <Tarjeta className="space-y-3">
          <h2 className="font-bold">Alertas</h2>
          {alertas.length === 0 ? (
            <p className="text-sm text-texto-suave">Todo en orden por ahora.</p>
          ) : (
            <ul className="space-y-2">
              {alertas.slice(0, 8).map((a, i) => (
                <li key={i}><Insignia tono={a.tono}>{a.texto}</Insignia></li>
              ))}
            </ul>
          )}
        </Tarjeta>

        <Tarjeta className="space-y-3">
          <h2 className="font-bold">Top 5 platos de hoy</h2>
          {panel.top.length === 0 ? (
            <p className="text-sm text-texto-suave">Aún no hay ventas hoy.</p>
          ) : (
            <ol className="space-y-1">
              {panel.top.map((p, i) => (
                <li key={p.productId} className="flex justify-between gap-3 text-sm">
                  <span className="min-w-0 break-words">{i + 1}. {p.nombre}</span>
                  <span className="shrink-0 font-semibold tabular-nums">{p.unidades} u.</span>
                </li>
              ))}
            </ol>
          )}
        </Tarjeta>

        <Tarjeta className="space-y-3">
          <h2 className="font-bold">Mesas</h2>
          {panel.mesas.length === 0 ? (
            <p className="text-sm text-texto-suave">Sin mesas registradas.</p>
          ) : (
            <ul className="grid grid-cols-4 gap-2">
              {panel.mesas.map((m) => (
                <li key={m.id} className={`rounded-xl border p-2 text-center text-xs ${ESTILO_MESA[m.estado].clase}`}>
                  <span className="block text-base font-bold">{m.numero}</span>
                  {ESTILO_MESA[m.estado].texto}
                </li>
              ))}
            </ul>
          )}
        </Tarjeta>

        <Tarjeta className="space-y-3">
          <h2 className="font-bold">Pagos por método</h2>
          {!panel.porMetodo ? (
            <p className="text-sm text-texto-suave">—</p>
          ) : (
            <ul className="space-y-2">
              {METODOS.map((m) => {
                const pct = totalMetodos ? Math.round((panel.porMetodo![m] / totalMetodos) * 100) : 0;
                return (
                  <li key={m} className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span>{ETIQUETA_METODO[m]}</span>
                      <span className="font-semibold tabular-nums">{soles(panel.porMetodo![m])} · {pct} %</span>
                    </div>
                    <div className="h-2 rounded-full bg-superficie-suave" aria-hidden="true">
                      <div className="h-2 rounded-full bg-marca" style={{ width: `${pct}%` }} />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Tarjeta>
      </div>
    </div>
  );
}
