package com.aureliorm.meucontrole;

import android.app.Activity;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
import android.view.View;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;
import androidx.webkit.WebViewAssetLoader;
import android.graphics.Color;
import android.content.Intent;
import android.content.ActivityNotFoundException;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.WebChromeClient;
import android.webkit.ConsoleMessage;
import android.webkit.WebResourceError;
import android.widget.Toast;
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

        final WebViewAssetLoader assetLoader = new WebViewAssetLoader.Builder()
                .addPathHandler("/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();
        WebView view = new WebView(this);
        final Handler handler = new Handler(Looper.getMainLooper());
        final FrameLayout container = new FrameLayout(this);
        final LinearLayout cover = new LinearLayout(this);
        cover.setOrientation(LinearLayout.VERTICAL);
        cover.setGravity(Gravity.CENTER);
        cover.setPadding(32, 32, 32, 32);
        cover.setBackgroundColor(background);
        final TextView title = new TextView(this);
        title.setText("K");
        title.setTextColor(Color.rgb(217, 182, 112));
        title.setTextSize(68);
        title.setGravity(Gravity.CENTER);
        cover.addView(title, new LinearLayout.LayoutParams(-1, -2));
        final TextView message = new TextView(this);
        message.setText("KYVON\\nCarregando seu controle financeiro...");
        message.setTextColor(Color.WHITE);
        message.setTextSize(16);
        message.setGravity(Gravity.CENTER);
        cover.addView(message, new LinearLayout.LayoutParams(-1, -2));
        view.setBackgroundColor(background);
        view.getSettings().setJavaScriptEnabled(true);
        view.getSettings().setDomStorageEnabled(true);
        view.getSettings().setAllowFileAccess(false);
        view.getSettings().setAllowContentAccess(false);
        view.getSettings().setBlockNetworkLoads(false);
        view.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onConsoleMessage(ConsoleMessage message) {
                android.util.Log.e("KYVON-Web", message.message() + " (" + message.sourceId() + ":" + message.lineNumber() + ")");
                return true;
            }
        });
        view.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView webView, WebResourceRequest request) {
                Uri url = request.getUrl();
                if ("https".equals(url.getScheme()) && "appassets.androidplatform.net".equals(url.getHost())) {
                    return false;
                }
                if (request.hasGesture() && "https".equals(url.getScheme())) {
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
                if (!"https".equals(url.getScheme()) || !"appassets.androidplatform.net".equals(url.getHost()) || !"GET".equals(request.getMethod())) {
                    return response(403, "Blocked", new byte[0]);
                }
                String path = url.getPath();
                if (path != null && path.matches("/indicador/(1|432|433)")) {
                    int series = Integer.parseInt(path.substring("/indicador/".length()));
                    return fetchIndicator(series);
                }
                WebResourceResponse asset = assetLoader.shouldInterceptRequest(url);
                return asset != null ? asset : response(404, "Missing asset", new byte[0]);
            }

            @Override
            public void onReceivedError(WebView webView, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) {
                    message.setText("KYVON\\nFalha ao carregar a tela (" + error.getErrorCode() + ").\\nConfira o Android System WebView e tente novamente.");
                    cover.setVisibility(View.VISIBLE);
                }
            }

            @Override
            public void onPageFinished(WebView webView, String url) {
                handler.postDelayed(new Runnable() {
                    private int attempts = 0;
                    @Override
                    public void run() {
                        if (attempts++ >= 24) {
                            message.setText("KYVON\\nA interface ainda não foi exibida.\\nAtualize o Android System WebView e o Google Chrome.\\nSe continuar, envie uma captura desta tela.");
                            return;
                        }
                        webView.evaluateJavascript(
                            "(function(){var r=document.getElementById('root');return !!(r && r.textContent && r.textContent.indexOf('KYVON')!==-1 && r.textContent.indexOf('Gastos')!==-1);})()",
                            value -> {
                                if ("true".equals(value)) {
                                    cover.setVisibility(View.GONE);
                                } else {
                                    handler.postDelayed(this, 500);
                                }
                            });
                    }
                }, 700);
            }
        });
        container.addView(view, new FrameLayout.LayoutParams(-1, -1));
        container.addView(cover, new FrameLayout.LayoutParams(-1, -1));
        setContentView(container);
        view.loadUrl("https://appassets.androidplatform.net/index.html");
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
