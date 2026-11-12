// Entorno de navegador aislado: las acciones se sustituyen antes de compilar.
// No carga .env.local ni importa clientes Supabase.
import { createServer } from "vite";
import { resolve } from "node:path";
import { readFileSync, readdirSync } from "node:fs";
const root = process.cwd();
const servidor = await createServer({
  configFile: false, root, server: { host: "127.0.0.1", port: 4175, strictPort: true },
  resolve: { alias: { "@": resolve(root, "src") } },
  plugins: [{
    name: "kds-sin-base-de-datos",
    enforce: "pre",
    configureServer(server) {
      server.middlewares.use("/kds-estilos.css", (_req, res) => {
        const carpeta = resolve(root, ".next/static/chunks");
        try {
          const css = readdirSync(carpeta).filter((nombre) => nombre.endsWith(".css"));
          if (!css.length) throw new Error("Falta compilar estilos");
          res.setHeader("Content-Type", "text/css");
          res.end(css.map((nombre) => readFileSync(resolve(carpeta, nombre), "utf8")).join("\n"));
        } catch { res.statusCode = 503; res.end("Ejecuta npm.cmd run build antes de las pruebas visuales."); }
      });
    },
    resolveId(id) {
      if (id.endsWith("/kds-actions") || id === "./kds-actions") return resolve(root, "tests/kds-local/acciones.ts");
      if (id.endsWith("/reportar-incidencia") || id === "./reportar-incidencia") return resolve(root, "tests/kds-local/incidencias.tsx");
    },
  }],
});
await servidor.listen();
