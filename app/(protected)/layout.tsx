import { TopNav } from "@/components/layout/Header"; // Adjust import path if needed

export default function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col bg-background transition-colors duration-300">
      {/* Upper Side Navbar persists across all protected routes */}
      <TopNav />
      
      {/* Page content will be injected here */}
      {children}
    </div>
  );
}