"use client";

import { useEffect } from "react";

// Converts an emoji to a data URL that can be used as a favicon
function emojiToFavicon(emoji: string) {
  const canvas = document.createElement("canvas");
  canvas.height = 64;
  canvas.width = 64;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.font = "50px serif";
    ctx.fillText(emoji, 0, 50);
  }
  return canvas.toDataURL();
}

export default function CountryFavicon({ emoji }: { emoji: string }) {
  useEffect(() => {
    let link: HTMLLinkElement | null = document.querySelector("link[rel~='icon']");
    if (!link) {
      link = document.createElement("link");
      link.rel = "icon";
      document.head.appendChild(link);
    }
    
    // Store original favicon to restore it on unmount
    const originalFavicon = link.href;
    
    // Set dynamic emoji favicon
    if (emoji) {
      link.href = emojiToFavicon(emoji);
    }

    return () => {
      // Restore on unmount
      if (link) {
        link.href = originalFavicon;
      }
    };
  }, [emoji]);

  return null;
}
