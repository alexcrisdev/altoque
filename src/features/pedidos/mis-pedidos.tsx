"use client";

import { useEffect, useState } from "react";
import { BotonEnlace, Tarjeta } from "../../components/ui";
import {
  descartarAntiguos,
  type PedidoGuardado,
} from "./estado-cliente";

type Props = {
  token: string;
};

export function MisPedidos({ token }: Props) {
  const [historial, setHistorial] = useState<{
    token: string;
    pedidos: PedidoGuardado[];
  }>({
    token,
    pedidos: [],
  });

  useEffect(() => {
    const almacenamiento = `altoque:pedidos:${token}`;

    function actualizar() {
      try {
        const contenido: unknown = JSON.parse(
          window.localStorage.getItem(almacenamiento) ?? "[]",
        );

        const pedidos = descartarAntiguos(
          Array.isArray(contenido) ? contenido : [],
          Date.now(),
        )
          .sort(
            (primero, segundo) =>
              Date.parse(segundo.creadoEn) -
              Date.parse(primero.creadoEn),
          )
          .slice(0, 10);

        setHistorial({ token, pedidos });
      } catch {
        // La carta sigue funcionando si el almacenamiento no está disponible.
        setHistorial({ token, pedidos: [] });
      }
    }

    function cambioEnOtraPestana(evento: StorageEvent) {
      if (evento.key === almacenamiento || evento.key === null) {
        actualizar();
      }
    }

    // Leemos el navegador después del primer render.
    const inicio = window.setTimeout(actualizar, 0);

    // Retira pedidos vencidos si la carta permanece abierta.
    const intervalo = window.setInterval(actualizar, 60_000);

    window.addEventListener(
      "altoque:pedidos-actualizados",
      actualizar,
    );
    window.addEventListener("storage", cambioEnOtraPestana);
    window.addEventListener("pageshow", actualizar);

    return () => {
      window.clearTimeout(inicio);
      window.clearInterval(intervalo);
      window.removeEventListener(
        "altoque:pedidos-actualizados",
        actualizar,
      );
      window.removeEventListener("storage", cambioEnOtraPestana);
      window.removeEventListener("pageshow", actualizar);
    };
  }, [token]);

  // Evita mostrar enlaces del QR anterior si cambia el token.
  const pedidos = historial.token === token
    ? historial.pedidos
    : [];

  if (pedidos.length === 0) return null;

  return (
    <section aria-labelledby="mis-pedidos-titulo">
      <Tarjeta>
        <h2
          id="mis-pedidos-titulo"
          className="text-lg font-bold"
        >
          Mis pedidos
        </h2>

        <p className="mt-1 text-sm text-texto-suave">
          Pedidos guardados en este navegador durante las últimas
          12 horas.
        </p>

        <ul className="mt-4 space-y-2">
          {pedidos.map((pedido) => (
            <li key={pedido.clave}>
              <BotonEnlace
                href={`/m/${encodeURIComponent(token)}/pedido/${encodeURIComponent(pedido.clave)}`}
                variante="secundario"
                className="w-full"
              >
                Pedido N.º {pedido.numero} → ver estado
              </BotonEnlace>
            </li>
          ))}
        </ul>
      </Tarjeta>
    </section>
  );
}
