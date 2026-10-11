import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Gusto NutriBite · Your food questions, answered",
  description:
    "Your personal AI nutrition companion. Ask about everyday food, nutrition, cooking and food safety.",
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
