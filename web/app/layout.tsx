import type { Metadata } from "next";
import "./globals.css";
import { WalletProvider } from "./components/Wallet";
import SmoothScroll from "./components/SmoothScroll";

// Hides the hero until its entrance has set its starting state, so nothing
// flashes in its final place first — only when motion is allowed, and never
// for longer than three seconds, whatever happens.
const HERO_PENDING = `(function(){try{if(!window.matchMedia('(prefers-reduced-motion: reduce)').matches){var d=document.documentElement;d.classList.add('hero-pending');setTimeout(function(){d.classList.remove('hero-pending')},3000);}}catch(e){}})();`;

export const metadata: Metadata = {
  title: "Voxel Bench — craft your Roblox game, one object at a time",
  description:
    "Describe what you need. An agent builds it in Blender, uploads it to your own Roblox account, and pays for each step from a budget you give it. Recipes are reusable, their authors earn onchain on every craft, and they combine into playable obbies.",
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
