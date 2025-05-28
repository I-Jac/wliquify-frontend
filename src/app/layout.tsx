import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import "@solana/wallet-adapter-react-ui/styles.css"; // Import wallet adapter styles
import type { Viewport, Metadata } from 'next' // Import Viewport and Metadata types
import Script from 'next/script'; // Import Next.js Script component
import { SpeedInsights } from "@vercel/speed-insights/next";

import { ClientProviders } from "@/components/core/ClientProviders"; // Import the new wrapper
import { Header } from "@/components/layout/Header"; // Import the Header component
import { AlertModal } from "@/components/ui/AlertModal"; // Import the AlertModal component
import { Footer } from "@/components/layout/Footer"; // Import the Footer component

const geistSans = Geist({
    variable: "--font-geist-sans",
    subsets: ["latin"],
});

const geistMono = Geist_Mono({
    variable: "--font-geist-mono",
    subsets: ["latin"],
});

// --- Viewport Settings --- 
export const viewport: Viewport = {
  width: 'device-width',
  // Omit initialScale to allow browser to zoom-to-fit
  userScalable: true, // Ensure user can zoom
}

export const metadata: Metadata = {
  title: "wLiquify",
  description: "Decentralized Liquidity Provisioning Protocol",
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {

    return (
        <html lang="en" className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
            <head>
                {/* Jupiter Terminal Script using next/script for better handling */}
                <Script src='https://terminal.jup.ag/main-v4.js' data-preload strategy="beforeInteractive" />
            </head>
            <body>
                <ClientProviders>
                    <div className="flex flex-col min-h-screen">
                        <Header />
                        <main className="flex-grow">
                            {children}
                        </main>
                        <Footer />
                    </div>
                    <AlertModal />
                </ClientProviders>
                <SpeedInsights />
            </body>
        </html>
    );
}
