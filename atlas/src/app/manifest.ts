import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Atlas — Pilote ton patrimoine",
    short_name: "Atlas",
    description:
      "Suivi unifié de tes investissements actions, ETF et crypto, avec un copilote IA nourri de ton portefeuille réel.",
    start_url: "/",
    display: "standalone",
    background_color: "#0a0a0b",
    theme_color: "#0a0a0b",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/logo.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
