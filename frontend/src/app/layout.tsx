import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Sentinel — Video Anomaly Detection",
  description: "Real-time surveillance anomaly detection powered by Qdrant vector search and Twelve Labs Marengo video understanding.",
  icons: {
    icon: "/favicon.svg",
  },
  openGraph: {
    title: "Sentinel — Video Anomaly Detection",
    description: "Real-time surveillance anomaly detection powered by Qdrant vector search and Twelve Labs Marengo video understanding.",
    images: [{ url: "/api/og", width: 1200, height: 630 }],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Sentinel — Video Anomaly Detection",
    description: "Real-time surveillance anomaly detection powered by Qdrant vector search and Twelve Labs Marengo video understanding.",
    images: ["/api/og"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
