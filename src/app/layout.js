import { Space_Mono, Space_Grotesk, Doto } from "next/font/google";
import { TopNav } from "@/components/top-nav";
import { MobileGate } from "@/components/mobile-gate";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

/* Riften's own stack: Space Mono carries every label, Space Grotesk carries
   prose, Doto (dot-matrix) carries the big numerals. */
const spaceMono = Space_Mono({
  variable: "--font-space-mono",
  weight: ["400", "700"],
  subsets: ["latin"],
});

const spaceGrotesk = Space_Grotesk({
  variable: "--font-grotesk",
  subsets: ["latin"],
});

const doto = Doto({
  variable: "--font-doto",
  subsets: ["latin"],
});

export const metadata = {
  title: {
    default: "Riften · Post-training data",
    template: "%s · Riften",
  },
  description: "Turn router traces into training data.",
};

export const viewport = {
  themeColor: "#000000",
};

/**
 * Root shell: a single horizontal top nav over a full-width content column.
 * No rails, no permanent chrome below the nav — navigation and pagination
 * appear as floating layers when the user reaches for them.
 */
export default function RootLayout({ children }) {
  return (
    <html
      lang="en"
      className={`${spaceMono.variable} ${spaceGrotesk.variable} ${doto.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        {/* Small viewports get the gate instead of the app — the whole app
            tree stays desktop-only (hidden below md, gate hidden above). */}
        <MobileGate />
        <div className="hidden min-h-full flex-1 flex-col md:flex">
          <TopNav />
          <main className="flex min-h-[calc(100dvh-49px)] flex-1 flex-col">{children}</main>
        </div>
        <Analytics />
      </body>
    </html>
  );
}
