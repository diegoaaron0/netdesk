import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Los errores de tipos DEBEN romper el build. El código fuente está en 0 errores
  // (verificado con tsc --noEmit); reactivar esto evita que regresiones de tipos
  // lleguen a producción silenciosamente.
  typescript: { ignoreBuildErrors: false },

  // El servidor de Footloose sirve la app detras de netdesk.footloose.pe.
  // Sin esto, `next dev` rechaza las peticiones que llegan con ese Host
  // como cross-origin. Solo afecta a dev; en produccion no interviene.
  allowedDevOrigins: ['netdesk.footloose.pe'],
};

export default nextConfig;
