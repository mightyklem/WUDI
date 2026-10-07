import type { Metadata } from 'next';
import { Manrope } from 'next/font/google';
import './globals.css';

// Self-hosted by next/font: one variable file, no render-blocking request to Google,
// and no third-party cookie. Works offline and in regions where Google Fonts is blocked.
const manrope = Manrope({
  subsets: ['latin', 'latin-ext'],
  display: 'swap',
  variable: '--font-manrope',
});

export const metadata: Metadata = {
  title: 'Learnovize — live trainings with verifiable certificates',
  description: 'Host live trainings, track real attendance, issue verifiable certificates.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={manrope.variable}>
      <body>{children}</body>
    </html>
  );
}
