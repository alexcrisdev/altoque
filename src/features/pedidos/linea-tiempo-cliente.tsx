// US-092: ticket con número + barra de avance, y línea de tiempo con horas.
// Componente de servidor: la página se refresca cada 5 s y vuelve a dibujarlo.
import {
  porcentajeAvance,
  type PasoLineaTiempo,
  type TiempoEstimado,
} from "./linea-tiempo";

export function textoTiempoEstimado(estimado: TiempoEstimado): string {
  const minutos = `${estimado.minutos} min`;
  if (estimado.despuesDelPago) {
    return `Estará listo aprox. ${minutos} después de pagar`;
  }
  return estimado.porDefecto
    ? `Faltan aprox. ${minutos}`
    : `Faltan unos ${minutos} (promedio de la cocina)`;
}

export function TicketPedido({
  numero,
  estadoTexto,
  mensaje,
  estimado,
  pasos,
  cancelado,
}: {
  numero: number;
  estadoTexto: string;
  mensaje: string;
  estimado: TiempoEstimado | null;
  pasos: PasoLineaTiempo[];
  cancelado: boolean;
}) {
  const avance = porcentajeAvance(pasos);

  return (
    <section
      aria-label="Tu pedido"
      className={`rounded-2xl p-5 text-white shadow-sm ${
        cancelado ? "bg-peligro-texto" : "bg-marca-hover"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm opacity-90">Tu pedido</p>
        <span className="rounded-full bg-white/20 px-3 py-1 text-sm font-semibold">
          {estadoTexto}
        </span>
      </div>

      <p className="text-5xl font-bold leading-tight tracking-tight">
        N.º {numero}
      </p>

      <p className="mt-1 text-sm opacity-95">{mensaje}</p>

      {estimado && (
        <p className="mt-2 font-semibold" role="status">
          {textoTiempoEstimado(estimado)}
        </p>
      )}

      {!cancelado && (
        <div
          role="progressbar"
          aria-label="Avance del pedido"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={avance}
          className="mt-4 h-2 overflow-hidden rounded-full bg-white/30"
        >
          <div
            className="h-full rounded-full bg-white transition-[width] duration-500"
            style={{ width: `${avance}%` }}
          />
        </div>
      )}
    </section>
  );
}

function IconoCheck() {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className="h-4 w-4">
      <path
        d="M5 10.5l3 3 7-7"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconoReloj() {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className="h-5 w-5">
      <circle cx="10" cy="10" r="7.5" stroke="currentColor" strokeWidth="1.8" />
      <path d="M10 6v4l2.5 2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function clasesCirculo(paso: PasoLineaTiempo): string {
  if (paso.clave === "CANCELADO") return "bg-peligro text-white";
  if (paso.estado === "actual") return "bg-marca text-white ring-4 ring-marca-suave";
  if (paso.estado === "hecho") return "bg-exito-texto text-white";
  return "border-2 border-borde bg-superficie text-texto-suave";
}

export function LineaTiempoPedido({ pasos }: { pasos: PasoLineaTiempo[] }) {
  return (
    <section aria-labelledby="linea-tiempo-titulo">
      <h3
        id="linea-tiempo-titulo"
        className="mb-3 flex items-center gap-2 font-semibold"
      >
        <IconoReloj />
        Línea de tiempo
      </h3>

      <ol>
        {pasos.map((paso, indice) => {
          const ultimo = indice === pasos.length - 1;
          const alcanzado = paso.estado !== "pendiente";

          return (
            <li
              key={paso.clave}
              aria-current={paso.estado === "actual" ? "step" : undefined}
              className="relative flex gap-3 pb-5 last:pb-0"
            >
              {!ultimo && (
                <span
                  aria-hidden="true"
                  className={`absolute left-[15px] top-8 h-[calc(100%-2rem)] w-0.5 ${
                    alcanzado && pasos[indice + 1].estado !== "pendiente"
                      ? "bg-exito-texto"
                      : "bg-borde"
                  }`}
                />
              )}

              <span
                aria-hidden="true"
                className={`relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${clasesCirculo(paso)}`}
              >
                {paso.clave === "CANCELADO" ? (
                  "×"
                ) : alcanzado ? (
                  <IconoCheck />
                ) : null}
              </span>

              <div className="flex min-w-0 flex-1 items-start justify-between gap-3 pt-1">
                <p
                  className={`min-w-0 break-words ${
                    paso.estado === "actual"
                      ? paso.clave === "CANCELADO"
                        ? "font-bold text-peligro-texto"
                        : "font-bold text-marca-hover"
                      : alcanzado
                        ? "font-semibold text-texto"
                        : "text-texto-suave"
                  }`}
                >
                  {paso.etiqueta}
                  <span className="sr-only">
                    {paso.estado === "actual"
                      ? " (paso actual)"
                      : alcanzado
                        ? " (completado)"
                        : " (pendiente)"}
                  </span>
                </p>

                <span
                  className={`shrink-0 tabular-nums ${
                    alcanzado ? "font-semibold text-texto" : "text-texto-suave"
                  }`}
                >
                  {paso.hora ?? "--:--"}
                </span>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
