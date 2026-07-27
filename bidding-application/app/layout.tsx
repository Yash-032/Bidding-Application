import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "./contexts/AuthContext";
import { ToastProvider } from "./components/Toast";
import Navbar from "./components/Navbar"
export const metadata: Metadata = {
  title: "The Reserve - Curated Garments & Private Auctions",
  description: "Shop considered garments by category with secure direct checkout, plus selected administrator-controlled auctions.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className="h-full antialiased"
    >
      <body className="min-h-full flex flex-col bg-[var(--background)] text-[var(--foreground)]">
        <AuthProvider>
          <ToastProvider>
            <Navbar />
            <main className="flex-1 flex flex-col">
              {children}
            </main>
          </ToastProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
