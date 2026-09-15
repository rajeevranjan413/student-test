
import { ThemeProvider } from "@/components/providers/ThemeProvider";
import { AntdProvider } from "@/components/providers/AntdProvider";
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
          <AntdProvider>{children}</AntdProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}