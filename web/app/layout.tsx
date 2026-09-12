import type { Metadata } from "next";
import "./globals.css";
import { WalletProvider } from "./components/Wallet";
import SmoothScroll from "./components/SmoothScroll";

// Hides the hero until its entrance has set its starting state, so nothing
// flashes in its final place first — only when motion is allowed, and never
// for longer than three seconds, whatever happens.
const HERO_PENDING = `(function(){try{if(!window.matchMedia('(prefers-reduced-motion: reduce)').matches){var d=document.documentElement;d.classList.add('hero-pending');setTimeout(function(){d.classList.remove('hero-pending')},3000);}}catch(e){}})();`;

// The icons and the card shown when the link is shared live in app/ as
// favicon.ico, icon.png, apple-icon.png and opengraph-image.png, which Next
// picks up by name. The base makes the card's address absolute.
export const metadata: Metadata = {
  metadataBase: new URL("https://voxel-bench-psi.vercel.app"),
  openGraph: {
    title: "Voxel Bench — craft your Roblox game, one object at a time",
    description:
      "An agent builds the 3D model you describe and uploads it to your Roblox account, paying its own way within a budget you set.",
    url: "/",
    siteName: "Voxel Bench",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Voxel Bench — craft your Roblox game, one object at a time",
    description:
      "An agent builds the 3D model you describe and uploads it to your Roblox account, paying its own way within a budget you set.",
  },
  title: "Voxel Bench — craft your Roblox game, one object at a time",
  description:
    "Describe what you need. An agent builds a 3D model and uploads it to your Roblox account, paying its own way within a budget you set. Objects and obbies work today, and when someone crafts your recipe, you earn 90%.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    // The class the script adds is not in the server's markup, by design.
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: HERO_PENDING }} />
      </head>
      <body className="antialiased">
        {/* Above everything: the header offers a connection and the bench
            uses it, and they have to be the same connection. */}
        <SmoothScroll>
          <WalletProvider>{children}</WalletProvider>
        </SmoothScroll>
      </body>
    </html>
  );
}
