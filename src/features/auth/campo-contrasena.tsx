"use client";

import { useState } from "react";

export function CampoContrasena() {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      <input
        id="login-password"
        name="password"
        type={visible ? "text" : "password"}
        autoComplete="current-password"
        enterKeyHint="go"
        required
        className="min-h-11 w-full rounded-xl border border-borde bg-superficie py-2 pr-14 pl-3 text-base text-texto focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca"
      />
      <button
        type="button"
        aria-label={visible ? "Ocultar contraseña" : "Mostrar contraseña"}
        aria-controls="login-password"
        onClick={() => setVisible((actual) => !actual)}
        className="absolute inset-y-0 right-0.5 my-auto flex h-11 w-11 items-center justify-center rounded-lg text-texto-suave transition-colors hover:bg-marca-suave hover:text-marca focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className="h-5 w-5"
        >
          <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
          <circle cx="12" cy="12" r="3" />
          {visible && <path d="m3 3 18 18" />}
        </svg>
      </button>
    </div>
  );
}
