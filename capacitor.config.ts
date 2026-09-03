import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "tr.com.letsgo2travel.app",
  appName: "LetsGo2Travel",
  webDir: "mobile-dist",
  backgroundColor: "#071B33",
  appendUserAgent: " LetsGo2TravelNative/1.4",
  // Yayında bridge yanıtları (özellikle push kayıt sonucu) cihaz konsoluna
  // yazılmasın. Geliştirici gerektiğinde Xcode/Safari debug araçlarını açar.
  loggingBehavior: "none",
  // Sistem erişilebilirlik yakınlaştırmasını engelleme. Harita kendi
  // yakınlaştırmasını ayrıca yönettiği için uygulama geneli de %200'e
  // kadar okunabilir kalabilir.
  zoomEnabled: true,

  server: {
    errorPath: "error.html",
  },

  android: {
    backgroundColor: "#071B33",
    allowMixedContent: false,
  },

  ios: {
    backgroundColor: "#071B33",
    contentInset: "never",
    scrollEnabled: true,
    allowsLinkPreview: false,
    preferredContentMode: "mobile",
    webContentsDebuggingEnabled: false,
  },

  plugins: {
    CapacitorHttp: {
      enabled: true,
    },
    // Uygulama ON PLANDAYKEN gelen push bildirimlerinin de gosterilmesi
    // icin gerekli (yoksa iOS foreground'da bildirimi sessizce yutar).
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
    SplashScreen: {
      // Native katman yalnızca WebView hazır olana kadar düz lacivert kalır;
      // asıl marka animasyonu React katmanında akıcı biçimde oynar.
      launchShowDuration: 350,
      launchAutoHide: true,
      backgroundColor: "#071B33",
      showSpinner: false,
      androidScaleType: "CENTER_CROP",
      splashFullScreen: true,
      splashImmersive: true,
    },
    StatusBar: {
      style: "LIGHT",
      backgroundColor: "#071B33",
      overlaysWebView: false,
    },
  },
};

export default config;
