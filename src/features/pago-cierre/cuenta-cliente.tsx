import "server-only";

import { Tarjeta } from "../../components/ui";
import { BotonPagarTarjeta } from "./boton-pagar-tarjeta";
import { EstadoPagoOnline } from "./estado-pago-online";
import { resolverCuentaOnline } from "./pago-online";
import { centimosATexto } from "./pago-logica";
import { stripeConfigurado } from "./stripe";
import { leerRetornoPago, validarMontoCheckout } from "./stripe-logica";

// US-076: «Tu cuenta» en la vista del cliente: saldo y botón «Pagar con tarjeta».
// Al volver de Stripe muestra «Procesando pago…» o «Pago cancelado».
export async function CuentaCliente({ token, clave, pago, sesion }: {
  token: string;
  clave: string | null;
  pago: unknown;
  sesion: unknown;
}) {
  const retorno = leerRetornoPago(pago, sesion);
  const rutaBase = clave
    ? `/m/${encodeURIComponent(token)}/pedido/${encodeURIComponent(clave)}`
    : `/m/${encodeURIComponent(token)}`;

  let cuenta = null;
  try {
    cuenta = await resolverCuentaOnline(token, clave);
  } catch {
    // Si falla la consulta, la carta sigue funcionando sin la tarjeta de pago.
  }

  if (retorno === "PROCESANDO" && typeof sesion === "string") {
    return <EstadoPagoOnline token={token} clave={clave} sesionStripe={sesion} rutaBase={rutaBase} />;
  }
  if (!cuenta || cuenta.saldoCentimos <= 0 || !stripeConfigurado()) return null;

  const aviso = validarMontoCheckout(cuenta.saldoCentimos);

  return <Tarjeta className="space-y-3">
    {retorno === "CANCELADO" && <p role="status" className="text-sm text-aviso-texto">
      Cancelaste el pago con tarjeta. No se te cobró nada.
    </p>}
    <div className="flex items-baseline justify-between gap-3">
      <h2 className="font-semibold">Tu cuenta</h2>
      <p className="text-xl font-bold">S/ {centimosATexto(cuenta.saldoCentimos)}</p>
    </div>
    {aviso
      ? <p className="text-sm text-texto-suave">{aviso}</p>
      : <>
        <BotonPagarTarjeta token={token} clave={clave} />
        <p className="text-xs text-texto-suave">
          Pago seguro con Stripe. AlToque no ve ni guarda los datos de tu tarjeta.
          También puedes pagar en caja con efectivo o Yape.
        </p>
      </>}
  </Tarjeta>;
}
