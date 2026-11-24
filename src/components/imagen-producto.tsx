"use client";

import Image from "next/image";
import { useState } from "react";
import { esUrlImagenProducto } from "../features/carta/foto-producto";

const ALTERNATIVA = "/images/plato-predeterminado.svg";

export function ImagenProducto({ src, nombre, className = "", decorativa = false }: {
  src: string | null | undefined;
  nombre: string;
  className?: string;
  decorativa?: boolean;
}) {
  const [fallida, setFallida] = useState<string | null>(null);
  const url = src?.trim() ?? "";
  let valida = false;
  try { valida = esUrlImagenProducto(new URL(url)); } catch { /* Se utiliza la referencia local. */ }
  const alternativa = !valida || fallida === url;
  return <Image
    src={alternativa ? ALTERNATIVA : url}
    alt={decorativa ? "" : alternativa ? `Imagen de referencia: ${nombre}` : nombre}
    width={480}
    height={360}
    unoptimized
    onError={() => { if (!alternativa) setFallida(url); }}
    className={`bg-marca-suave object-cover ${className}`}
  />;
}
