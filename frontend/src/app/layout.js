import { ClerkProvider } from "@clerk/nextjs";
import { Geist, Geist_Mono } from "next/font/google";
import ConvexClientProvider from "./ConvexClientProvider";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata = {
  title: "Job Watch",
  description: "The newest fresher tech openings across Internshala, Foundit, Naukri, Indeed and more, on one screen.",
};

export const viewport = { width: "device-width", initialScale: 1 };

// The theme (light/dark/auto) is stored per account in Convex, but a
// database round trip cannot happen before the first paint -- so usePrefs
// mirrors every change into localStorage and this reads that cache.
// This inline script runs before paint and stamps the `dark` class itself,
// which avoids a flash of the wrong theme -- the alternative, deciding it in
// React state, would always paint light first and then flicker to dark.
const THEME_INIT = `
(function () {
  try {
    var raw = localStorage.getItem("jobfeed.prefs.v2");
    var theme = raw ? (JSON.parse(raw).theme || "auto") : "auto";
    var dark = theme === "dark" || (theme === "auto" && matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.classList.toggle("dark", dark);
  } catch (e) {}
})();
`;

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
      </head>
      <body className="h-full min-h-full flex flex-col bg-bg text-text font-sans text-[13.5px] leading-[1.45]" suppressHydrationWarning>
        <ClerkProvider>
          <ConvexClientProvider>{children}</ConvexClientProvider>
        </ClerkProvider>
      </body>
    </html>
  );
}