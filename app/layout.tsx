import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'RE:ACT - Emergency Intelligence Platform',
  description:
    'Emergency intelligence and coordination platform for industrial workplaces',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
