package tr.com.letsgo2travel.app;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.mlkit.common.model.DownloadConditions;
import com.google.mlkit.common.model.RemoteModelManager;
import com.google.mlkit.nl.translate.TranslateLanguage;
import com.google.mlkit.nl.translate.TranslateRemoteModel;
import com.google.mlkit.nl.translate.Translation;
import com.google.mlkit.nl.translate.Translator;
import com.google.mlkit.nl.translate.TranslatorOptions;
import java.util.Set;
import java.util.HashSet;
import java.util.concurrent.atomic.AtomicBoolean;

@CapacitorPlugin(name = "OfflineTranslation")
public class OfflineTranslationPlugin extends Plugin {
    private final AtomicBoolean busy = new AtomicBoolean(false);
    private String[] pair(PluginCall call) {
        String source = TranslateLanguage.fromLanguageTag(call.getString("source", ""));
        String target = TranslateLanguage.fromLanguageTag(call.getString("target", ""));
        return source == null || target == null || source.equals(target) ? null : new String[]{source, target};
    }
    private boolean installed(Set<TranslateRemoteModel> models, String[] pair) {
        Set<String> languages = new HashSet<>();
        languages.add("en"); // ML Kit's other language models translate via English.
        for (TranslateRemoteModel model : models) languages.add(model.getLanguage());
        return languages.contains(pair[0]) && languages.contains(pair[1]);
    }
    @PluginMethod public void status(PluginCall call) {
        String[] pair = pair(call);
        if (pair == null) { call.resolve(new JSObject().put("status", "unsupported")); return; }
        RemoteModelManager.getInstance().getDownloadedModels(TranslateRemoteModel.class)
            .addOnSuccessListener(models -> call.resolve(new JSObject().put("status", installed(models, pair) ? "installed" : "supported")))
            .addOnFailureListener(error -> call.reject("Model status unavailable"));
    }
    @PluginMethod public void prepare(PluginCall call) { perform(call, true); }
    @PluginMethod public void translate(PluginCall call) { perform(call, false); }
    private void perform(PluginCall call, boolean download) {
        String[] pair = pair(call);
        String text = call.getString("text", "").trim();
        if (pair == null || (!download && (text.isEmpty() || text.length() > 2000))) { call.reject("Invalid request"); return; }
        if (!busy.compareAndSet(false, true)) { call.reject("Translation busy"); return; }
        Translator translator = Translation.getClient(new TranslatorOptions.Builder().setSourceLanguage(pair[0]).setTargetLanguage(pair[1]).build());
        if (download) {
            translator.downloadModelIfNeeded(new DownloadConditions.Builder().requireWifi().build())
                .addOnSuccessListener(ignored -> { translator.close(); busy.set(false); call.resolve(); })
                .addOnFailureListener(error -> { translator.close(); busy.set(false); call.reject("Download failed"); });
        } else {
            // translate() never downloads missing models. Only prepare() may access the network.
            translator.translate(text)
                .addOnSuccessListener(result -> { translator.close(); busy.set(false); call.resolve(new JSObject().put("text", result)); })
                .addOnFailureListener(error -> { translator.close(); busy.set(false); call.reject("Translation failed; prepare language packs first"); });
        }
    }
}
