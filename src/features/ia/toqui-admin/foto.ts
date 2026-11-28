import "server-only";
import { obtenerAgotadosRecientes } from "../../dashboard/agotados";
import { obtenerMapaCalor } from "../../dashboard/mapa-calor";
import { obtenerPanelVivo } from "../../dashboard/panel-vivo";
import { obtenerPrediccionManana } from "../../dashboard/prediccion";
import { obtenerTendencias } from "../../dashboard/tendencias";
import { obtenerTiemposCocina } from "../../dashboard/tiempos-cocina";
import { obtenerResumenVentas } from "../../dashboard/ventas";
import { armarFotoMetricas, calcularPeriodos, type DatosPeriodo, type FotoMetricas, type Rango } from "./foto-logica";

// US-152: junta las métricas con las MISMAS funciones fijas del Dashboard y de Reportes
// (sin SQL nuevo ni generado por la IA), siempre del restaurante de la sesión.

const TODOS_LOS_PLATOS = 500; // lista completa para los menos vendidos
const TODA_LA_SEMANA = [0, 1, 2, 3, 4, 5, 6];
const VIGENCIA_MS = 60_000; // varias preguntas seguidas reusan la foto un minuto

const memoria = new Map<string, { vence: number; foto: FotoMetricas }>();

// Una sección que falla no tumba la foto: queda null y Toqui dice que no tiene ese dato.
async function seguro<T>(nombre: string, tarea: () => Promise<T>): Promise<T | null> {
  try {
    return await tarea();
  } catch {
    console.error(JSON.stringify({ evento: "error", origen: `toqui-admin:${nombre}` }));
    return null;
  }
}

async function datosPeriodo(restauranteId: string, r: Rango & { anterior: Rango }, nombre: string): Promise<DatosPeriodo> {
  const [ventas, ventasAnterior, tendencias, cocina, mapa] = await Promise.all([
    seguro(`${nombre}:ventas`, () => obtenerResumenVentas(restauranteId, r.desde, r.hasta)),
    seguro(`${nombre}:ventas-anterior`, () => obtenerResumenVentas(restauranteId, r.anterior.desde, r.anterior.hasta)),
    seguro(`${nombre}:tendencias`, () => obtenerTendencias(restauranteId, r.desde, r.hasta, undefined, TODOS_LOS_PLATOS)),
    seguro(`${nombre}:cocina`, () => obtenerTiemposCocina(restauranteId, r.desde, r.hasta)),
    seguro(`${nombre}:hora-pico`, () => obtenerMapaCalor(restauranteId, {
      desde: r.desde, hasta: r.hasta, horaDesde: 0, horaHasta: 24, diasAbiertos: TODA_LA_SEMANA,
    })),
  ]);
  return { ventas, ventasAnterior, tendencias, cocina, mapa };
}

/** Foto de métricas del restaurante (hoy, 7 y 30 días, agotados y predicción). */
export async function obtenerFotoMetricas(restauranteId: string, ahora = Date.now()): Promise<FotoMetricas> {
  const guardada = memoria.get(restauranteId);
  if (guardada && guardada.vence > ahora) return guardada.foto;

  const periodos = calcularPeriodos(ahora);
  const [panel, hoyTendencias, semana, mes, agotados, prediccion] = await Promise.all([
    seguro("hoy", () => obtenerPanelVivo(restauranteId, ahora)),
    seguro("hoy:tendencias", () => obtenerTendencias(restauranteId, periodos.hoy, periodos.hoy, undefined, TODOS_LOS_PLATOS)),
    datosPeriodo(restauranteId, periodos.semana, "7-dias"),
    datosPeriodo(restauranteId, periodos.mes, "30-dias"),
    seguro("agotados", () => obtenerAgotadosRecientes(restauranteId, ahora)),
    seguro("prediccion", () => obtenerPrediccionManana(restauranteId, new Date(ahora))),
  ]);

  const foto = armarFotoMetricas({ periodos, panel, hoyTendencias, semana, mes, agotados, prediccion });
  memoria.set(restauranteId, { vence: ahora + VIGENCIA_MS, foto });
  return foto;
}
