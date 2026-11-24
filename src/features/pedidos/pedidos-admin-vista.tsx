"use client";

import Link from "next/link";
import { useState } from "react";
import { Boton, Insignia, MensajeEstado } from "@/components/ui";
import { describirDestino } from "./modalidad";
import { ETIQUETA_ESTADO, TONO_ESTADO } from "./estados";
import type { PedidoAdmin } from "./pedidos-admin";
import { filtrarYOrdenarPedidos, type OrdenPedidosVista } from "./pedidos-admin-filtros";
import "./pedidos-admin-vista.css";

const formatoFecha = new Intl.DateTimeFormat("es-PE", {
  timeZone: "America/Lima",
  dateStyle: "short",
  timeStyle: "short",
});

export function PedidosAdminVista({ pedidos }: { pedidos: PedidoAdmin[] }) {
  const [mesa, setMesa] = useState("");
  const [orden, setOrden] = useState<OrdenPedidosVista>("recientes");
  const visibles = filtrarYOrdenarPedidos(pedidos, mesa, orden);

  return (
    <section className="pedidos-vista" aria-label="Pedidos del restaurante">
      <search aria-label="Buscar y ordenar pedidos">
        <form
          action="/admin/pedidos"
          method="get"
          onSubmit={(evento) => evento.preventDefault()}
          className="pedidos-filtros"
        >
          <div>
            <label htmlFor="pedidos-buscar-mesa">Buscar por mesa</label>
            <input
              id="pedidos-buscar-mesa"
              name="mesa"
              type="search"
              inputMode="numeric"
              placeholder="Ej. 5"
              value={mesa}
              spellCheck={false}
              onChange={(evento) => setMesa(evento.target.value)}
              aria-describedby="pedidos-alcance-busqueda"
            />
          </div>
          <div>
            <label htmlFor="pedidos-orden">Ordenar por fecha</label>
            <select
              id="pedidos-orden"
              name="orden"
              value={orden}
              onChange={(evento) => setOrden(
                evento.target.value === "antiguos" ? "antiguos" : "recientes",
              )}
            >
              <option value="recientes">Más recientes primero</option>
              <option value="antiguos">Más antiguos primero</option>
            </select>
          </div>
          <Boton type="button" variante="secundario" onClick={() => setMesa("")} disabled={!mesa}>
            Limpiar búsqueda
          </Boton>
        </form>
      </search>

      <div className="pedidos-resumen">
        <p role="status" aria-atomic="true">
          <strong>{visibles.length}</strong> de {pedidos.length} pedidos
          {" · "}{orden === "recientes" ? "Más recientes primero" : "Más antiguos primero"}
        </p>
        <p id="pedidos-alcance-busqueda">Búsqueda en los últimos 30 pedidos.</p>
      </div>

      {visibles.length === 0 ? (
        <MensajeEstado
          tipo="vacio"
          titulo="No hay pedidos para esta mesa"
          descripcion="Prueba otro número o limpia la búsqueda para ver todos los pedidos cargados."
        />
      ) : (
        <ul role="list" className="pedidos-cuadricula">
          {visibles.map((pedido) => (
            <li key={pedido.id}>
              <article className="pedido-tarjeta">
                <header>
                  <h2>
                    <Link href={`/admin/pedidos/${pedido.id}`}>
                      Pedido n.º {pedido.numero}
                      <span aria-hidden="true"> →</span>
                    </Link>
                  </h2>
                  <Insignia tono={TONO_ESTADO[pedido.estado]}>
                    {ETIQUETA_ESTADO[pedido.estado]}
                  </Insignia>
                </header>
                <p className="pedido-tarjeta-destino">{describirDestino(pedido)}</p>
                <p className="pedido-tarjeta-fecha">
                  <time dateTime={pedido.creadoEn}>
                    {formatoFecha.format(new Date(pedido.creadoEn))}
                  </time>
                </p>
              </article>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
