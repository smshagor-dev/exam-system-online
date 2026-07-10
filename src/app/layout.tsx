import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import 'ckeditor5/ckeditor5.css'
import { Toaster } from '@/components/ui/toaster'
import { LanguageProvider } from '@/components/i18n/LanguageProvider'
import LanguagePreferenceModal from '@/components/i18n/LanguagePreferenceModal'
import { getCurrentLocale, getMessages } from '@/lib/i18n/server'
import { getAvailableLocaleOptions } from '@/lib/i18n/locales'
import { getBrandingConfig } from '@/lib/system-settings'

const inter = Inter({ subsets: ['latin'] })

export async function generateMetadata(): Promise<Metadata> {
  const branding = await getBrandingConfig()

  return {
    title: branding.name,
    description: branding.description,
    icons: branding.iconUrl ? { icon: branding.iconUrl, shortcut: branding.iconUrl, apple: branding.iconUrl } : undefined,
  }
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const locale = await getCurrentLocale()
  const [messages, locales] = await Promise.all([getMessages(locale), getAvailableLocaleOptions()])

  return (
    <html lang={locale}>
      <body className={inter.className}>
        <LanguageProvider locale={locale} locales={locales} messages={messages}>
          {children}
          <LanguagePreferenceModal />
          <Toaster />
        </LanguageProvider>
      </body>
    </html>
  )
}
