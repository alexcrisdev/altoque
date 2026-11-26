import { Insignia } from "../../components/ui/insignia";
import { MensajeEstado } from "../../components/ui/mensaje-estado";
import { Tarjeta } from "../../components/ui/tarjeta";
import type { ResultadoPrediccion } from "./prediccion-actions";

export function TarjetaPrediccion({ resultado }: { resultado: ResultadoPrediccion }) {
  return (
    <section aria-labelledby="prediccion-manana-titulo" className="space-y-4">
      <h2 id="prediccion-manana-titulo" className="text-xl font-bold text-texto">
        Platos para preparar mañana
      </h2>

      {!resultado.ok ? (
        <MensajeEstado tipo="error" titulo="No pudimos mostrar la predicción" descripcion={resultado.mensaje} />
      ) : resultado.resumen.platos.length === 0 ? (
        <MensajeEstado
          tipo="vacio"
          titulo="Aún no hay predicción para mañana"
          descripcion="Se mostrará cuando esté disponible la estimación de ese día."
        />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2 text-sm text-texto-suave">
            <span>Fecha prevista: {resultado.resumen.fecha} (hora de Lima).</span>
            {resultado.resumen.esDemo && <Insignia tono="info">Predicción de demostración</Insignia>}
            {resultado.resumen.platosDemo && <Insignia tono="info">Incluye platos de demostración</Insignia>}
          </div>

          <ul className="grid gap-4 md:grid-cols-3">
            {resultado.resumen.platos.map((plato) => (
              <li key={plato.productoId} className="min-w-0">
                <Tarjeta className="h-full space-y-3">
                  <h3 className="break-words text-lg font-semibold">
                    Mañana {resultado.resumen.dia}: prepara ~{plato.cantidadPrevista} {plato.nombre}
                  </h3>
                  {resultado.resumen.platosDemo?.includes(plato.productoId) && (
                    <Insignia tono="info">Demo</Insignia>
                  )}
                  {plato.stockRegistrado === null ? (
                    <p className="text-sm text-texto-suave">Sin stock registrado para ese día: sin límite y sin alerta.</p>
                  ) : plato.alerta ? (
                    <Insignia tono="aviso" className="max-w-full whitespace-normal break-words">
                      Stock {plato.stockRegistrado} · previsto ~{plato.cantidadPrevista}: faltarían {plato.faltantes}
                    </Insignia>
                  ) : (
                    <Insignia tono="exito" className="max-w-full whitespace-normal break-words">
                      Stock {plato.stockRegistrado} · previsto ~{plato.cantidadPrevista}: suficiente
                    </Insignia>
                  )}
                </Tarjeta>
              </li>
            ))}
          </ul>

          <p className="break-words text-sm text-texto-suave">
            Modelo: {resultado.resumen.modelo}. Estimación orientativa; no modifica el stock.
            {(resultado.resumen.esDemo || resultado.resumen.platosDemo) &&
              " Esta demostración usa predicciones con fechas desplazadas."}
          </p>
        </>
      )}
    </section>
  );
}
