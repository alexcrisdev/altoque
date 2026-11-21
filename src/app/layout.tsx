import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AlToque",
  description: "Pedidos por QR para restaurantes",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="es"
      className="h-full antialiased"
    >
      <body className="min-h-full flex flex-col">
        <a href="#contenido-principal" className="salto-contenido">Saltar al contenido</a>
        {children}
      </body>
    </html>
  );
}
