import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "NetDesk — Service Desk Footloose",
  description: "Sistema de gestión de incidentes de red",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // El background en <html> evita el destello blanco entre la carga del
    // documento y la del CSS, y cubre el overscroll en los bordes.
    <html
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable}`}
      style={{ background: '#080d24', colorScheme: 'dark' }}
    >
      <body style={{ margin: 0, minHeight: '100vh' }}>{children}</body>
    </html>
  );
}
