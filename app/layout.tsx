import type React from "react"
import type { Metadata, Viewport } from "next"
import { Geist, Geist_Mono, Libre_Baskerville } from "next/font/google"
import { Analytics } from "@vercel/analytics/next"
import "./globals.css"

const _geist = Geist({ subsets: ["latin"] })
const _geistMono = Geist_Mono({ subsets: ["latin"] })
const _libreBaskerville = Libre_Baskerville({
  subsets: ["latin"],
  weight: ["400", "700"],
  style: ["normal", "italic"],
})

export const viewport: Viewport = {
  themeColor: "white",
  width: "device-width",
  initialScale: 0.8,
  maximumScale: 1,
  userScalable: false,
}

export const metadata: Metadata = {
  title: "Det industrielle samfunnet og dets framtid",
  description: "1995",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Næss",
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="no">
      <body className={`font-serif antialiased`}>
        {children}
        <Analytics />
      </body>
    </html>
  )
}
