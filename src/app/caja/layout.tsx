import "./caja.css";
import { Suspense, type ReactNode } from "react";
import { NavegacionPanel } from "@/components/navegacion-panel";

export default function CajaLayout({ children }: { children: ReactNode }) {
  return <div className="area-caja min-h-dvh"><Suspense fallback={null}><NavegacionPanel area="caja" /></Suspense>{children}</div>;
}
