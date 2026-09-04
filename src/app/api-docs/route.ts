const html = `<!doctype html>
<html lang="ko">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>AI Outing Agent API</title>
    <link rel="stylesheet" href="/api/swagger-assets/swagger-ui.css" />
  </head>
  <body>
    <div id="swagger-ui">API 문서를 불러오는 중입니다…</div>
    <script src="/api/swagger-assets/swagger-ui-bundle.js"></script>
    <script>
      window.addEventListener("load", function () {
        SwaggerUIBundle({
          dom_id: "#swagger-ui",
          url: "/api/openapi",
          deepLinking: true,
          displayRequestDuration: true
        });
      });
    </script>
  </body>
</html>`;

export function GET() {
  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
