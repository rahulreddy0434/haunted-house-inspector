import type { Metadata } from "next";
import { ThemeProvider } from "@/components/ThemeProvider";
import { ProChromeProvider } from "@/components/pro/ProChromeContext";
import { MAIN_CONTENT_ID, SiteHeader } from "@/components/ui/SiteHeader";
import { SiteFooter } from "@/components/ui/SiteFooter";
import { PAGE_BG } from "@/components/ui/styles";
import { FogLayer } from "@/components/ui/haunted/FogLayer";
import { bodyFont, displayFont } from "./fonts";
import "./globals.css";
import "./haunted-motion.css";

export const metadata: Metadata = {
  title: "Haunted House Inspector",
  description:
    "Upload a photo or video of a home problem and get a plain-English idea of what it might be, who to call, how urgent it is and a rough cost range.",
};

// Static string only (no user data). Applies the stored theme before first paint.
const THEME_INIT_SCRIPT =
  "try{if(localStorage.getItem('hhi_theme')==='haunted'){document.documentElement.classList.add('theme-haunted')}}catch(e){}";

// Fonts: Inter (body) and Creepster (Haunted headings) are loaded from the repository
// via next/font/local, so the build never needs network access.
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${displayFont.variable} ${bodyFont.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className={`isolate flex min-h-screen flex-col antialiased haunted:bg-haunted-bg haunted:text-haunted-text ${PAGE_BG}`}>
        <ThemeProvider>
          <ProChromeProvider>
            <SiteHeader />
            <main id={MAIN_CONTENT_ID} className="flex-1">
              {children}
            </main>
          </ProChromeProvider>
          <FogLayer />
          <SiteFooter />
        </ThemeProvider>
      </body>
    </html>
  );
}
