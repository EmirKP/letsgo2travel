package tr.com.letsgo2travel.app;

import android.content.pm.ApplicationInfo;
import android.os.Bundle;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;
import com.google.firebase.FirebaseApp;

public class MainActivity extends BridgeActivity {

    @Override
    protected void load() {
        try {
            FirebaseApp.getInstance();
        } catch (IllegalStateException missingFirebaseConfiguration) {
            // A local debug APK can run before Firebase is configured. The upstream push
            // plugin throws outside the JS promise when register/unregister has no default
            // FirebaseApp. Register last so these calls fail safely instead of killing it.
            initialPlugins.add(UnavailablePushNotificationsPlugin.class);
        }
        super.load();
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(OfflineTranslationPlugin.class);
        registerPlugin(TicketImportPlugin.class);
        super.onCreate(savedInstanceState);

        boolean isDebuggable =
                (getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0;

        WebView.setWebContentsDebuggingEnabled(isDebuggable);
    }
}
