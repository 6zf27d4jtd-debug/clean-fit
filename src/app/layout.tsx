import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import { Suspense } from "react";
import { AuthProvider, Splash } from "@/components/auth-provider";
import { BottomNav } from "@/components/bottom-nav";
import splashScreens from "@/lib/splash-screens.json";
import { themeScript } from "@/lib/theme";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Clean Fit",
  description: "Il tuo armadio, in ordine.",
  applicationName: "Clean Fit",
  appleWebApp: {
    capable: true,
    title: "Clean Fit",
    statusBarStyle: "default",
    // Immagini di avvio di iOS, una per misura di schermo e tema (scripts/generate-splash.mjs)
    startupImage: splashScreens.flatMap(({ width, height, ratio }) =>
      (["light", "dark"] as const).map((theme) => ({
        url: `/splash/splash-${width * ratio}x${height * ratio}-${theme}.png`,
        media:
          `(device-width: ${width}px) and (device-height: ${height}px) and (-webkit-device-pixel-ratio: ${ratio}) ` +
          `and (orientation: portrait) and (prefers-color-scheme: ${theme})`,
      })),
    ),
  },
  icons: {
    apple: "/icons/apple-touch-icon.png",
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fafaf8" },
    { media: "(prefers-color-scheme: dark)", color: "#0e0e0f" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="it" className={`${geistSans.variable} antialiased`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-dvh font-sans">
        {/* AuthProvider e BottomNav leggono l'indirizzo: nelle pagine con un id (es. /categoria/[id]) è noto solo
            alla richiesta, quindi con Cache Components serve un Suspense. Le pagine statiche non ne risentono. */}
        <Suspense fallback={<Splash />}>
          <AuthProvider>
            <main className="mx-auto min-h-dvh max-w-md px-5 pt-safe pb-nav">{children}</main>
            <BottomNav />
          </AuthProvider>
        </Suspense>
      </body>
    </html>
  );
}
