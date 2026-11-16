"use client";
import { useRef, useState } from "react";
import { Boton } from "../../components/ui";
import { centimosATexto } from "./pago-logica";
import { comprimirCaptura } from "./comprimir-captura";
import { subirCapturaAction } from "./capturas-actions";
import type { Billetera } from "./capturas-logica";

export function SubirCaptura({ token, clavePedido, saldo, titular }: {
  token: string; clavePedido: string | null; saldo: number; titular: string;
}) {
  const [abierto, setAbierto] = useState(false);
  const [wallet, setWallet] = useState<Billetera>("YAPE");
  const [monto, setMonto] = useState(centimosATexto(saldo));
  const [archivo, setArchivo] = useState<File | null>(null);
  const [mensaje, setMensaje] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const intento = useRef<string | null>(null);
  const guardando = useRef(false);
  async function enviar() {
    if (!archivo || guardando.current) return;
    guardando.current = true; setOcupado(true); setMensaje("");
    try {
      const { imagen, huella } = await comprimirCaptura(archivo);
      intento.current ??= crypto.randomUUID();
      const datos = new FormData();
      datos.set("clave", intento.current); datos.set("wallet", wallet); datos.set("monto", monto);
      datos.set("huella", huella); datos.set("imagen", imagen, "captura.jpg");
      const respuesta = await subirCapturaAction(token, clavePedido, datos);
      setMensaje(respuesta.mensaje);
      if (respuesta.ok) { setEnviado(true); setArchivo(null); }
    } catch (error) { setMensaje(error instanceof Error ? error.message : "No se pudo enviar. Puedes reintentar."); }
    finally { guardando.current = false; setOcupado(false); }
  }
  return <section className="space-y-3" aria-label="Pago con Yape o Plin">
    <Boton variante="secundario" type="button" aria-expanded={abierto} onClick={() => setAbierto(!abierto)}>Pagar con Yape o Plin</Boton>
    {abierto && <div className="space-y-3 rounded-xl border border-borde p-4">
      <p className="font-semibold">Paga a: {titular}</p>
      <p>Saldo: S/ {centimosATexto(saldo)}</p>
      <Boton type="button" variante="secundario" onClick={async () => {
        try { await navigator.clipboard.writeText(centimosATexto(saldo)); setMensaje("Monto copiado."); }
        catch { setMensaje(`No se pudo copiar. El monto es S/ ${centimosATexto(saldo)}.`); }
      }}>Copiar monto</Boton>
      <p className="text-sm">Paga al QR del restaurante y comprueba el nombre del titular antes de enviar dinero.</p>
      {!enviado && <fieldset disabled={ocupado} className="space-y-3">
        <legend className="sr-only">Datos del pago</legend>
        <label className="block">Billetera
          <select className="ml-2 min-h-11 rounded border px-3" value={wallet} onChange={e => { setWallet(e.target.value as Billetera); intento.current = null; }}>
            <option value="YAPE">Yape</option><option value="PLIN">Plin</option>
          </select>
        </label>
        <label className="block">Monto pagado (S/)
          <input className="mt-1 block min-h-11 w-full rounded border px-3" inputMode="decimal" value={monto}
            onChange={e => { setMonto(e.target.value); intento.current = null; }} />
        </label>
        <label className="block font-semibold">Ya pagué → Subir captura
          <input type="file" accept="image/*" className="mt-2 block w-full text-sm" onChange={e => {
            setArchivo(e.target.files?.[0] ?? null); intento.current = null;
          }} />
        </label>
        <p className="text-sm text-texto-suave">Puedes elegir cámara o galería. Evita incluir información ajena al pago.</p>
        <Boton type="button" disabled={!archivo || ocupado} onClick={() => void enviar()}>{ocupado ? "Enviando…" : "Enviar captura"}</Boton>
      </fieldset>}
      <p className="text-sm">La captura no confirma el pago. Caja comprobará que el dinero haya llegado.</p>
    </div>}
    {mensaje && <p role="status" className="text-sm">{mensaje}</p>}
  </section>;
}
