import type { MetadataRoute } from "next";

// PWA web app manifest — makes the app installable on Android (Chrome
// "Install app" / "Add to Home Screen") and launches it standalone like a
// native app. See docs/FEATURES.md → F11.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Neeraj Competitive Classes",
    short_name: "Neeraj Classes",
    description:
      "Neeraj Competitive Classes — Railway, SSC, Bank & Police coaching with AI-generated tests and a live leaderboard. No game · No fame · Only aim.",
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
