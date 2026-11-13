package com.aureliorm.meucontrole;

import android.app.Activity;
import android.graphics.Color;
import android.content.Intent;
import android.content.ActivityNotFoundException;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.WebChromeClient;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import java.io.IOException;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.net.URL;
import javax.net.ssl.HttpsURLConnection;
import java.util.Collections;
import java.util.Locale;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;

public final class MainActivity extends Activity {
    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        int background = Color.rgb(11, 17, 24);
        getWindow().setStatusBarColor(background);
        getWindow().setNavigationBarColor(background);

        WebView view = new WebView(this);
        view.setBackgroundColor(background);
        view.getSettings().setJavaScriptEnabled(true);
        view.getSettings().setDomStorageEnabled(true);
        view.getSettings().setAllowFileAccess(false);
        view.getSettings().setAllowContentAccess(false);
        view.getSettings().setBlockNetworkLoads(false);
        view.setWebChromeClient(new WebChromeClient());
        view.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView webView, WebResourceRequest request) {
                Uri url = request.getUrl();
                if (request.hasGesture() && "https".equals(url.getScheme()) && "api.bcb.gov.br".equals(url.getHost())) {
                    try {
                        startActivity(new Intent(Intent.ACTION_VIEW, url));
                    } catch (ActivityNotFoundException ignored) {}
                }
                return true;
            }

            @Override
            public WebResourceResponse shouldInterceptRequest(WebView webView, WebResourceRequest request) {
                Uri url = request.getUrl();
                if ("data".equals(url.getScheme())) return null;
                if (!"https".equals(url.getScheme()) || !"meucontrole.local".equals(url.getHost()) || !"GET".equals(request.getMethod())) {
                    return response(403, "Blocked", new byte[0]);
                }
                String path = url.getPath();
                if (path != null && path.matches("/indicador/(1|432|433)")) {
                    int series = Integer.parseInt(path.substring("/indicador/".length()));
                    return fetchIndicator(series);
                }
                return readWebAsset(path);
            }
        });
        setContentView(view);
        try (InputStream source = getAssets().open("index.html")) {
            ByteArrayOutputStream contents = new ByteArrayOutputStream();
            byte[] buffer = new byte[8192];
            int read;
            while ((read = source.read(buffer)) != -1) contents.write(buffer, 0, read);
            String html = new String(contents.toByteArray(), StandardCharsets.UTF_8);
            view.loadDataWithBaseURL("https://meucontrole.local/", html, "text/html", "UTF-8", null);
        } catch (IOException error) {
            view.loadData("<p>Não foi possível abrir o KYVON.</p>", "text/html", "UTF-8");
        }
    }
    private WebResourceResponse readWebAsset(String path) {
        if (path == null || !path.startsWith("/") || path.contains("..") || path.contains("\\\\") || path.contains("\\0")) {
            return response(403, "Forbidden", new byte[0]);
        }
        String filename = path.substring(1);
        if (filename.isEmpty()) filename = "index.html";
        String mime;
        if (filename.endsWith(".js") || filename.endsWith(".mjs")) mime = "text/javascript";
        else if (filename.endsWith(".css")) mime = "text/css";
        else if (filename.endsWith(".html")) mime = "text/html";
        else if (filename.endsWith(".json")) mime = "application/json";
        else if (filename.endsWith(".png")) mime = "image/png";
        else if (filename.endsWith(".jpg") || filename.endsWith(".jpeg")) mime = "image/jpeg";
        else if (filename.endsWith(".svg")) mime = "image/svg+xml";
        else if (filename.endsWith(".woff2")) mime = "font/woff2";
        else if (filename.endsWith(".woff")) mime = "font/woff";
        else if (filename.endsWith(".ttf")) mime = "font/ttf";
        else mime = "application/octet-stream";
        try {
            return new WebResourceResponse(mime, (mime.startsWith("text/") || mime.equals("application/json")) ? "UTF-8" : null,
                    getAssets().open(filename));
        } catch (IOException ignored) {
            return response(404, "Not Found", new byte[0]);
        }
    }

    private static WebResourceResponse fetchIndicator(int series) {
        HttpsURLConnection connection = null;
        try {
            LocalDate today = LocalDate.now(ZoneId.of("America/Sao_Paulo"));
            DateTimeFormatter date = DateTimeFormatter.ofPattern("dd/MM/uuuu", Locale.ROOT);
            URL endpoint = new URL("https://api.bcb.gov.br/dados/serie/bcdata.sgs."
                    + series + "/dados?formato=json&dataInicial=" + date.format(today.minusDays(90))
                    + "&dataFinal=" + date.format(today));
            connection = (HttpsURLConnection) endpoint.openConnection();
            connection.setConnectTimeout(4500);
            connection.setReadTimeout(4500);
            connection.setInstanceFollowRedirects(false);
            if (connection.getResponseCode() == 200) {
                try (InputStream stream = connection.getInputStream()) {
                    ByteArrayOutputStream output = new ByteArrayOutputStream();
                    byte[] buffer = new byte[1024];
                    int count;
                    while ((count = stream.read(buffer)) != -1) {
                        if (output.size() + count > 8192) throw new IOException("Indicator response too large");
                        output.write(buffer, 0, count);
                    }
                    return response(200, "OK", output.toByteArray());
                }
            }
        } catch (IOException ignored) {
            // The assistant displays the network error without affecting local records.
        } finally {
            if (connection != null) connection.disconnect();
        }
        return response(502, "Indicator unavailable", new byte[0]);
    }

    private static WebResourceResponse response(int status, String reason, byte[] content) {
        return new WebResourceResponse("application/json", "UTF-8", status, reason,
                Collections.singletonMap("Cache-Control", "no-store"), new ByteArrayInputStream(content));
    }
}
