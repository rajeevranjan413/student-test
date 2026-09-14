
import { ThemeProvider } from "@/components/providers/ThemeProvider";
import "./globals.css";

export const metadata = {
  title: "EduCoach",
  description: "Coaching Center Platform",
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
          {/* We removed the DashboardLayout wrapper here so the home page can be full screen */}
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}