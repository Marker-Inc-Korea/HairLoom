package com.markerinc.hairloom;

import android.app.AlertDialog;
import android.content.ContentValues;
import android.content.Context;
import android.graphics.BitmapFactory;
import android.content.SharedPreferences;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.text.InputType;
import android.text.method.PasswordTransformationMethod;
import android.util.Base64;
import android.widget.EditText;
import android.widget.LinearLayout;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.ByteArrayOutputStream;
import java.io.DataOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.FutureTask;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

@CapacitorPlugin(name = "HairloomProvider")
public class HairloomProviderPlugin extends Plugin {
    private static final String API_URL = "https://api.openai.com/v1/images/edits";
    private static final String ANALYSIS_URL = "https://api.openai.com/v1/responses";
    private static final String ANALYSIS_MODEL = "gpt-4.1-mini";
    private static final int MAX_ANALYSIS_BYTES = 1024 * 1024;
    private static final String MODEL = "gpt-image-2";
    private static final int SLOT_COUNT = 100;
    private static final int MAX_SOURCE_BYTES = 15 * 1024 * 1024;
    private static final int MAX_OUTPUT_BYTES = 24 * 1024 * 1024;
    private static final long CUSTOMER_DATA_TTL_MS = 7L * 24 * 60 * 60 * 1000;
    private final ExecutorService workers = Executors.newFixedThreadPool(4);
    private final ConcurrentHashMap<String, Future<?>> active = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, HttpURLConnection> connections = new ConcurrentHashMap<>();
    private Vault vault;
    private Journal journal;
    private File privateRoot;

    @Override
    public void load() {
        vault = new Vault(getContext());
        journal = new Journal(getContext());
        privateRoot = new File(getContext().getFilesDir(), "hairloom-private");
        new File(privateRoot, "sources").mkdirs();
        new File(privateRoot, "outputs").mkdirs();
        new File(privateRoot, "jobs").mkdirs();
        journal.recoverInterrupted();
        journal.cleanupExpired(System.currentTimeMillis() - CUSTOMER_DATA_TTL_MS);
        cleanupPrivateFiles();
        resumeAll();
    }

    @Override
    protected void handleOnDestroy() {
        for (HttpURLConnection connection : connections.values()) connection.disconnect();
        workers.shutdownNow();
    }

    @PluginMethod
    public void status(PluginCall call) {
        JSObject result = new JSObject();
        result.put("available", true);
        result.put("configured", vault.hasSecret());
        result.put("provider", "OpenAI Image API");
        result.put("model", MODEL);
        call.resolve(result);
    }

    @PluginMethod
    public void configure(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            EditText keyField = new EditText(getActivity());
            keyField.setHint("sk-...");
            keyField.setSingleLine(true);
            keyField.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_VISIBLE_PASSWORD | InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS);
            keyField.setTransformationMethod(PasswordTransformationMethod.getInstance());
            keyField.setImportantForAutofill(EditText.IMPORTANT_FOR_AUTOFILL_NO_EXCLUDE_DESCENDANTS);
            LinearLayout layout = new LinearLayout(getActivity());
            layout.setOrientation(LinearLayout.VERTICAL);
            int padding = Math.round(24 * getContext().getResources().getDisplayMetrics().density);
            layout.setPadding(padding, padding / 2, padding, 0);
            layout.addView(keyField);
            AlertDialog dialog = new AlertDialog.Builder(getActivity())
                .setTitle(vault.hasSecret() ? "API 키 변경" : "API 키 입력")
                .setMessage("별도 과금 OpenAI API 키를 입력하세요. 키는 Android Keystore에만 저장되고 웹 화면·브라우저 저장소·로그에는 전달되지 않습니다.")
                .setView(layout)
                .setPositiveButton(vault.hasSecret() ? "변경" : "저장", null)
                .setNegativeButton("취소", (ignored, which) -> call.reject("cancelled"))
                .setCancelable(false)
                .create();
            dialog.setOnShowListener(ignored -> {
                keyField.requestFocus();
                dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(view -> {
                    String value = keyField.getText().toString().trim();
                    if (value.length() < 20) {
                        keyField.setError("API 키를 확인해주세요.");
                        return;
                    }
                    try {
                        vault.write(value);
                        JSObject result = new JSObject();
                        result.put("configured", true);
                        result.put("provider", "OpenAI Image API");
                        result.put("model", MODEL);
                        call.resolve(result);
                        resumeAll();
                        dialog.dismiss();
                    } catch (Exception error) {
                        keyField.setError("보안 저장소에 저장하지 못했습니다.");
                    }
                });
            });
            dialog.show();
        });
    }

    @PluginMethod
    public void clear(PluginCall call) {
        vault.clear();
        journal.releaseForCredentialClear();
        for (HttpURLConnection connection : connections.values()) connection.disconnect();
        for (Future<?> future : active.values()) future.cancel(true);
        connections.clear();
        active.clear();
        call.resolve();
    }

    @PluginMethod
    public void createSource(PluginCall call) {
        workers.execute(() -> {
            try {
                String viewKey = required(call.getString("viewKey"), "viewKey");
                String sourceHash = required(call.getString("sourceHash"), "sourceHash").toLowerCase(Locale.ROOT);
                String mimeType = required(call.getString("mimeType"), "mimeType").toLowerCase(Locale.ROOT);
                String encoded = required(call.getString("base64"), "base64");
                if (!Set.of("front", "side", "back", "crown", "nape", "detail").contains(viewKey)) throw new SafeException("invalid-source-view");
                if (!sourceHash.matches("[a-f0-9]{64}")) throw new SafeException("invalid-source-hash");
                if (!Set.of("image/jpeg", "image/png", "image/webp").contains(mimeType)) throw new SafeException("invalid-source-type");
                byte[] bytes = Base64.decode(encoded, Base64.DEFAULT);
                if (bytes.length < 32 || bytes.length > MAX_SOURCE_BYTES || !imageMatches(bytes, mimeType) || !validDimensions(bytes)) throw new SafeException("invalid-source-image");
                if (!sha256(bytes).equals(sourceHash)) throw new SafeException("source-hash-mismatch");
                String sourceId = opaque("source");
                String suffix = mimeType.equals("image/png") ? ".png" : mimeType.equals("image/webp") ? ".webp" : ".jpg";
                File file = new File(new File(privateRoot, "sources"), sourceId + suffix);
                writePrivate(file, bytes);
                journal.insertSource(sourceId, sourceHash, viewKey, mimeType, file.getName());
                JSObject result = new JSObject();
                result.put("sourceId", sourceId);
                result.put("sourceHash", sourceHash);
                result.put("bytes", bytes.length);
                call.resolve(result);
            } catch (SafeException error) {
                call.reject(error.getMessage());
            } catch (Exception error) {
                call.reject("source-storage");
            }
        });
    }

    @PluginMethod
    public void deleteSource(PluginCall call) {
        try {
            String sourceId = validateTypedOpaque(call.getString("sourceId"), "source");
            if (journal.sourceInUse(sourceId)) {
                call.reject("source-in-use");
                return;
            }
            SourceRecord source = journal.source(sourceId);
            if (source != null) new File(new File(privateRoot, "sources"), source.fileName).delete();
            journal.deleteSource(sourceId);
            call.resolve();
        } catch (SafeException error) {
            call.reject(error.getMessage());
        }
    }

    @PluginMethod
    public void readSource(PluginCall call) {
        workers.execute(() -> {
            try {
                String sourceId = validateTypedOpaque(call.getString("sourceId"), "source");
                SourceRecord source = journal.source(sourceId);
                if (source == null) throw new SafeException("source-not-found");
                byte[] bytes = readLimited(new File(new File(privateRoot, "sources"), source.fileName), MAX_SOURCE_BYTES);
                JSObject result = new JSObject();
                result.put("sourceId", sourceId);
                result.put("sourceHash", source.hash);
                result.put("viewKey", source.view);
                result.put("mimeType", source.mimeType);
                result.put("bytes", bytes.length);
                result.put("dataUrl", "data:" + source.mimeType + ";base64," + Base64.encodeToString(bytes, Base64.NO_WRAP));
                call.resolve(result);
            } catch (SafeException error) {
                call.reject(error.getMessage());
            } catch (Exception error) {
                call.reject("source-read");
            }
        });
    }

    @PluginMethod
    public void runAnalysis(PluginCall call) {
        workers.execute(() -> {
            try {
                String sourceId = validateTypedOpaque(call.getString("sourceId"), "source");
                String sourceHash = required(call.getString("sourceHash"), "sourceHash").toLowerCase(Locale.ROOT);
                String freePrompt = call.getString("freePrompt", "").trim();
                if (!sourceHash.matches("[a-f0-9]{64}") || freePrompt.length() > 500) throw new SafeException("invalid-analysis-request");
                SourceRecord source = journal.source(sourceId);
                if (source == null || !source.hash.equals(sourceHash)) throw new SafeException("source-ownership");
                byte[] sourceBytes = readLimited(new File(new File(privateRoot, "sources"), source.fileName), MAX_SOURCE_BYTES);
                String apiKey = vault.read();
                if (apiKey == null || apiKey.length() < 20) throw new SafeException("not-configured");
                JSObject result = requestHairAnalysis(apiKey, source, sourceBytes, freePrompt);
                call.resolve(result);
            } catch (SafeException error) {
                call.reject(error.getMessage());
            } catch (Exception error) {
                call.reject("analysis-provider");
            }
        });
    }

    @PluginMethod
    public void createBatch(PluginCall call) {
        workers.execute(() -> {
            try {
                if (!vault.hasSecret()) throw new SafeException("not-configured");
                String batchId = validateOpaque(call.getString("batchId"));
                String sourcePhotoKey = validateOpaque(call.getString("sourcePhotoKey"));
                JSArray slots = call.getArray("slots");
                JSObject context = call.getObject("context", new JSObject());
                validateContext(context, 0);
                if (slots == null || slots.length() != SLOT_COUNT) throw new SafeException("invalid-slot-count");
                Set<Integer> indexes = new HashSet<>();
                List<SlotInput> inputs = new ArrayList<>();
                for (int index = 0; index < slots.length(); index++) {
                    JSONObject raw = slots.getJSONObject(index);
                    SlotInput input = SlotInput.parse(raw);
                    if (!indexes.add(input.slotIndex)) throw new SafeException("duplicate-slot");
                    SourceRecord source = journal.source(input.sourceId);
                    if (source == null || !source.hash.equals(input.sourceHash)) throw new SafeException("source-ownership");
                    inputs.add(input);
                }
                if (indexes.size() != SLOT_COUNT) throw new SafeException("invalid-slot-indexes");
                File batchJobs = new File(new File(privateRoot, "jobs"), batchId);
                if (!batchJobs.exists() && !batchJobs.mkdirs()) throw new IOException("jobs");
                try {
                    writePrivate(new File(batchJobs, "context.json"), context.toString().getBytes(StandardCharsets.UTF_8));
                    for (SlotInput input : inputs) {
                        JSONObject job = input.toJob();
                        writePrivate(new File(batchJobs, input.slotIndex + ".json"), job.toString().getBytes(StandardCharsets.UTF_8));
                    }
                    journal.createBatch(batchId, sourcePhotoKey, inputs);
                } catch (Exception error) {
                    deleteTree(batchJobs);
                    throw error;
                }
                for (SlotInput input : inputs) emit(journal.event(batchId, input, "queued", null, null, 0, 0));
                JSObject result = new JSObject();
                result.put("batchId", batchId);
                result.put("slotCount", SLOT_COUNT);
                call.resolve(result);
                dispatch(batchId);
            } catch (SafeException error) {
                call.reject(error.getMessage());
            } catch (Exception error) {
                call.reject("batch-storage");
            }
        });
    }

    @PluginMethod
    public void batchStatus(PluginCall call) {
        try {
            String batchId = validateOpaque(call.getString("batchId"));
            JSObject result = journal.snapshot(batchId);
            File contextFile = new File(new File(new File(privateRoot, "jobs"), batchId), "context.json");
            if (result != null && contextFile.isFile()) result.put("context", new JSONObject(new String(readLimited(contextFile, 64 * 1024), StandardCharsets.UTF_8)));
            if (result == null) call.reject("batch-not-found");
            else call.resolve(result);
        } catch (SafeException error) {
            call.reject(error.getMessage());
        } catch (Exception error) {
            call.reject("batch-status");
        }
    }

    @PluginMethod
    public void cancelBatch(PluginCall call) {
        try {
            String batchId = validateOpaque(call.getString("batchId"));
            journal.cancelBatch(batchId);
            for (String key : new ArrayList<>(active.keySet())) {
                if (!key.startsWith(batchId + ":")) continue;
                HttpURLConnection connection = connections.remove(key);
                if (connection != null) connection.disconnect();
                Future<?> future = active.remove(key);
                if (future != null) future.cancel(true);
            }
            call.resolve(journal.snapshot(batchId));
        } catch (SafeException error) {
            call.reject(error.getMessage());
        }
    }

    @PluginMethod
    public void readOutput(PluginCall call) {
        workers.execute(() -> {
            try {
                String outputId = validateTypedOpaque(call.getString("outputId"), "output");
                OutputRecord output = journal.output(outputId);
                if (output == null) throw new SafeException("output-not-found");
                File file = new File(new File(privateRoot, "outputs"), output.fileName);
                byte[] bytes = readLimited(file, MAX_OUTPUT_BYTES);
                JSObject result = new JSObject();
                result.put("outputId", outputId);
                result.put("mimeType", output.mimeType);
                result.put("bytes", bytes.length);
                result.put("dataUrl", "data:" + output.mimeType + ";base64," + Base64.encodeToString(bytes, Base64.NO_WRAP));
                call.resolve(result);
            } catch (SafeException error) {
                call.reject(error.getMessage());
            } catch (Exception error) {
                call.reject("output-read");
            }
        });
    }

    @PluginMethod
    public void deleteCustomerData(PluginCall call) {
        for (HttpURLConnection connection : connections.values()) connection.disconnect();
        for (Future<?> future : active.values()) future.cancel(true);
        active.clear();
        connections.clear();
        journal.clearCustomerData();
        deleteChildren(privateRoot);
        new File(privateRoot, "sources").mkdirs();
        new File(privateRoot, "outputs").mkdirs();
        new File(privateRoot, "jobs").mkdirs();
        call.resolve();
    }

    private void resumeAll() {
        if (journal == null || vault == null || !vault.hasSecret()) return;
        for (String batchId : journal.resumableBatches()) dispatch(batchId);
    }

    private synchronized void dispatch(String batchId) {
        if (!vault.hasSecret() || journal.batchCancelled(batchId)) return;
        int capacity = Math.max(0, 4 - active.size());
        for (SlotRecord slot : journal.queuedSlots(batchId, capacity)) {
            String key = batchId + ":" + slot.slotIndex;
            if (active.containsKey(key)) continue;
            FutureTask<Void> future = new FutureTask<>(() -> { runSlot(slot, key); return null; });
            active.put(key, future);
            workers.execute(future);
        }
    }

    private void runSlot(SlotRecord slot, String key) {
        try {
            if (journal.batchCancelled(slot.batchId)) return;
            int attempt = journal.markRunning(slot.batchId, slot.slotIndex);
            if (!vault.hasSecret()) { journal.retry(slot.batchId, slot.slotIndex); return; }
            emit(journal.event(slot.batchId, slot.input, "running", null, null, 0, attempt));
            File jobFile = new File(new File(new File(privateRoot, "jobs"), slot.batchId), slot.slotIndex + ".json");
            JSONObject job = new JSONObject(new String(readLimited(jobFile, 64 * 1024), StandardCharsets.UTF_8));
            SourceRecord source = journal.source(job.getString("sourceId"));
            if (source == null || !source.hash.equals(job.getString("sourceHash"))) throw new SafeException("source-ownership");
            File sourceFile = new File(new File(privateRoot, "sources"), source.fileName);
            String apiKey = vault.read();
            if (apiKey == null || apiKey.length() < 20) throw new SafeException("not-configured");
            byte[] outputBytes = requestImageEdit(key, apiKey, sourceFile, source.mimeType, job.getString("prompt"));
            if (journal.batchCancelled(slot.batchId)) return;
            if (!vault.hasSecret() || !journal.slotRunning(slot.batchId, slot.slotIndex)) { journal.retry(slot.batchId, slot.slotIndex); return; }
            String mime = detectMime(outputBytes);
            if (!"image/jpeg".equals(mime) || outputBytes.length > MAX_OUTPUT_BYTES || !validDimensions(outputBytes)) throw new SafeException("invalid-output");
            String outputId = opaque("output");
            File outputFile = new File(new File(privateRoot, "outputs"), outputId + (mime.equals("image/png") ? ".png" : ".jpg"));
            writePrivate(outputFile, outputBytes);
            journal.complete(slot.batchId, slot.slotIndex, outputId, mime, outputFile.getName(), outputBytes.length);
            emit(journal.event(slot.batchId, slot.input, "done", outputId, null, 200, attempt));
        } catch (ProviderException error) {
            int attempts = journal.attempts(slot.batchId, slot.slotIndex);
            if (journal.batchCancelled(slot.batchId)) return;
            if (!vault.hasSecret() || !journal.slotRunning(slot.batchId, slot.slotIndex)) { journal.retry(slot.batchId, slot.slotIndex); return; }
            if (error.pressure && attempts < 2) {
                journal.retry(slot.batchId, slot.slotIndex);
                emit(journal.event(slot.batchId, slot.input, "retryable", null, "retryable", error.statusCode, attempts));
                try { Thread.sleep(Math.min(120000L, 30000L * attempts)); } catch (InterruptedException interrupted) { Thread.currentThread().interrupt(); return; }
            } else {
                journal.fail(slot.batchId, slot.slotIndex, error.code);
                emit(journal.event(slot.batchId, slot.input, "failed", null, error.code, error.statusCode, attempts));
            }
        } catch (Exception error) {
            int attempts = journal.attempts(slot.batchId, slot.slotIndex);
            if (journal.batchCancelled(slot.batchId)) return;
            if (!vault.hasSecret() || !journal.slotRunning(slot.batchId, slot.slotIndex)) { journal.retry(slot.batchId, slot.slotIndex); return; }
            if (error instanceof IOException && attempts < 2) {
                journal.retry(slot.batchId, slot.slotIndex);
                emit(journal.event(slot.batchId, slot.input, "retryable", null, "network", 0, attempts));
                try { Thread.sleep(Math.min(120000L, 30000L * attempts)); } catch (InterruptedException interrupted) { Thread.currentThread().interrupt(); return; }
                return;
            }
            String code = error instanceof SafeException ? error.getMessage() : "native-provider";
            journal.fail(slot.batchId, slot.slotIndex, code);
            emit(journal.event(slot.batchId, slot.input, "failed", null, code, 0, attempts));
        } finally {
            connections.remove(key);
            active.remove(key);
            dispatch(slot.batchId);
        }
    }

    private JSObject requestHairAnalysis(String apiKey, SourceRecord source, byte[] sourceBytes, String freePrompt) throws Exception {
        if (apiKey == null || apiKey.length() < 20) throw new SafeException("not-configured");
        String requestKey = "analysis:" + UUID.randomUUID();
        HttpURLConnection connection = (HttpURLConnection) new URL(ANALYSIS_URL).openConnection();
        connections.put(requestKey, connection);
        try {
            connection.setInstanceFollowRedirects(false);
            connection.setConnectTimeout(30000);
            connection.setReadTimeout(180000);
            connection.setRequestMethod("POST");
            connection.setDoOutput(true);
            connection.setRequestProperty("Authorization", "Bearer " + apiKey);
            connection.setRequestProperty("Content-Type", "application/json");
            JSONObject body = new JSONObject();
            body.put("model", ANALYSIS_MODEL);
            JSONArray content = new JSONArray();
            content.put(new JSONObject().put("type", "input_text").put("text", hairAnalysisPrompt(freePrompt)));
            content.put(new JSONObject().put("type", "input_image").put("image_url", "data:" + source.mimeType + ";base64," + Base64.encodeToString(sourceBytes, Base64.NO_WRAP)));
            body.put("input", new JSONArray().put(new JSONObject().put("role", "user").put("content", content)));
            byte[] requestBytes = body.toString().getBytes(StandardCharsets.UTF_8);
            try (DataOutputStream output = new DataOutputStream(connection.getOutputStream())) { output.write(requestBytes); }
            int status = connection.getResponseCode();
            if (status < 200 || status >= 300) {
                drain(connection.getErrorStream(), MAX_ANALYSIS_BYTES);
                if (status == 401 || status == 403) throw new SafeException("unauthorized");
                if (status == 429) throw new SafeException("rate-limited");
                throw new SafeException(status >= 500 ? "provider-unavailable" : "analysis-provider");
            }
            JSONObject payload = new JSONObject(new String(readLimited(connection.getInputStream(), MAX_ANALYSIS_BYTES), StandardCharsets.UTF_8));
            String text = analysisText(payload);
            int start = text.indexOf('{');
            int end = text.lastIndexOf('}');
            if (start < 0 || end <= start) throw new SafeException("invalid-analysis-output");
            return sanitizeAnalysis(new JSONObject(text.substring(start, end + 1)));
        } finally {
            connections.remove(requestKey);
            connection.disconnect();
        }
    }

    private static String hairAnalysisPrompt(String freePrompt) {
        String request = freePrompt.isBlank() ? "현재 헤어를 유지하면서 어울리는 스타일을 폭넓게 추천" : freePrompt;
        return String.join("\n",
            "Analyze only the visible hair in the single original customer photo.",
            "Never infer or describe identity, age, ethnicity, face shape, body, health, or gender identity.",
            "catalogLine means haircut geometry only: F for softer connected curves, M for directional barber-like planes, U when neutral or uncertain.",
            "Do not claim chemical history, bleach count, perm timing, extensions, or hidden scalp condition from pixels. Use null and add an uncertainty when not stated in the user request.",
            "Return JSON only with: catalogLine, currentLength (0..4), actualLengthCm, naturalTexture (straight|wavy|curly|coily), density (low|normal|high), damage (low|medium|high visible appearance only), currentToneId, targetToneIds, colorIntensity (subtle|balanced|vivid), similarity (0..4), confidence (0..1), uncertainties, summaryKo.",
            "USER REQUEST: " + request
        );
    }

    private static String analysisText(JSONObject payload) throws JSONException, SafeException {
        String direct = payload.optString("output_text", "");
        if (!direct.isBlank()) return direct;
        JSONArray output = payload.optJSONArray("output");
        if (output != null) {
            for (int index = 0; index < output.length(); index++) {
                JSONArray content = output.optJSONObject(index) == null ? null : output.optJSONObject(index).optJSONArray("content");
                if (content == null) continue;
                for (int item = 0; item < content.length(); item++) {
                    String text = content.optJSONObject(item) == null ? "" : content.optJSONObject(item).optString("text", "");
                    if (!text.isBlank()) return text;
                }
            }
        }
        throw new SafeException("invalid-analysis-output");
    }

    private static JSObject sanitizeAnalysis(JSONObject raw) throws JSONException, SafeException {
        JSObject result = new JSObject();
        for (String key : List.of("catalogLine", "naturalTexture", "density", "damage", "currentToneId", "colorIntensity", "summaryKo")) {
            if (!raw.isNull(key)) result.put(key, boundedAnalysisString(raw.optString(key, ""), key.equals("summaryKo") ? 180 : 80));
        }
        for (String key : List.of("currentLength", "actualLengthCm", "similarity", "confidence")) {
            if (!raw.isNull(key)) {
                Object value = raw.opt(key);
                if (!(value instanceof Number)) throw new SafeException("invalid-analysis-output");
                result.put(key, value);
            }
        }
        for (String key : List.of("targetToneIds", "uncertainties")) {
            JSONArray source = raw.optJSONArray(key);
            if (source == null) continue;
            JSONArray values = new JSONArray();
            for (int index = 0; index < Math.min(source.length(), 16); index++) values.put(boundedAnalysisString(source.optString(index, ""), 160));
            result.put(key, values);
        }
        if (result.length() == 0) throw new SafeException("invalid-analysis-output");
        return result;
    }

    private static String boundedAnalysisString(String value, int maximum) throws SafeException {
        String normalized = value.trim();
        if (normalized.length() > maximum) throw new SafeException("invalid-analysis-output");
        return normalized;
    }

    private byte[] requestImageEdit(String jobKey, String apiKey, File source, String mimeType, String prompt) throws Exception {
        String boundary = "Hairloom" + UUID.randomUUID().toString().replace("-", "");
        HttpURLConnection connection = (HttpURLConnection) new URL(API_URL).openConnection();
        connections.put(jobKey, connection);
        connection.setInstanceFollowRedirects(false);
        connection.setConnectTimeout(30000);
        connection.setReadTimeout(180000);
        connection.setRequestMethod("POST");
        connection.setDoOutput(true);
        connection.setRequestProperty("Authorization", "Bearer " + apiKey);
        connection.setRequestProperty("Content-Type", "multipart/form-data; boundary=" + boundary);
        try (DataOutputStream output = new DataOutputStream(connection.getOutputStream())) {
            field(output, boundary, "model", MODEL);
            field(output, boundary, "prompt", prompt);
            field(output, boundary, "size", "1024x1024");
            field(output, boundary, "quality", "low");
            field(output, boundary, "output_format", "jpeg");
            field(output, boundary, "output_compression", "70");
            output.writeBytes("--" + boundary + "\r\n");
            String sourceExtension = "image/png".equals(mimeType) ? "png" : "image/webp".equals(mimeType) ? "webp" : "jpg";
            output.writeBytes("Content-Disposition: form-data; name=\"image\"; filename=\"prepared-original." + sourceExtension + "\"\r\n");
            output.writeBytes("Content-Type: " + mimeType + "\r\n\r\n");
            try (FileInputStream input = new FileInputStream(source)) { copy(input, output, MAX_SOURCE_BYTES); }
            output.writeBytes("\r\n--" + boundary + "--\r\n");
        }
        int status = connection.getResponseCode();
        if (status < 200 || status >= 300) {
            drain(connection.getErrorStream(), 1024 * 1024);
            boolean pressure = status == 429 || status == 500 || status == 502 || status == 503 || status == 504;
            throw new ProviderException("http-" + status, status, pressure);
        }
        byte[] response = readLimited(connection.getInputStream(), 4 * 1024 * 1024);
        JSONObject payload = new JSONObject(new String(response, StandardCharsets.UTF_8));
        JSONArray data = payload.optJSONArray("data");
        if (data == null || data.length() != 1) throw new SafeException("invalid-output-count");
        String encoded = data.getJSONObject(0).optString("b64_json", "");
        if (encoded.isEmpty()) throw new SafeException("invalid-output-shape");
        return Base64.decode(encoded, Base64.DEFAULT);
    }

    private static void field(DataOutputStream output, String boundary, String name, String value) throws IOException {
        output.writeBytes("--" + boundary + "\r\n");
        output.writeBytes("Content-Disposition: form-data; name=\"" + name + "\"\r\n\r\n");
        output.write(value.getBytes(StandardCharsets.UTF_8));
        output.writeBytes("\r\n");
    }

    private void emit(JSObject event) {
        notifyListeners("batchEvent", event, true);
    }

    private static String required(String value, String label) throws SafeException {
        if (value == null || value.isBlank()) throw new SafeException("missing-" + label);
        return value;
    }

    private static String validateOpaque(String value) throws SafeException {
        value = required(value, "id");
        if (!value.matches("[A-Za-z0-9][A-Za-z0-9_-]{7,127}")) throw new SafeException("invalid-id");
        return value;
    }

    private static String validateTypedOpaque(String value, String prefix) throws SafeException {
        value = validateOpaque(value);
        if (!value.startsWith(prefix + "_")) throw new SafeException("invalid-" + prefix + "-id");
        return value;
    }

    private void cleanupPrivateFiles() {
        deleteUnreferencedFiles(new File(privateRoot, "sources"), journal.sourceFileNames());
        deleteUnreferencedFiles(new File(privateRoot, "outputs"), journal.outputFileNames());
        Set<String> batchIds = journal.batchIds();
        File[] jobs = new File(privateRoot, "jobs").listFiles();
        if (jobs != null) for (File job : jobs) if (!batchIds.contains(job.getName())) deleteTree(job);
    }

    private static void deleteUnreferencedFiles(File directory, Set<String> allowed) {
        File[] files = directory.listFiles();
        if (files != null) for (File file : files) if (!allowed.contains(file.getName())) deleteTree(file);
    }

    private static String opaque(String prefix) {
        return prefix + "_" + UUID.randomUUID().toString().replace("-", "");
    }

    private static String sha256(byte[] bytes) throws Exception {
        byte[] digest = MessageDigest.getInstance("SHA-256").digest(bytes);
        StringBuilder value = new StringBuilder();
        for (byte item : digest) value.append(String.format(Locale.ROOT, "%02x", item));
        return value.toString();
    }

    private static void validateContext(Object value, int depth) throws SafeException {
        if (depth > 6) throw new SafeException("invalid-context");
        if (value == null || value == JSONObject.NULL || value instanceof String || value instanceof Number || value instanceof Boolean) return;
        if (value instanceof JSONArray) {
            JSONArray array = (JSONArray) value;
            if (array.length() > 100) throw new SafeException("invalid-context");
            for (int index = 0; index < array.length(); index++) {
                try { validateContext(array.get(index), depth + 1); }
                catch (JSONException error) { throw new SafeException("invalid-context"); }
            }
            return;
        }
        if (value instanceof JSONObject) {
            JSONObject object = (JSONObject) value;
            if (object.length() > 64) throw new SafeException("invalid-context");
            java.util.Iterator<String> keys = object.keys();
            while (keys.hasNext()) {
                String key = keys.next();
                if (key.matches("(?i)(api[-_]?key|authorization|token|cookie|headers?|url|baseurl|path|command|authfile)")) throw new SafeException("invalid-context");
                try { validateContext(object.get(key), depth + 1); }
                catch (JSONException error) { throw new SafeException("invalid-context"); }
            }
            return;
        }
        throw new SafeException("invalid-context");
    }

    private static boolean imageMatches(byte[] bytes, String mime) {
        String detected = detectMime(bytes);
        return detected != null && (detected.equals(mime) || (detected.equals("image/jpeg") && mime.equals("image/jpg")));
    }

    private static String detectMime(byte[] bytes) {
        if (bytes.length >= 3 && (bytes[0] & 255) == 255 && (bytes[1] & 255) == 216 && (bytes[2] & 255) == 255) return "image/jpeg";
        if (bytes.length >= 8 && bytes[0] == (byte) 137 && bytes[1] == 80 && bytes[2] == 78 && bytes[3] == 71) return "image/png";
        if (bytes.length >= 12 && new String(bytes, 0, 4, StandardCharsets.US_ASCII).equals("RIFF") && new String(bytes, 8, 4, StandardCharsets.US_ASCII).equals("WEBP")) return "image/webp";
        return null;
    }

    private static void writePrivate(File file, byte[] bytes) throws IOException {
        File parent = file.getParentFile();
        if (parent != null && !parent.exists() && !parent.mkdirs()) throw new IOException("mkdir");
        try (FileOutputStream output = new FileOutputStream(file)) { output.write(bytes); }
    }

    private static byte[] readLimited(File file, int maximum) throws IOException { try (FileInputStream input = new FileInputStream(file)) { return readLimited(input, maximum); } }
    private static byte[] readLimited(InputStream input, int maximum) throws IOException {
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        copy(input, output, maximum);
        return output.toByteArray();
    }
    private static void copy(InputStream input, java.io.OutputStream output, int maximum) throws IOException {
        byte[] buffer = new byte[8192];
        int total = 0;
        int count;
        while ((count = input.read(buffer)) != -1) {
            total += count;
            if (total > maximum) throw new IOException("payload-too-large");
            output.write(buffer, 0, count);
        }
    }
    private static void drain(InputStream input, int maximum) { if (input == null) return; try { readLimited(input, maximum); } catch (Exception ignored) {} finally { try { input.close(); } catch (Exception ignored) {} } }
    private static boolean validDimensions(byte[] bytes) { BitmapFactory.Options options = new BitmapFactory.Options(); options.inJustDecodeBounds = true; BitmapFactory.decodeByteArray(bytes, 0, bytes.length, options); return options.outWidth >= 64 && options.outHeight >= 64 && options.outWidth <= 4096 && options.outHeight <= 4096; }
    private static void deleteChildren(File file) { if (file == null || !file.exists()) return; File[] children = file.listFiles(); if (children != null) for (File child : children) { if (child.isDirectory()) deleteChildren(child); child.delete(); } }
    private static void deleteTree(File file) { if (file == null) return; if (file.isDirectory()) deleteChildren(file); file.delete(); }

    private static final class Vault {
        private static final String ALIAS = "hairloom.image.api.key";
        private static final String PREFS = "hairloom-secure-provider";
        private static final String VALUE = "encrypted-key";
        private final Context context;
        Vault(Context context) { this.context = context; }
        boolean hasSecret() { try { return read() != null; } catch (Exception error) { return false; } }
        void write(String secret) throws Exception {
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, key());
            byte[] encrypted = cipher.doFinal(secret.getBytes(StandardCharsets.UTF_8));
            byte[] value = new byte[cipher.getIV().length + encrypted.length];
            System.arraycopy(cipher.getIV(), 0, value, 0, cipher.getIV().length);
            System.arraycopy(encrypted, 0, value, cipher.getIV().length, encrypted.length);
            context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(VALUE, Base64.encodeToString(value, Base64.NO_WRAP)).apply();
        }
        String read() throws Exception {
            String encoded = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(VALUE, null);
            if (encoded == null) return null;
            byte[] value = Base64.decode(encoded, Base64.DEFAULT);
            if (value.length < 13) throw new Exception("vault");
            byte[] iv = new byte[12];
            byte[] encrypted = new byte[value.length - 12];
            System.arraycopy(value, 0, iv, 0, 12);
            System.arraycopy(value, 12, encrypted, 0, encrypted.length);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, key(), new GCMParameterSpec(128, iv));
            return new String(cipher.doFinal(encrypted), StandardCharsets.UTF_8);
        }
        void clear() { context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().remove(VALUE).apply(); }
        private SecretKey key() throws Exception {
            KeyStore store = KeyStore.getInstance("AndroidKeyStore");
            store.load(null);
            if (store.containsAlias(ALIAS)) return ((KeyStore.SecretKeyEntry) store.getEntry(ALIAS, null)).getSecretKey();
            KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
            generator.init(new KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT).setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build());
            return generator.generateKey();
        }
    }

    private static final class SlotInput {
        final int slotIndex; final String designId; final int generation; final String sourceId; final String sourceHash; final String sourceViewKey; final boolean mirrored; final String prompt;
        SlotInput(int slotIndex, String designId, int generation, String sourceId, String sourceHash, String sourceViewKey, boolean mirrored, String prompt) { this.slotIndex = slotIndex; this.designId = designId; this.generation = generation; this.sourceId = sourceId; this.sourceHash = sourceHash; this.sourceViewKey = sourceViewKey; this.mirrored = mirrored; this.prompt = prompt; }
        static SlotInput parse(JSONObject raw) throws Exception {
            int slotIndex = raw.getInt("slotIndex");
            int generation = raw.getInt("generation");
            String designId = raw.getString("designId");
            String sourceId = validateTypedOpaque(raw.getString("sourceId"), "source");
            String sourceHash = raw.getString("sourceHash").toLowerCase(Locale.ROOT);
            String sourceViewKey = raw.getString("sourceViewKey");
            String prompt = raw.getString("prompt");
            if (slotIndex < 0 || slotIndex >= SLOT_COUNT || generation < 1 || !designId.matches("HLM-[A-Z0-9-]+") || !sourceHash.matches("[a-f0-9]{64}") || !Set.of("front", "side", "back", "crown", "nape", "detail").contains(sourceViewKey) || prompt.isBlank() || prompt.length() > 24000) throw new SafeException("invalid-slot");
            return new SlotInput(slotIndex, designId, generation, sourceId, sourceHash, sourceViewKey, raw.optBoolean("mirrored", false), prompt);
        }
        JSONObject toJob() throws JSONException { return new JSONObject().put("sourceId", sourceId).put("sourceHash", sourceHash).put("prompt", prompt); }
    }

    private static final class SourceRecord { final String id, hash, view, mimeType, fileName; SourceRecord(String id, String hash, String view, String mimeType, String fileName) { this.id = id; this.hash = hash; this.view = view; this.mimeType = mimeType; this.fileName = fileName; } }
    private static final class OutputRecord { final String id, mimeType, fileName; OutputRecord(String id, String mimeType, String fileName) { this.id = id; this.mimeType = mimeType; this.fileName = fileName; } }
    private static final class SlotRecord { final String batchId; final int slotIndex; final SlotInput input; SlotRecord(String batchId, int slotIndex, SlotInput input) { this.batchId = batchId; this.slotIndex = slotIndex; this.input = input; } }

    private static final class Journal extends SQLiteOpenHelper {
        Journal(Context context) { super(context, "hairloom-private.sqlite", null, 1); }
        @Override public void onCreate(SQLiteDatabase db) {
            db.execSQL("CREATE TABLE sources(id TEXT PRIMARY KEY, hash TEXT NOT NULL, view_key TEXT NOT NULL, mime TEXT NOT NULL, file_name TEXT NOT NULL, created INTEGER NOT NULL)");
            db.execSQL("CREATE TABLE outputs(id TEXT PRIMARY KEY, mime TEXT NOT NULL, file_name TEXT NOT NULL, bytes INTEGER NOT NULL, created INTEGER NOT NULL)");
            db.execSQL("CREATE TABLE batches(id TEXT PRIMARY KEY, source_key TEXT NOT NULL, status TEXT NOT NULL, cancelled INTEGER NOT NULL DEFAULT 0, created INTEGER NOT NULL)");
            db.execSQL("CREATE TABLE slots(batch_id TEXT NOT NULL, slot_index INTEGER NOT NULL, design_id TEXT NOT NULL, generation INTEGER NOT NULL, source_id TEXT NOT NULL, source_hash TEXT NOT NULL, source_view TEXT NOT NULL, mirrored INTEGER NOT NULL, status TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, output_id TEXT, error TEXT, PRIMARY KEY(batch_id, slot_index))");
            db.execSQL("CREATE TABLE events(id INTEGER PRIMARY KEY AUTOINCREMENT, batch_id TEXT NOT NULL, slot_index INTEGER NOT NULL, status TEXT NOT NULL, output_id TEXT, error TEXT, status_code INTEGER NOT NULL, attempts INTEGER NOT NULL, created INTEGER NOT NULL)");
        }
        @Override public void onUpgrade(SQLiteDatabase db, int oldVersion, int newVersion) { throw new IllegalStateException("Unsupported journal migration"); }
        synchronized void recoverInterrupted() { getWritableDatabase().execSQL("UPDATE slots SET status='retryable',error='restart-retryable' WHERE status='running'"); }
        synchronized void insertSource(String id, String hash, String view, String mime, String fileName) { ContentValues v = new ContentValues(); v.put("id", id); v.put("hash", hash); v.put("view_key", view); v.put("mime", mime); v.put("file_name", fileName); v.put("created", System.currentTimeMillis()); getWritableDatabase().insertOrThrow("sources", null, v); }
        synchronized SourceRecord source(String id) { try (Cursor c = getReadableDatabase().query("sources", new String[]{"id","hash","view_key","mime","file_name"}, "id=?", new String[]{id}, null, null, null)) { return c.moveToFirst() ? new SourceRecord(c.getString(0), c.getString(1), c.getString(2), c.getString(3), c.getString(4)) : null; } }
        synchronized void deleteSource(String id) { getWritableDatabase().delete("sources", "id=?", new String[]{id}); }
        synchronized boolean sourceInUse(String id) { try (Cursor c = getReadableDatabase().rawQuery("SELECT 1 FROM slots s JOIN batches b ON b.id=s.batch_id WHERE s.source_id=? AND b.status='active' LIMIT 1", new String[]{id})) { return c.moveToFirst(); } }
        synchronized void createBatch(String id, String sourceKey, List<SlotInput> inputs) { SQLiteDatabase db = getWritableDatabase(); db.beginTransaction(); try { ContentValues b = new ContentValues(); b.put("id", id); b.put("source_key", sourceKey); b.put("status", "active"); b.put("cancelled", 0); b.put("created", System.currentTimeMillis()); db.insertOrThrow("batches", null, b); for (SlotInput input : inputs) { ContentValues v = new ContentValues(); v.put("batch_id", id); v.put("slot_index", input.slotIndex); v.put("design_id", input.designId); v.put("generation", input.generation); v.put("source_id", input.sourceId); v.put("source_hash", input.sourceHash); v.put("source_view", input.sourceViewKey); v.put("mirrored", input.mirrored ? 1 : 0); v.put("status", "queued"); db.insertOrThrow("slots", null, v); } db.setTransactionSuccessful(); } finally { db.endTransaction(); } }
        synchronized List<String> resumableBatches() { List<String> ids = new ArrayList<>(); try (Cursor c = getReadableDatabase().rawQuery("SELECT id FROM batches WHERE status='active' AND cancelled=0 ORDER BY created", null)) { while (c.moveToNext()) ids.add(c.getString(0)); } return ids; }
        synchronized boolean batchCancelled(String id) { try (Cursor c = getReadableDatabase().rawQuery("SELECT cancelled FROM batches WHERE id=?", new String[]{id})) { return !c.moveToFirst() || c.getInt(0) != 0; } }
        synchronized void cleanupExpired(long cutoff) { SQLiteDatabase db = getWritableDatabase(); db.beginTransaction(); try { db.execSQL("DELETE FROM events WHERE batch_id IN (SELECT id FROM batches WHERE status!='active' AND created<?)", new Object[]{cutoff}); db.execSQL("DELETE FROM slots WHERE batch_id IN (SELECT id FROM batches WHERE status!='active' AND created<?)", new Object[]{cutoff}); db.execSQL("DELETE FROM batches WHERE status!='active' AND created<?", new Object[]{cutoff}); db.execSQL("DELETE FROM outputs WHERE created<? AND id NOT IN (SELECT output_id FROM slots WHERE output_id IS NOT NULL)", new Object[]{cutoff}); db.execSQL("DELETE FROM sources WHERE created<? AND id NOT IN (SELECT source_id FROM slots)", new Object[]{cutoff}); db.setTransactionSuccessful(); } finally { db.endTransaction(); } }
        synchronized Set<String> sourceFileNames() { return fileNames("sources", "file_name"); }
        synchronized Set<String> outputFileNames() { return fileNames("outputs", "file_name"); }
        synchronized Set<String> batchIds() { Set<String> values = new HashSet<>(); try (Cursor c = getReadableDatabase().rawQuery("SELECT id FROM batches", null)) { while (c.moveToNext()) values.add(c.getString(0)); } return values; }
        private Set<String> fileNames(String table, String column) { Set<String> values = new HashSet<>(); try (Cursor c = getReadableDatabase().rawQuery("SELECT " + column + " FROM " + table, null)) { while (c.moveToNext()) values.add(c.getString(0)); } return values; }
        synchronized List<SlotRecord> queuedSlots(String batchId, int limit) { List<SlotRecord> result = new ArrayList<>(); if (limit <= 0) return result; try (Cursor c = getReadableDatabase().rawQuery("SELECT slot_index,design_id,generation,source_id,source_hash,source_view,mirrored FROM slots WHERE batch_id=? AND status IN ('queued','retryable') ORDER BY attempts DESC,slot_index LIMIT ?", new String[]{batchId, String.valueOf(limit)})) { while (c.moveToNext()) { SlotInput input = new SlotInput(c.getInt(0), c.getString(1), c.getInt(2), c.getString(3), c.getString(4), c.getString(5), c.getInt(6) != 0, ""); result.add(new SlotRecord(batchId, c.getInt(0), input)); } } return result; }
        synchronized int markRunning(String batchId, int index) { getWritableDatabase().execSQL("UPDATE slots SET status='running',attempts=attempts+1 WHERE batch_id=? AND slot_index=? AND status IN ('queued','retryable')", new Object[]{batchId, index}); return attempts(batchId, index); }
        synchronized int attempts(String batchId, int index) { try (Cursor c = getReadableDatabase().rawQuery("SELECT attempts FROM slots WHERE batch_id=? AND slot_index=?", new String[]{batchId, String.valueOf(index)})) { return c.moveToFirst() ? c.getInt(0) : 0; } }
        synchronized boolean slotRunning(String batchId, int index) { try (Cursor c = getReadableDatabase().rawQuery("SELECT status FROM slots WHERE batch_id=? AND slot_index=?", new String[]{batchId, String.valueOf(index)})) { return c.moveToFirst() && "running".equals(c.getString(0)); } }
        synchronized void releaseForCredentialClear() { SQLiteDatabase db = getWritableDatabase(); db.beginTransaction(); try { db.execSQL("UPDATE slots SET status='retryable',error='credential-cleared',attempts=CASE WHEN attempts>0 THEN attempts-1 ELSE 0 END WHERE status='running'"); db.execSQL("UPDATE slots SET status='retryable',error='credential-cleared' WHERE status='queued'"); db.setTransactionSuccessful(); } finally { db.endTransaction(); } }
        synchronized void retry(String batchId, int index) { getWritableDatabase().execSQL("UPDATE slots SET status='retryable',error='retryable' WHERE batch_id=? AND slot_index=? AND status='running'", new Object[]{batchId, index}); }
        synchronized void fail(String batchId, int index, String error) { getWritableDatabase().execSQL("UPDATE slots SET status='failed',error=? WHERE batch_id=? AND slot_index=?", new Object[]{error, batchId, index}); finishBatchIfTerminal(batchId); }
        synchronized void complete(String batchId, int index, String outputId, String mime, String fileName, int bytes) { SQLiteDatabase db = getWritableDatabase(); db.beginTransaction(); try { ContentValues output = new ContentValues(); output.put("id", outputId); output.put("mime", mime); output.put("file_name", fileName); output.put("bytes", bytes); output.put("created", System.currentTimeMillis()); db.insertOrThrow("outputs", null, output); db.execSQL("UPDATE slots SET status='done',output_id=?,error=NULL WHERE batch_id=? AND slot_index=?", new Object[]{outputId, batchId, index}); db.setTransactionSuccessful(); } finally { db.endTransaction(); } finishBatchIfTerminal(batchId); }
        synchronized OutputRecord output(String id) { try (Cursor c = getReadableDatabase().rawQuery("SELECT id,mime,file_name FROM outputs WHERE id=?", new String[]{id})) { return c.moveToFirst() ? new OutputRecord(c.getString(0), c.getString(1), c.getString(2)) : null; } }
        synchronized JSObject event(String batchId, SlotInput slot, String status, String outputId, String error, int statusCode, int attempts) { ContentValues v = new ContentValues(); v.put("batch_id", batchId); v.put("slot_index", slot.slotIndex); v.put("status", status); v.put("output_id", outputId); v.put("error", error); v.put("status_code", statusCode); v.put("attempts", attempts); v.put("created", System.currentTimeMillis()); long id = getWritableDatabase().insertOrThrow("events", null, v); JSObject result = new JSObject(); result.put("eventId", id); result.put("batchId", batchId); result.put("slotIndex", slot.slotIndex); result.put("designId", slot.designId); result.put("generation", slot.generation); result.put("sourceHash", slot.sourceHash); result.put("status", status); result.put("attempts", attempts); if (outputId != null) result.put("outputId", outputId); if (error != null) result.put("errorType", error); if (statusCode != 0) result.put("statusCode", statusCode); return result; }
        synchronized void cancelBatch(String id) { getWritableDatabase().execSQL("UPDATE batches SET cancelled=1,status='cancelled',created=? WHERE id=?", new Object[]{System.currentTimeMillis(), id}); getWritableDatabase().execSQL("UPDATE slots SET status='cancelled' WHERE batch_id=? AND status IN ('queued','running','retryable')", new Object[]{id}); }
        synchronized JSObject snapshot(String id) {
            try (Cursor batch = getReadableDatabase().rawQuery("SELECT source_key,status,cancelled FROM batches WHERE id=?", new String[]{id})) {
                if (!batch.moveToFirst()) return null;
                JSObject result = new JSObject();
                result.put("batchId", id);
                result.put("sourcePhotoKey", batch.getString(0));
                result.put("status", batch.getString(1));
                result.put("cancelled", batch.getInt(2) != 0);
                JSArray slots = new JSArray();
                try (Cursor cursor = getReadableDatabase().rawQuery("SELECT s.slot_index,s.design_id,s.generation,s.source_id,s.source_hash,s.source_view,s.mirrored,s.status,s.attempts,s.output_id,s.error,COALESCE((SELECT MAX(e.id) FROM events e WHERE e.batch_id=s.batch_id AND e.slot_index=s.slot_index),0) FROM slots s WHERE s.batch_id=? ORDER BY s.slot_index", new String[]{id})) {
                    while (cursor.moveToNext()) {
                        JSObject slot = new JSObject();
                        slot.put("slotIndex", cursor.getInt(0));
                        slot.put("designId", cursor.getString(1));
                        slot.put("generation", cursor.getInt(2));
                        slot.put("sourceId", cursor.getString(3));
                        slot.put("sourceHash", cursor.getString(4));
                        slot.put("sourceViewKey", cursor.getString(5));
                        slot.put("mirrored", cursor.getInt(6) != 0);
                        slot.put("status", cursor.getString(7));
                        slot.put("attempts", cursor.getInt(8));
                        if (!cursor.isNull(9)) slot.put("outputId", cursor.getString(9));
                        if (!cursor.isNull(10)) slot.put("errorType", cursor.getString(10));
                        slot.put("lastEventId", cursor.getLong(11));
                        slots.put(slot);
                    }
                }
                result.put("slots", slots);
                return result;
            }
        }
        synchronized void clearCustomerData() { SQLiteDatabase db = getWritableDatabase(); db.beginTransaction(); try { db.delete("events", null, null); db.delete("slots", null, null); db.delete("batches", null, null); db.delete("outputs", null, null); db.delete("sources", null, null); db.setTransactionSuccessful(); } finally { db.endTransaction(); } }
        private void finishBatchIfTerminal(String batchId) { try (Cursor c = getReadableDatabase().rawQuery("SELECT COUNT(*) FROM slots WHERE batch_id=? AND status IN ('queued','running','retryable')", new String[]{batchId})) { if (c.moveToFirst() && c.getInt(0) == 0) getWritableDatabase().execSQL("UPDATE batches SET status='complete',created=? WHERE id=? AND cancelled=0", new Object[]{System.currentTimeMillis(), batchId}); } }
    }

    private static final class SafeException extends Exception { SafeException(String code) { super(code); } }
    private static final class ProviderException extends Exception { final String code; final int statusCode; final boolean pressure; ProviderException(String code, int statusCode, boolean pressure) { super(code); this.code = code; this.statusCode = statusCode; this.pressure = pressure; } }
}
