import type { MetadataRoute } from "next";

// Minimal PWA manifest. Icons and theme colours are added once the brand
// assets are confirmed (see CLAUDE.md, "Still open / later").
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Shosha Beauty Company HR",
    short_name: "SBC HR",
    start_url: "/dashboard",
    display: "standalone",
  };
}
