import type { Metadata } from 'next'
import './globals.css'
import { MarketClock } from '../components/MarketClock'
import localFont from 'next/font/local'

const inter = localFont({
  src: [
    {
      path: '../public/fonts/inter/Inter-VariableFont_opsz,wght.ttf',
      weight: '100 900',
      style: 'normal'
    },
    {
      path: '../public/fonts/inter/Inter-Italic-VariableFont_opsz,wght.ttf',
      weight: '100 900',
      style: 'italic'
    }
  ],
  variable: '--font-inter'
})

export const metadata: Metadata = {
  title: 'Market Edge - RL Trading Dashboard',
  description: 'Q-Learning day trading system dashboard',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="bg-brand-background font-sans text-slate-900">
        <nav className="bg-brand-surface/80 backdrop-blur-sm shadow-sm">
          <div className="container mx-auto flex flex-wrap items-center justify-between gap-4 p-4">
            <div className="flex flex-wrap items-center gap-4 text-sm font-medium text-slate-600">
              <a href="/" className="rounded-full px-4 py-2 transition hover:bg-brand-muted hover:text-brand">Overview</a>
              <a href="/trades" className="rounded-full px-4 py-2 transition hover:bg-brand-muted hover:text-brand">Trades</a>
              <a href="/performance" className="rounded-full px-4 py-2 transition hover:bg-brand-muted hover:text-brand">Performance</a>
              <a href="/agent" className="rounded-full px-4 py-2 transition hover:bg-brand-muted hover:text-brand">Agent Stats</a>
              <a href="/capital" className="rounded-full px-4 py-2 transition hover:bg-brand-muted hover:text-brand">Capital Discipline</a>
              <a href="/ai-log" className="rounded-full px-4 py-2 transition hover:bg-brand-muted hover:text-brand">AI Log</a>
              <a href="/automation" className="rounded-full px-4 py-2 transition hover:bg-brand-muted hover:text-brand">Automation</a>
            </div>
            <MarketClock />
          </div>
        </nav>
        <main className="container mx-auto p-6 md:p-10">
          {children}
        </main>
      </body>
    </html>
  )
}
