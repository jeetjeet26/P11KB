import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Agency Knowledge Base",
  description: "AI-powered knowledge base for ad agency clients.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-gray-50 text-gray-800 font-sans">
        {children}
      </body>
    </html>
  );
} 