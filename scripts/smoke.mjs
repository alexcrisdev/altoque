// US-029: prueba rápida (smoke test) después de cada despliegue.
// Solo hace peticiones GET y no escribe nada en la base de datos.
//
// Uso:
//   node scripts/smoke.mjs https://altoque-app-usil.vercel.app
//   SMOKE_QR_TOKEN=demo-mesa-2 node scripts/smoke.mjs <url>   (prueba también la carta)

const base = (process.argv[2] ?? process.env.SMOKE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const tokenQr = process.env.SMOKE_QR_TOKEN;

async function pedir(ruta) {
  const respuesta = await fetch(base + ruta, { redirect: "manual" });
  const texto = respuesta.status === 200 ? await respuesta.text() : "";
  return { respuesta, texto };
}

function redirigeALogin(respuesta) {
  const destino = respuesta.headers.get("location") ?? "";
  return [302, 303, 307, 308].includes(respuesta.status) && destino.includes("/login");
}

const pruebas = [
  ["Inicio responde", async () => (await pedir("/")).respuesta.status === 200],
  ["Login muestra el formulario", async () => {
    const { respuesta, texto } = await pedir("/login");
    return respuesta.status === 200 && texto.includes("<form");
  }],
  ...["/admin", "/mesero", "/cocina", "/caja"].map((ruta) => [
    `${ruta} pide iniciar sesión`,
    async () => redirigeALogin((await pedir(ruta)).respuesta),
  ]),
  ["QR inventado muestra 'no válido'", async () => {
    const { respuesta, texto } = await pedir("/m/smoke-token-que-no-existe");
    return respuesta.status === 200 && texto.includes("Código QR no válido");
  }],
  ["Cabeceras de seguridad presentes", async () => {
    const { respuesta } = await pedir("/login");
    return ["x-frame-options", "x-content-type-options", "referrer-policy", "permissions-policy"]
      .every((cabecera) => respuesta.headers.has(cabecera));
  }],
];

if (tokenQr) {
  pruebas.push(["La carta carga desde un QR válido", async () => {
    const { respuesta, texto } = await pedir(`/m/${encodeURIComponent(tokenQr)}`);
    return respuesta.status === 200 && !texto.includes("Código QR no válido") && texto.includes("Mesa");
  }]);
}

console.log(`Smoke test contra ${base}\n`);
let fallas = 0;
for (const [nombre, prueba] of pruebas) {
  let ok = false;
  try {
    ok = await prueba();
  } catch (error) {
    console.log(`  (error de red: ${error.message})`);
  }
  if (!ok) fallas++;
  console.log(`${ok ? "OK   " : "FALLA"}  ${nombre}`);
}

console.log(`\n${pruebas.length - fallas}/${pruebas.length} pruebas correctas`);
process.exit(fallas === 0 ? 0 : 1);
