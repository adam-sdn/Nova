import type { Metadata } from "next";
import { BrandFilters } from "@/lib/ui/brand";
import "./globals.css";

export const metadata: Metadata = {
  title: "Nova Systems",
  description: "Demo: multilingual, human-verified patient flow for an emergency department. Synthetic data only.",
};

// Fonts come from the system stack in globals.css (--font-sans / --font-mono): nothing to download.
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen font-sans text-ink antialiased">
        <BrandFilters />
        {children}
      </body>
    </html>
  );
}
