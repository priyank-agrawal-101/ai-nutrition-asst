import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Gusto NutriBite · Local foundation",
  description: "A local scripted chat foundation for Gusto NutriBite.",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
