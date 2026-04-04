import "./globals.css";

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "KvK Prep Helper",
  description: "Full-stack foundation for Kingshot KvK prep scheduling."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
