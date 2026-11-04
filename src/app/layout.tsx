import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Haunted House Inspector",
  description:
    "Upload a photo or video of your home problem and get an AI-powered diagnosis.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-white haunted:bg-haunted-bg haunted:text-haunted-text antialiased">
        {children}
      </body>
    </html>
  );
}
