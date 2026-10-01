package tr.com.letsgo2travel.app;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Only installed when the default Firebase app is absent; never pretends push is enabled. */
@CapacitorPlugin(name = "PushNotifications")
public class UnavailablePushNotificationsPlugin extends Plugin {
    @Override @PluginMethod public void checkPermissions(PluginCall call) { unavailable(call); }
    @Override @PluginMethod public void requestPermissions(PluginCall call) { unavailable(call); }
    @PluginMethod public void register(PluginCall call) { unavailable(call); }
    @PluginMethod public void unregister(PluginCall call) { call.resolve(); }
    @PluginMethod public void getDeliveredNotifications(PluginCall call) {
        call.resolve(new JSObject().put("notifications", new JSArray()));
    }
    @PluginMethod public void removeDeliveredNotifications(PluginCall call) { call.resolve(); }
    @PluginMethod public void removeAllDeliveredNotifications(PluginCall call) { call.resolve(); }
    @PluginMethod public void createChannel(PluginCall call) { unavailable(call); }
    @PluginMethod public void deleteChannel(PluginCall call) { call.resolve(); }
    @PluginMethod public void listChannels(PluginCall call) { call.resolve(new JSObject().put("channels", new JSArray())); }

    private void unavailable(PluginCall call) {
        call.reject("Push notifications are not configured in this Android build.", "push_not_configured");
    }
}
