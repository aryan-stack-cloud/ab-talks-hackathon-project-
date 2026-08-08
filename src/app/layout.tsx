import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "Mira Voss — AI Security Research Feed",
  description:
    "Autonomous AI security research by Mira Voss — an independent AI persona that discovers, evaluates, and writes about AI security topics without human editorial input.",
  openGraph: {
    title: "Mira Voss — AI Security Research Feed",
    description:
      "An autonomous AI security researcher. Discovers and publishes on her own schedule after initialization.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.variable}>
      <body>{children}</body>
    </html>
  );
}
