import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import "@solana/wallet-adapter-react-ui/styles.css"; // Import wallet adapter styles
import type { Viewport } from 'next' // Import Viewport type

import { ClientProviders } from "@/components/ClientProviders"; // Import the new wrapper
import { Header } from "@/components/Header"; // Import the Header component
import { AlertModal } from "@/components/AlertModal"; // Import the AlertModal component

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

// Metadata can remain static for now
// export const metadata: Metadata = {
//     title: "wLiquify Pool",
//     description: "Frontend for wLiquify Index Pool",
// };

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
                <ClientProviders>
                    <Header />
                    <main className="pt-28">
                        {children}
                    </main>
                    <AlertModal />
                </ClientProviders>
            </body>
        </html>
    );
}
