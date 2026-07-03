import './globals.css'

import type { Metadata } from 'next'
import type { ReactNode } from 'react'

export const metadata: Metadata = {
  title: 'mpp.bratislava.sk',
  description: 'MPP frontend',
}

const RootLayout = ({ children }: Readonly<{ children: ReactNode }>) => {
  return (
    <html lang="sk" className="h-full antialiased">
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  )
}

export default RootLayout
