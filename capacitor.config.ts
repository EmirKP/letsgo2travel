import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "tr.com.letsgo2travel.app",
  appName: "LetsGo2Travel",
  webDir: "mobile-dist",
  backgroundColor: "#2352C4",
  appendUserAgent: " LetsGo2TravelNative/1.4",
  // Yayında bridge yanıtları (özellikle push kayıt sonucu) cihaz konsoluna
  // yazılmasın. Geliştirici gerektiğinde Xcode/Safari debug araçlarını açar.
  loggingBehavior: "none",
  // Native WebView ölçeklemesi kapalıdır; form alanları 16px ve tüm ana
  // yüzeyler dar ekranda tek sütuna indiği için odak zoom'una gerek kalmaz.
  zoomEnabled: false,

  server: {
    errorPath: "error.html",
  },

  android: {
    backgroundColor: "#2352C4",
    allowMixedContent: false,
  },

  ios: {
    backgroundColor: "#2352C4",
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
      // Native katman yalnızca WebView hazır olana kadar marka mavisi kalır;
      // asıl marka animasyonu React katmanında akıcı biçimde oynar.
      launchShowDuration: 350,
      launchAutoHide: true,
      backgroundColor: "#2352C4",
      showSpinner: false,
      androidScaleType: "CENTER_CROP",
      splashFullScreen: true,
      splashImmersive: true,
    },
    StatusBar: {
      style: "LIGHT",
      backgroundColor: "#2352C4",
      // Video ve üst menü güvenli alanın arkasına kesintisiz uzanır;
      // her iki yüzey safe-area dolgusu kullandığı için içerik çentiğe girmez.
      overlaysWebView: true,
    },
  },
};

export default config;
