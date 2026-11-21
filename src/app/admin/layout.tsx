import { Suspense, type ReactNode } from "react";
import { NavegacionPanel } from "@/components/navegacion-panel";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return <div className="area-gestion min-h-screen"><Suspense fallback={null}><NavegacionPanel area="admin" /></Suspense>{children}</div>;
}
