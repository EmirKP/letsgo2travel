"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Capacitor } from "@capacitor/core";
import { App } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { Haptics, ImpactStyle } from "@capacitor/haptics";
import { Network } from "@capacitor/network";
import { SplashScreen } from "@capacitor/splash-screen";
import { StatusBar, Style } from "@capacitor/status-bar";

export default function NativeAppBridge() {
  const router = useRouter();

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    document.documentElement.classList.add("l2t-native-app");
    void StatusBar.setStyle({ style: Style.Light }).catch(() => undefined);
    void StatusBar.setBackgroundColor({ color: "#071B33" }).catch(() => undefined);
    void SplashScreen.hide().catch(() => undefined);

    const networkListener = Network.addListener("networkStatusChange", (status) => {
      document.documentElement.classList.toggle("l2t-is-offline", !status.connected);
    });
    void Network.getStatus().then((status) => document.documentElement.classList.toggle("l2t-is-offline", !status.connected));

    const appListener = App.addListener("backButton", ({ canGoBack }) => {
      if (canGoBack) window.history.back();
      else void App.minimizeApp();
    });

    const deepLinkListener = App.addListener("appUrlOpen", ({ url }) => {
      try {
        const parsed = new URL(url);
        const isWebDomain = parsed.hostname === "www.letsgo2travel.com.tr" || parsed.hostname === "letsgo2travel.com.tr";
        const nextPath = isWebDomain
          ? `${parsed.pathname}${parsed.search}${parsed.hash}`
          : `/${[parsed.hostname, parsed.pathname].filter(Boolean).join("/").replace(/^\/+/, "")}${parsed.search}${parsed.hash}`;
        router.push(nextPath || "/");
      } catch {
        router.push("/");
      }
    });

    const clickHandler = (event: MouseEvent) => {
      const anchor = (event.target as HTMLElement).closest("a");
      if (!anchor) return;
      const href = anchor.href;
      if (!href || href.startsWith(window.location.origin) || href.startsWith("mailto:") || href.startsWith("tel:")) return;
      event.preventDefault();
      void Haptics.impact({ style: ImpactStyle.Light }).catch(() => undefined);
      void Browser.open({ url: href, presentationStyle: "popover" });
    };
    document.addEventListener("click", clickHandler);

    return () => {
      document.documentElement.classList.remove("l2t-native-app", "l2t-is-offline");
      document.removeEventListener("click", clickHandler);
      void networkListener.then((listener) => listener.remove());
      void appListener.then((listener) => listener.remove());
      void deepLinkListener.then((listener) => listener.remove());
    };
  }, [router]);

  return null;
}
