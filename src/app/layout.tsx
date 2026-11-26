import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import "./animaciones.css";

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  display: "swap",
  variable: "--font-inter",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://altoque-app-usil.vercel.app"),
  title: "AlToque",
  description: "Pedidos por QR para restaurantes",
  openGraph: {
    type: "website",
    locale: "es_PE",
    siteName: "AlToque",
    title: "AlToque",
    description: "Pedidos por QR para restaurantes",
    images: [{
      url: "/images/altoque-compartir.png",
      width: 1200,
      height: 630,
      alt: "AlToque · Pedidos por QR para restaurantes",
    }],
  },
  twitter: {
    card: "summary_large_image",
    title: "AlToque",
    description: "Pedidos por QR para restaurantes",
    images: ["/images/altoque-compartir.png"],
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="es"
      className={`${inter.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <a href="#contenido-principal" className="salto-contenido">Saltar al contenido</a>
        {children}
      </body>
    </html>
  );
}
