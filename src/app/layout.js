import { Space_Mono, Space_Grotesk, Doto } from "next/font/google";
import { AppShell } from "@/components/app-shell";
import { SidebarContent, MobileBar } from "@/components/sidebar";
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
 * Root shell: collapsible sidebar on the left (top bar on mobile), content
 * column on the right — one continuous black surface, split by a hairline.
 * The sidebar's server-rendered content passes through the client AppShell.
 */
export default function RootLayout({ children }) {
  return (
    <html
      lang="en"
      className={`${spaceMono.variable} ${spaceGrotesk.variable} ${doto.variable} h-full antialiased`}
    >
      <body className="flex min-h-full">
        <AppShell sidebar={<SidebarContent />}>
          <MobileBar />
          {children}
        </AppShell>
      </body>
    </html>
  );
}
