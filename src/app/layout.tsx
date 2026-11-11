import type { Metadata } from "next";
import Link from "next/link";
import { ThemeToggle } from "@/components/ThemeToggle";
import "./globals.css";

export const metadata: Metadata = {
  title: "Haunted House Inspector",
  description:
    "Upload a photo or video of a home problem and get a plain-English idea of what it might be, who to call, how urgent it is and a rough cost range.",
};

// Static string only (no user data). Applies the stored theme before first paint.
const THEME_INIT_SCRIPT =
  "try{if(localStorage.getItem('hhi_theme')==='haunted'){document.documentElement.classList.add('theme-haunted')}}catch(e){}";

// Fonts: the system font stack (see tailwind.config.ts / globals.css) is used on purpose,
// so the build never needs network access to fetch Google Fonts.
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="flex min-h-screen flex-col bg-white text-gray-900 antialiased haunted:bg-haunted-bg haunted:text-haunted-text">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-white focus:px-4 focus:py-2 focus:text-gray-900 focus:shadow haunted:focus:bg-haunted-surface haunted:focus:text-haunted-text"
        >
          Skip to main content
        </a>
        <header className="flex items-center justify-between border-b border-gray-200 px-4 py-3 haunted:border-haunted-border">
          <Link href="/" className="text-lg font-semibold haunted:text-haunted-accent">
            Haunted House Inspector
          </Link>
          <ThemeToggle />
        </header>
        <main id="main-content" className="flex-1">
          {children}
        </main>
        <footer className="border-t border-gray-200 px-4 py-3 text-center text-sm text-gray-600 haunted:border-haunted-border haunted:text-haunted-muted">
          Estimates only. Not a professional inspection.
        </footer>
      </body>
    </html>
  );
}
