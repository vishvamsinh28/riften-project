import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { NavLinks } from "@/components/nav";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata = {
  title: {
    default: "Riften · Post-training data",
    template: "%s · Riften",
  },
  description: "Turn router traces into training data.",
};

/**
 * Root shell: fonts, sticky top navigation, content column, footer.
 * Every page renders inside the main column; nav state lives in NavLinks.
 */
export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <header className="sticky top-0 z-40 border-b border-edge bg-bg/90 backdrop-blur">
          <div className="mx-auto flex h-12 w-full max-w-350 items-center gap-6 px-6">
            <Link href="/" className="flex items-baseline gap-2">
              <span className="font-mono text-sm font-semibold tracking-tight text-ink">riften</span>
              <span className="microlabel mt-px">post-training data</span>
            </Link>
            <NavLinks />
            <div className="ml-auto hidden items-center gap-2 sm:flex">
              <span className="microlabel">router traces → SFT · preference</span>
            </div>
          </div>
        </header>
        <main className="mx-auto w-full max-w-350 flex-1 px-6 py-8">{children}</main>
        <footer className="border-t border-edge">
          <div className="mx-auto flex h-11 w-full max-w-350 items-center justify-between px-6">
            <span className="microlabel">synthetic corpus · no production traffic</span>
            <span className="microlabel">riften router · trace platform</span>
          </div>
        </footer>
      </body>
    </html>
  );
}
