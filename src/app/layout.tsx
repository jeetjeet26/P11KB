import './globals.css'

export const metadata = {
  title: 'Real Estate Campaign Service',
  description: 'Generate Google Ads campaigns for real estate properties using AI and your knowledge base',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className="bg-gray-50 min-h-screen">{children}</body>
    </html>
  )
}
