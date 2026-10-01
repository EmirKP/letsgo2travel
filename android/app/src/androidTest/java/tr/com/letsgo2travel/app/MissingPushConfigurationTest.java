package tr.com.letsgo2travel.app;

import static org.junit.Assert.*;
import static org.junit.Assume.assumeTrue;

import android.content.Context;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import com.getcapacitor.JSObject;
import com.getcapacitor.PluginCall;
import com.google.firebase.FirebaseApp;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public class MissingPushConfigurationTest {
    static class ObservedCall extends PluginCall {
        final CountDownLatch complete = new CountDownLatch(1);
        String errorCode;
        boolean resolved;
        ObservedCall(String method) { super(null, "PushNotifications", "qa-push", method, new JSObject()); }
        @Override public void reject(String message, String code, Exception error, JSObject data) {
            errorCode = code;
            complete.countDown();
        }
        @Override public void resolve() { resolved = true; complete.countDown(); }
    }

    @Test public void unconfiguredPushCannotCrashRegisterOrLogout() throws Exception {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        assumeTrue("This regression targets builds without Firebase configuration", FirebaseApp.getApps(context).isEmpty());
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            ObservedCall register = new ObservedCall("register");
            scenario.onActivity(activity -> {
                assertEquals(UnavailablePushNotificationsPlugin.class, activity.getBridge().getPlugin("PushNotifications").getPluginClass());
                activity.getBridge().callPluginMethod("PushNotifications", "register", register);
            });
            assertTrue(register.complete.await(5, TimeUnit.SECONDS));
            assertEquals("push_not_configured", register.errorCode);
            assertFalse(register.resolved);
            ObservedCall unregister = new ObservedCall("unregister");
            scenario.onActivity(activity -> activity.getBridge().callPluginMethod("PushNotifications", "unregister", unregister));
            assertTrue(unregister.complete.await(5, TimeUnit.SECONDS));
            assertTrue(unregister.resolved);
        }
    }
}
