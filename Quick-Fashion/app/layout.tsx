import type { Metadata } from "next";
import { Bodoni_Moda, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "./contexts/AuthContext";
import { ToastProvider } from "./components/Toast";
import Navbar from "./components/Navbar"
import SiteTimeTracker from "./components/SiteTimeTracker"

const siteMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-site-mono",
});

const siteEditorial = Bodoni_Moda({
  subsets: ["latin"],
  variable: "--font-site-editorial",
});
export const metadata: Metadata = {
  title: "Quick Fashion",
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
      className={`${siteMono.variable} ${siteEditorial.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-[var(--background)] text-[var(--foreground)]">
        <AuthProvider>
          <ToastProvider>
            <SiteTimeTracker />
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
