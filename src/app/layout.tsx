import type { Metadata } from 'next';
import { Space_Grotesk, Inter, JetBrains_Mono, Cinzel } from 'next/font/google';
import Script from 'next/script';
import './globals.css';

// Bureau Ledger — Night default (v4.2)
// Display · Space Grotesk 400/500/700 (SIL OFL)
const spaceGrotesk = Space_Grotesk({
  variable: '--font-space-grotesk',
  subsets: ['latin'],
  weight: ['400', '500', '700'],
  display: 'swap',
});
// Body · Inter 400/500 (SIL OFL)
const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
  weight: ['400', '500'],
  display: 'swap',
});
// Mono · JetBrains Mono 400/500/700 (Apache 2.0)
const jetbrainsMono = JetBrains_Mono({
  variable: '--font-jetbrains-mono',
  subsets: ['latin'],
  weight: ['400', '500', '700'],
  display: 'swap',
});
// Mythic serif · Cinzel 700/900 (SIL OFL) — masthead + section titles only.
// Additive to the core stack; Space Grotesk remains the primary display face.
const cinzel = Cinzel({
  variable: '--font-cinzel',
  subsets: ['latin'],
  weight: ['700', '900'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Obolark · The agent economy, priced per crossing',
  description:
    'Twenty-two Penguin Alley agents hire each other in sub-cent USDC on Arc. Every inter-agent call pays its passage. Built for the Agentic Economy on Arc hackathon (Apr 20–26, 2026).',
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'),
  openGraph: {
    title: 'Obolark',
    description: 'The agent economy, priced per crossing.',
    type: 'website',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${spaceGrotesk.variable} ${inter.variable} ${jetbrainsMono.variable} ${cinzel.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-bone text-ink font-sans fx-atmosphere fx-embers fx-smoke fx-flicker">
        {children}
        <Script src="/ambient-fx.js" strategy="afterInteractive" />
      </body>
    </html>
  );
}
