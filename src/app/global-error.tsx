"use client";

// US-106 (Fase C): último respaldo si falla el layout raíz. Reemplaza todo el documento,
// por eso trae su propio <html> y <body> y estilos en línea (aquí no llegan globals.css
// ni las fuentes). Nunca muestra el mensaje interno del error: solo un código de referencia
// (digest) que permite encontrarlo en los logs del servidor.
export default function ErrorGlobal({ error, retry }: { error: unknown; retry: () => void }) {
  const referencia = error instanceof Error && "digest" in error && typeof error.digest === "string" ? error.digest : null;
  return (
    <html lang="es">
      <body style={{ margin: 0, minHeight: "100dvh", display: "grid", placeItems: "center", padding: "16px",
        fontFamily: "system-ui, sans-serif", background: "#FAF8F5", color: "#1E2A3B" }}>
        <title>AlToque · Algo salió mal</title>
        <main id="contenido-principal" style={{ maxWidth: "28rem", textAlign: "center" }}>
          <h1 style={{ fontSize: "1.5rem", margin: "0 0 .75rem" }}>Algo salió mal</h1>
          <p style={{ margin: "0 0 1.5rem", lineHeight: 1.5 }}>
            No pudimos cargar AlToque. Revisa tu conexión y vuelve a intentarlo. Si el problema continúa,
            pide ayuda al personal del restaurante.
          </p>
          <button type="button" onClick={() => retry()} style={{ minHeight: "44px", padding: ".625rem 1.25rem",
            borderRadius: ".75rem", border: "none", background: "#1E2A3B", color: "#FFFFFF", fontWeight: 600,
            fontSize: "1rem", cursor: "pointer" }}>
            Reintentar
          </button>
          {referencia && <p style={{ marginTop: "1rem", fontSize: ".75rem", opacity: .7 }}>Código de referencia: {referencia}</p>}
        </main>
      </body>
    </html>
  );
}
