package tr.com.letsgo2travel.app;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import androidx.activity.result.ActivityResult;
import androidx.activity.result.PickVisualMediaRequest;
import androidx.activity.result.contract.ActivityResultContracts.PickVisualMedia;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

/** The picker grants access to one document only. Never requests library/storage access. */
@CapacitorPlugin(name = "TicketImport")
public class TicketImportPlugin extends Plugin {
    private final AtomicBoolean busy = new AtomicBoolean(false);
    private final ExecutorService reader = Executors.newSingleThreadExecutor();

    @Override public void load() {
        TicketDocumentReader.cleanInterruptedReads(getContext());
    }

    @PluginMethod public void pickAndRead(PluginCall call) {
        String source = call.getString("source", "files");
        if (!"photos".equals(source) && !"files".equals(source)) {
            call.reject("ticket_unsupported", "ticket_unsupported");
            return;
        }
        if (!busy.compareAndSet(false, true)) {
            call.reject("ticket_busy", "ticket_busy");
            return;
        }
        getActivity().runOnUiThread(() -> {
            try {
                Intent intent;
                if ("photos".equals(source)) {
                    // AndroidX falls back to OPEN_DOCUMENT when the photo picker is unavailable.
                    intent = new PickVisualMedia().createIntent(getContext(),
                        new PickVisualMediaRequest.Builder().setMediaType(PickVisualMedia.ImageOnly.INSTANCE).build());
                } else {
                    intent = new Intent(Intent.ACTION_OPEN_DOCUMENT)
                        .addCategory(Intent.CATEGORY_OPENABLE)
                        .setType("*/*")
                        .putExtra(Intent.EXTRA_MIME_TYPES, new String[]{"application/pdf", "image/*"})
                        .putExtra(Intent.EXTRA_ALLOW_MULTIPLE, false);
                }
                intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                startActivityForResult(call, intent, "ticketSelected");
            } catch (RuntimeException error) {
                busy.set(false);
                call.reject("ticket_unreadable", "ticket_unreadable");
            }
        });
    }

    @ActivityCallback private void ticketSelected(PluginCall call, ActivityResult result) {
        if (call == null) { busy.set(false); return; }
        Uri uri = result.getData() == null ? null : result.getData().getData();
        if (result.getResultCode() != Activity.RESULT_OK || uri == null) {
            busy.set(false);
            call.resolve(new JSObject().put("text", "").put("cancelled", true).put("truncated", false));
            return;
        }
        // Accept only a provider URI explicitly granted by the picker, never remote URLs.
        if (!"content".equals(uri.getScheme())) {
            busy.set(false);
            call.reject("ticket_unsupported", "ticket_unsupported");
            return;
        }
        try {
            reader.execute(() -> {
                try {
                    TicketDocumentReader.Result text = new TicketDocumentReader(getContext()).read(uri);
                    call.resolve(new JSObject().put("text", text.text).put("cancelled", false).put("truncated", text.truncated));
                } catch (TicketDocumentReader.ReadFailure failure) {
                    call.reject(failure.code, failure.code);
                } catch (Exception error) {
                    call.reject("ticket_unreadable", "ticket_unreadable");
                } finally {
                    busy.set(false);
                }
            });
        } catch (RuntimeException error) {
            busy.set(false);
            call.reject("ticket_unreadable", "ticket_unreadable");
        }
    }

    @Override protected void handleOnDestroy() {
        reader.shutdownNow();
        super.handleOnDestroy();
    }
}
