import type { Metadata } from "next";
import { Toaster } from "sonner";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";

export const metadata: Metadata = {
  title: "EduTest.AI",
  description: "AI-powered CBSE/NCERT test paper generation and evaluation.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body>
        {children}
        <Toaster richColors position="top-center" />
        <SpeedInsights />
      </body>
    </html>
  );
}
