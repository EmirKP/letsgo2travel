package tr.com.letsgo2travel.app;

import static org.junit.Assert.*;

import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Typeface;
import android.graphics.pdf.PdfDocument;
import android.net.Uri;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.io.File;
import java.io.FileOutputStream;
import java.util.Locale;
import org.junit.Test;
import org.junit.runner.RunWith;

/** Exercises the bundled OCR model on a real Android runtime without a server or user data. */
@RunWith(AndroidJUnit4.class)
public class TicketDocumentReaderTest {
    private final Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();

    private void drawTicket(Canvas canvas) {
        canvas.drawColor(Color.WHITE);
        Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        paint.setColor(Color.BLACK);
        paint.setTypeface(Typeface.create(Typeface.SANS_SERIF, Typeface.BOLD));
        paint.setTextSize(38);
        canvas.drawText("BOARDING PASS", 50, 100, paint);
        canvas.drawText("TK 1234 IST LHR", 50, 170, paint);
        canvas.drawText("PNR AB12CD", 50, 240, paint);
        canvas.drawText("01 OCT 2026 14:30", 50, 310, paint);
    }

    private void assertTicket(TicketDocumentReader.Result result) {
        String text = result.text.toUpperCase(Locale.ROOT);
        assertTrue("Flight number recognized", text.contains("1234"));
        assertTrue("Airport code recognized", text.contains("IST"));
        assertTrue("PNR recognized", text.contains("AB12CD"));
    }

    private void assertNoTemporaryCopies() {
        File[] files = context.getCacheDir().listFiles((dir, name) -> name.startsWith("l2t-ticket-read-"));
        assertNotNull(files);
        assertEquals("Selected ticket copies are removed", 0, files.length);
    }

    @Test public void recognizesImageUsingBundledModel() throws Exception {
        File image = File.createTempFile("qa-ticket-", ".png", context.getCacheDir());
        Bitmap bitmap = Bitmap.createBitmap(900, 500, Bitmap.Config.ARGB_8888);
        try {
            drawTicket(new Canvas(bitmap));
            try (FileOutputStream output = new FileOutputStream(image)) { bitmap.compress(Bitmap.CompressFormat.PNG, 100, output); }
            TicketDocumentReader.Result result = new TicketDocumentReader(context).read(Uri.fromFile(image));
            assertTicket(result);
            assertFalse(result.truncated);
            assertNoTemporaryCopies();
        } finally { bitmap.recycle(); image.delete(); }
    }

    @Test public void readsPdfAndCapsPages() throws Exception {
        File file = File.createTempFile("qa-ticket-", ".pdf", context.getCacheDir());
        PdfDocument document = new PdfDocument();
        try {
            for (int index = 0; index < 7; index++) {
                PdfDocument.Page page = document.startPage(new PdfDocument.PageInfo.Builder(900, 500, index + 1).create());
                drawTicket(page.getCanvas());
                document.finishPage(page);
            }
            try (FileOutputStream output = new FileOutputStream(file)) { document.writeTo(output); }
            TicketDocumentReader.Result result = new TicketDocumentReader(context).read(Uri.fromFile(file));
            assertTicket(result);
            assertTrue("More than six pages is explicitly reported", result.truncated);
            assertEquals(6, result.text.split("BOARDING PASS", -1).length - 1);
            assertNoTemporaryCopies();
        } finally { document.close(); file.delete(); }
    }

    @Test public void rejectsOversizedDocumentsAndCleansFailedCopy() throws Exception {
        File file = File.createTempFile("qa-ticket-", ".bin", context.getCacheDir());
        try {
            try (FileOutputStream output = new FileOutputStream(file)) {
                byte[] block = new byte[1024 * 1024];
                for (int i = 0; i < 21; i++) output.write(block);
            }
            try {
                new TicketDocumentReader(context).read(Uri.fromFile(file));
                fail("Oversized provider content must be rejected");
            } catch (TicketDocumentReader.ReadFailure error) { assertEquals("ticket_too_large", error.code); }
            assertNoTemporaryCopies();
        } finally { file.delete(); }
    }

    @Test public void rejectsInvalidDocumentAndCleansFailedCopy() throws Exception {
        File file = File.createTempFile("qa-ticket-", ".bin", context.getCacheDir());
        try {
            try (FileOutputStream output = new FileOutputStream(file)) { output.write("Not an image or PDF".getBytes(java.nio.charset.StandardCharsets.UTF_8)); }
            try {
                new TicketDocumentReader(context).read(Uri.fromFile(file));
                fail("Unsupported files must not be treated as tickets");
            } catch (TicketDocumentReader.ReadFailure error) { assertEquals("ticket_unsupported", error.code); }
            assertNoTemporaryCopies();
        } finally { file.delete(); }
    }

    @Test public void cockpitAndAuthenticationDeepLinksResolveToThisApp() {
        for (String link : new String[]{"letsgo2travel://cockpit?tripId=11111111-1111-4111-8111-111111111111",
            "tr.com.letsgo2travel.app://auth/callback?code=qa-placeholder"}) {
            Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(link)).setPackage(context.getPackageName())
                .addCategory(Intent.CATEGORY_BROWSABLE);
            assertNotNull("Deep link must open the app", context.getPackageManager().resolveActivity(intent, 0));
        }
    }
}
