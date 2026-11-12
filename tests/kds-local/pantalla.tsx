import { createRoot } from "react-dom/client";
import { TableroKds } from "../../src/features/cocina/tablero-kds";
import { obtenerKds } from "./acciones";

const inicial = await obtenerKds();
createRoot(document.getElementById("root")!).render(<TableroKds inicial={inicial} tv={new URLSearchParams(location.search).get("modo") === "tv"} />);
