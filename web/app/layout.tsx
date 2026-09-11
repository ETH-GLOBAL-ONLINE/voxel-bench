import type { Metadata } from "next";
import "./globals.css";
import { WalletProvider } from "./components/Wallet";

export const metadata: Metadata = {
  title: "Voxel Bench — craft your Roblox game, one object at a time",
  description:
    "Describe what you need. An agent builds it in Blender, uploads it to your own Roblox account, and pays for each step from its own wallet. Recipes are reusable, and their authors earn onchain on every craft.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="antialiased">
        {/* Above everything: the header offers a connection and the bench
            uses it, and they have to be the same connection. */}
        <WalletProvider>{children}</WalletProvider>
      </body>
    </html>
  );
}
