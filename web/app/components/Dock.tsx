"use client";

// Marketplace and Backpack, floating on the right like a game's menu.
//
// They stay out of the way over the hero and slide in once the page has
// scrolled most of the way past it; each still opens its own modal as before.
// On a phone they sit in the bottom-right corner, within reach of a thumb.

import { useEffect, useState } from "react";
import Backpack from "./Backpack";
import MarketplaceModal from "./MarketplaceModal";

export default function Dock() {
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const check = () => {
      const hero = document.getElementById("top");
      setShown(window.scrollY > (hero?.offsetHeight ?? 600) * 0.7);
    };
    check();
    window.addEventListener("scroll", check, { passive: true });
    window.addEventListener("resize", check);
    return () => {
      window.removeEventListener("scroll", check);
      window.removeEventListener("resize", check);
    };
  }, []);

  return (
    <nav
      aria-label="Marketplace and backpack"
      className={`dock fixed right-4 bottom-6 z-[55] flex flex-col gap-3 transition-[translate,opacity] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none md:top-1/2 md:right-6 md:bottom-auto md:-translate-y-1/2 ${
        shown ? "translate-x-0 opacity-100" : "pointer-events-none translate-x-[140%] opacity-0"
      }`}
    >
      <MarketplaceModal />
      <Backpack />
    </nav>
  );
}
