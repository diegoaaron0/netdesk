import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Los errores de tipos DEBEN romper el build. El código fuente está en 0 errores
  // (verificado con tsc --noEmit); reactivar esto evita que regresiones de tipos
  // lleguen a producción silenciosamente.
  typescript: { ignoreBuildErrors: false },
};

export default nextConfig;
