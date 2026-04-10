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
          <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:py-4 sm:px-6 lg:px-8">
            <Link href="/" className="flex items-center gap-2 min-w-0">
              <span className="text-base sm:text-lg font-bold text-zinc-900 truncate">Resto Phone Agent</span>
            </Link>
            <nav className="flex items-center gap-2 shrink-0 ml-3">
              {/* Settings — icon-only on mobile, labelled on sm+ */}
              <Link
                href="/settings"
                className="rounded-lg border border-zinc-200 p-2 sm:px-4 sm:py-2 text-sm font-medium text-zinc-700 hover:border-zinc-300 hover:bg-zinc-50 transition-colors"
                aria-label="Settings"
              >
                {/* Gear icon (mobile) */}
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  className="h-4 w-4 sm:hidden"
                  aria-hidden="true"
                >
                  <path
                    fillRule="evenodd"
                    d="M7.84 1.804A1 1 0 018.82 1h2.36a1 1 0 01.98.804l.295 1.473c.497.144.971.342 1.416.587l1.25-.834a1 1 0 011.262.125l1.667 1.667a1 1 0 01.125 1.262l-.834 1.25c.245.445.443.919.587 1.416l1.473.295a1 1 0 01.804.98v2.36a1 1 0 01-.804.98l-1.473.295a6.95 6.95 0 01-.587 1.416l.834 1.25a1 1 0 01-.125 1.262l-1.667 1.667a1 1 0 01-1.262.125l-1.25-.834a6.953 6.953 0 01-1.416.587l-.295 1.473a1 1 0 01-.98.804H8.82a1 1 0 01-.98-.804l-.295-1.473a6.957 6.957 0 01-1.416-.587l-1.25.834a1 1 0 01-1.262-.125L2.95 15.778a1 1 0 01-.125-1.262l.834-1.25a6.957 6.957 0 01-.587-1.416l-1.473-.295A1 1 0 011 10.82V8.46a1 1 0 01.804-.98l1.473-.295c.144-.497.342-.971.587-1.416l-.834-1.25a1 1 0 01.125-1.262L4.821 1.59a1 1 0 011.262-.125l1.25.834c.445-.245.919-.443 1.416-.587L7.84 1.804zM10 13a3 3 0 100-6 3 3 0 000 6z"
                    clipRule="evenodd"
                  />
                </svg>
                {/* Label (sm+) */}
                <span className="hidden sm:inline">Settings</span>
              </Link>
              <Link
                href="/search"
                className="rounded-lg bg-zinc-900 px-3 py-2 sm:px-4 text-sm font-medium text-white hover:bg-zinc-700 transition-colors whitespace-nowrap"
              >
                <span className="sm:hidden">Search</span>
                <span className="hidden sm:inline">New Search</span>
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
