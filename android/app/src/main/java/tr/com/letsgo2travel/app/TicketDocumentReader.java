package tr.com.letsgo2travel.app;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Color;
import android.graphics.Matrix;
import android.graphics.pdf.PdfRenderer;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import androidx.exifinterface.media.ExifInterface;
import com.google.android.gms.tasks.Tasks;
import com.google.mlkit.vision.common.InputImage;
import com.google.mlkit.vision.text.TextRecognition;
import com.google.mlkit.vision.text.TextRecognizer;
import com.google.mlkit.vision.text.latin.TextRecognizerOptions;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.util.concurrent.TimeUnit;

/** Bounded, on-device ticket OCR. Raw tickets/text never enter logs, analytics or a server. */
final class TicketDocumentReader {
    static final int MAX_FILE_BYTES = 20 * 1024 * 1024;
    static final int MAX_CHARACTERS = 24_000;
    static final int MAX_PAGES = 6;
    private static final String TEMP_PREFIX = "l2t-ticket-read-";
    private final Context context;

    TicketDocumentReader(Context context) { this.context = context; }

    static final class Result {
        final String text;
        final boolean truncated;
        Result(String text, boolean truncated) { this.text = text; this.truncated = truncated; }
    }

    static final class ReadFailure extends Exception {
        final String code;
        ReadFailure(String code) { super(code); this.code = code; }
    }

    static void cleanInterruptedReads(Context context) {
        File[] files = context.getCacheDir().listFiles((dir, name) -> name.startsWith(TEMP_PREFIX) && name.endsWith(".tmp"));
        if (files != null) for (File file : files) if (file.isFile()) file.delete();
    }

    Result read(Uri uri) throws Exception {
        File temp = File.createTempFile(TEMP_PREFIX, ".tmp", context.getCacheDir());
        TextRecognizer recognizer = null;
        try {
            // SAF providers may report an unknown or false size. Bound the actual bytes read.
            try (InputStream input = context.getContentResolver().openInputStream(uri);
                 FileOutputStream output = new FileOutputStream(temp)) {
                if (input == null) throw new ReadFailure("ticket_unreadable");
                byte[] buffer = new byte[8192];
                int total = 0, count;
                while ((count = input.read(buffer)) != -1) {
                    if (Thread.currentThread().isInterrupted()) throw new InterruptedException();
                    total += count;
                    if (total > MAX_FILE_BYTES) throw new ReadFailure("ticket_too_large");
                    output.write(buffer, 0, count);
                }
                if (total == 0) throw new ReadFailure("ticket_unreadable");
            }
            boolean pdf;
            try (FileInputStream input = new FileInputStream(temp)) {
                byte[] header = new byte[5];
                pdf = input.read(header) == 5 && header[0] == '%' && header[1] == 'P'
                    && header[2] == 'D' && header[3] == 'F' && header[4] == '-';
            }
            recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS);
            return pdf ? readPdf(temp, recognizer) : readImage(temp, recognizer);
        } finally {
            if (recognizer != null) recognizer.close();
            temp.delete();
        }
    }

    private Result readPdf(File file, TextRecognizer recognizer) throws Exception {
        try (ParcelFileDescriptor descriptor = ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY)) {
            // PdfRenderer needs a seekable descriptor. Unlink the private temporary copy now;
            // the descriptor stays valid and process termination cannot leave the ticket behind.
            file.delete();
            try (PdfRenderer document = new PdfRenderer(descriptor)) {
                if (document.getPageCount() == 0) throw new ReadFailure("ticket_unreadable");
                StringBuilder text = new StringBuilder();
                boolean truncated = document.getPageCount() > MAX_PAGES;
                for (int index = 0; index < Math.min(document.getPageCount(), MAX_PAGES); index++) {
                    if (Thread.currentThread().isInterrupted()) throw new InterruptedException();
                    try (PdfRenderer.Page page = document.openPage(index)) {
                        if (page.getWidth() <= 0 || page.getHeight() <= 0) throw new ReadFailure("ticket_unreadable");
                        double scale = 1800.0 / Math.max(page.getWidth(), page.getHeight());
                        Bitmap bitmap = Bitmap.createBitmap(Math.max(1, (int) Math.round(page.getWidth() * scale)),
                            Math.max(1, (int) Math.round(page.getHeight() * scale)), Bitmap.Config.ARGB_8888);
                        try {
                            bitmap.eraseColor(Color.WHITE);
                            page.render(bitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY);
                            String part = recognize(bitmap, recognizer);
                            if (text.length() > 0 && !part.isEmpty()) text.append('\n');
                            int remaining = MAX_CHARACTERS - text.length();
                            if (part.length() > remaining) truncated = true;
                            text.append(part, 0, Math.min(part.length(), remaining));
                        } finally { bitmap.recycle(); }
                    }
                    if (text.length() >= MAX_CHARACTERS) {
                        truncated = truncated || index + 1 < document.getPageCount();
                        break;
                    }
                }
                return new Result(text.toString(), truncated);
            }
        }
    }

    private Result readImage(File file, TextRecognizer recognizer) throws Exception {
        BitmapFactory.Options options = new BitmapFactory.Options();
        options.inJustDecodeBounds = true;
        BitmapFactory.decodeFile(file.getPath(), options);
        if (options.outWidth <= 0 || options.outHeight <= 0) throw new ReadFailure("ticket_unsupported");
        options.inSampleSize = 1;
        while ((long) Math.max(options.outWidth, options.outHeight) / options.inSampleSize > 2400) options.inSampleSize *= 2;
        options.inJustDecodeBounds = false;
        options.inPreferredConfig = Bitmap.Config.ARGB_8888;
        Bitmap original = BitmapFactory.decodeFile(file.getPath(), options);
        if (original == null) throw new ReadFailure("ticket_unreadable");
        Bitmap oriented = original;
        try {
            ExifInterface exif = new ExifInterface(file);
            Matrix transform = new Matrix();
            if (exif.isFlipped()) transform.postScale(-1f, 1f);
            transform.postRotate(exif.getRotationDegrees());
            if (!transform.isIdentity()) oriented = Bitmap.createBitmap(original, 0, 0, original.getWidth(), original.getHeight(), transform, true);
            file.delete();
            String text = recognize(oriented, recognizer);
            return new Result(text.substring(0, Math.min(text.length(), MAX_CHARACTERS)), text.length() > MAX_CHARACTERS);
        } finally {
            if (oriented != original) oriented.recycle();
            original.recycle();
        }
    }

    private String recognize(Bitmap bitmap, TextRecognizer recognizer) throws Exception {
        return Tasks.await(recognizer.process(InputImage.fromBitmap(bitmap, 0)), 30, TimeUnit.SECONDS).getText();
    }
}
