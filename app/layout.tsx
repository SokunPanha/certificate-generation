import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Certificate Generator",
  description: "Design and generate certificates with a Canva-like editor",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body className="h-full bg-gray-200 text-gray-900 antialiased">{children}</body>
    </html>
  );
}
