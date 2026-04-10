import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import Link from 'next/link';
import './globals.css';

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] });
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Resto Phone Agent',
  description: 'AI-powered restaurant phone agent for dietary restrictions',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <header className="border-b border-zinc-200 bg-white">
          <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
            <Link href="/" className="flex items-center gap-2">
              <span className="text-lg font-bold text-zinc-900">Resto Phone Agent</span>
            </Link>
            <nav className="flex items-center gap-3">
              <Link
                href="/settings"
                className="rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 hover:border-zinc-300 hover:bg-zinc-50 transition-colors"
              >
                Settings
              </Link>
              <Link
                href="/search"
                className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 transition-colors"
              >
                New Search
              </Link>
            </nav>
          </div>
        </header>

        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6 lg:px-8">
          {children}
        </main>

        <footer className="border-t border-zinc-200 py-4 text-center text-xs text-zinc-400">
          Resto Phone Agent · Built for Mitchel Campbell
        </footer>
      </body>
    </html>
  );
}
