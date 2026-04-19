import type { Metadata } from 'next';
import { Space_Grotesk, Inter, JetBrains_Mono } from 'next/font/google';
import './globals.css';

// Direction B — Obolark Terminal
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
// Pixel's first choice was Monaspace Neon (also OFL) but it isn't on Google Fonts.
// JetBrains Mono is Pixel's documented fallback in VISUAL_SIGNATURE.md.
const jetbrainsMono = JetBrains_Mono({
  variable: '--font-jetbrains-mono',
  subsets: ['latin'],
  weight: ['400', '500', '700'],
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
      className={`${spaceGrotesk.variable} ${inter.variable} ${jetbrainsMono.variable} h-full antialiased`}
      // Lock light mode — brand rule (EO-016 + brand always-light)
      data-theme="light"
    >
      <body className="min-h-full flex flex-col bg-bone text-ink font-sans">
        {children}
      </body>
    </html>
  );
}
