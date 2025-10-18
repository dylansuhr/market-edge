import type { Metadata } from 'next'
import './globals.css'

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
    <html lang="en">
      <body>
        <nav className="bg-gray-800 text-white p-4">
          <div className="container mx-auto flex flex-wrap gap-6">
            <a href="/" className="hover:text-blue-400">Overview</a>
            <a href="/trades" className="hover:text-blue-400">Trades</a>
            <a href="/performance" className="hover:text-blue-400">Performance</a>
            <a href="/agent" className="hover:text-blue-400">Agent Stats</a>
            <a href="/ai-log" className="hover:text-blue-400">AI Log</a>
            <a href="/automation" className="hover:text-blue-400">Automation</a>
          </div>
        </nav>
        <main className="container mx-auto p-8">
          {children}
        </main>
      </body>
    </html>
  )
}
