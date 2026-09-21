
import type { Viewport } from "next";
import { ThemeProvider } from "@/components/providers/ThemeProvider";
import { AntdProvider } from "@/components/providers/AntdProvider";
import { PwaRegister } from "@/components/pwa/InstallApp";
import { AppBar, BottomNav, RouteTransition } from "@/components/layout/AppShell";
import { BatchProvider } from "@/components/providers/BatchProvider";
import "./globals.css";

export const metadata = {
  title: "Neeraj Competitive Classes",
  description:
    "Neeraj Competitive Classes — Railway, SSC, Bank & Police coaching. No game · No fame · Only aim.",
  applicationName: "Neeraj Classes",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Neeraj Classes",
  },
  icons: {
    icon: "/icon-192.png",
    apple: "/icon-192.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#4f46e5",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {/* Android-style app shell: persistent top app bar + bottom nav (F11).
              Both self-hide on routes without chrome (/, /login, /signup, /home). */}
          <AntdProvider>
            <BatchProvider>
              <AppBar />
              <RouteTransition>{children}</RouteTransition>
              <BottomNav />
            </BatchProvider>
          </AntdProvider>
          {/* Registers the service worker + captures the PWA install prompt (F11). */}
          <PwaRegister />
        </ThemeProvider>
      </body>
    </html>
  );
}