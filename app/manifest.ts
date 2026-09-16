import type { MetadataRoute } from "next";

// PWA web app manifest — makes the app installable on Android (Chrome
// "Install app" / "Add to Home Screen") and launches it standalone like a
// native app. See docs/FEATURES.md → F11.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "NeerajCompetitiveClasses",
    short_name: "NeerajClasses",
    description:
      "Coaching center platform — batches, AI-generated tests, and a public leaderboard.",
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#09090b",
    theme_color: "#4f46e5",
    categories: ["education"],
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
