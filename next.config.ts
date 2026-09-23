import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 서버 스택을 굳이 알려줄 이유가 없다.
  poweredByHeader: false,

  headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // Apache가 이미 HTTP→HTTPS 301을 걸지만, 그건 첫 요청이 평문으로
          // 한 번 나간 뒤다. HSTS는 브라우저가 처음부터 HTTPS로만 가게 한다.
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains",
          },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // 지도·위치 기능이 쓰는 geolocation만 자기 출처에 열어두고 나머지는 차단.
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(self)",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
