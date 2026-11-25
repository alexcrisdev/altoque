import "./admin.css";
import { Suspense, type ReactNode } from "react";
import { NavegacionDelPanel } from "@/features/auth/navegacion";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return <div className="area-gestion min-h-dvh"><Suspense fallback={null}><NavegacionDelPanel area="admin" /></Suspense>{children}</div>;
}
