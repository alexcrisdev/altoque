import "server-only";
import Stripe from "stripe";

// US-076: cliente de Stripe. La clave secreta solo vive en el servidor
// (.env.local y Vercel); nunca lleva el prefijo NEXT_PUBLIC_.
let cliente: Stripe | null = null;

export function stripeConfigurado(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

export function crearClienteStripe(): Stripe {
  const clave = process.env.STRIPE_SECRET_KEY;
  if (!clave) throw new Error("Falta STRIPE_SECRET_KEY en .env.local");
  cliente ??= new Stripe(clave);
  return cliente;
}
