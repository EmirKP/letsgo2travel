package tr.com.letsgo2travel.app;

import android.view.View;
import android.view.ViewTreeObserver;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Observes IME visibility without replacing Capacitor's inset handling or changing padding. */
@CapacitorPlugin(name = "KeyboardState")
public class KeyboardStatePlugin extends Plugin {
    private View decorView;
    private Boolean lastVisible;
    private volatile boolean destroyed;
    private final ViewTreeObserver.OnGlobalLayoutListener layoutListener = () -> {
        if (destroyed) return;
        boolean visible = keyboardVisible();
        if (lastVisible == null || lastVisible != visible) {
            lastVisible = visible;
            notifyListeners("keyboardStateChanged", new JSObject().put("visible", visible));
        }
    };

    @Override public void load() {
        getActivity().runOnUiThread(() -> {
            if (destroyed) return;
            decorView = getActivity().getWindow().getDecorView();
            decorView.getViewTreeObserver().addOnGlobalLayoutListener(layoutListener);
        });
    }

    private boolean keyboardVisible() {
        WindowInsetsCompat insets = decorView == null ? null : ViewCompat.getRootWindowInsets(decorView);
        return insets != null && insets.isVisible(WindowInsetsCompat.Type.ime());
    }

    @PluginMethod public void getState(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            if (destroyed) { call.reject("Keyboard observer closed"); return; }
            call.resolve(new JSObject().put("visible", keyboardVisible()));
        });
    }

    @Override protected void handleOnDestroy() {
        destroyed = true;
        getActivity().runOnUiThread(() -> {
            if (decorView != null && decorView.getViewTreeObserver().isAlive()) {
                decorView.getViewTreeObserver().removeOnGlobalLayoutListener(layoutListener);
            }
            decorView = null;
        });
        super.handleOnDestroy();
    }
}
