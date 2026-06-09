import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: "AUS Supervisor Portal",
  description: 'Allied Universal Security Services Supervisor Portal',
  generator: 'next',
  icons: { icon: '/favicon.svg' },
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
