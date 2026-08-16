import { Inter, JetBrains_Mono } from "next/font/google";
import { AppShell } from "@/components/app-shell";
import { SidebarContent, MobileBar } from "@/components/sidebar";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const jetbrains = JetBrains_Mono({
  variable: "--font-jetbrains",
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
 * Root shell: collapsible sidebar on the left (top bar on mobile), content
 * column on the right — one continuous dark surface, split by a hairline.
 * The sidebar's server-rendered content passes through the client AppShell.
 */
export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrains.variable} h-full antialiased`}>
      <body className="flex min-h-full">
        <AppShell sidebar={<SidebarContent />}>
          <MobileBar />
          {children}
        </AppShell>
      </body>
    </html>
  );
}
