"use client";

import { Boton } from "@/components/ui";

type Props = {
  desactivar: (formData: FormData) => Promise<void>;
  campo: "mesaId" | "localId";
  valor: string;
};

// US-096: desactivar pide confirmación, porque el QR impreso deja de funcionar.
export function BotonDesactivarQr({ desactivar, campo, valor }: Props) {
  return (
    <form action={desactivar}>
      <input type="hidden" name={campo} value={valor} />
      <Boton
        type="submit"
        variante="peligro"
        onClick={(evento) => {
          if (!confirm("El QR impreso dejará de funcionar y los clientes no podrán pedir con él. ¿Desactivarlo?")) {
            evento.preventDefault();
          }
        }}
      >
        Desactivar QR
      </Boton>
    </form>
  );
}
