import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import Kakao from "next-auth/providers/kakao";
import Naver from "next-auth/providers/naver";
import bcrypt from "bcryptjs";
import { prisma } from "./prisma";

// 이메일+비밀번호(Credentials) 위에 구글/카카오/네이버(OAuth)를 얹었다. OAuth는 next-auth
// Adapter 없이 쓰므로(Adapter는 Credentials와 못 섞임) Account/Session 테이블 대신, jwt
// 콜백에서 이메일로 우리 users 테이블에 직접 upsert한다 — 이미 이메일로 가입한 사용자가
// 소셜 로그인으로도 들어오면 같은 계정으로 합쳐진다.
//
// 키가 없는 provider는 아예 등록하지 않는다 — 그래야 client_id: undefined로 provider가
// 반쯤 켜진 채 에러를 내는 대신, 클라이언트의 getProviders()에도 안 잡혀서 로그인
// 화면에 버튼 자체가 안 뜬다(키 발급 전까지는 아무 영향 없음).
const oauthProviders = [
  process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
    ? Google({ clientId: process.env.GOOGLE_CLIENT_ID, clientSecret: process.env.GOOGLE_CLIENT_SECRET })
    : null,
  process.env.KAKAO_CLIENT_ID && process.env.KAKAO_CLIENT_SECRET
    ? Kakao({ clientId: process.env.KAKAO_CLIENT_ID, clientSecret: process.env.KAKAO_CLIENT_SECRET })
    : null,
  process.env.NAVER_CLIENT_ID && process.env.NAVER_CLIENT_SECRET
    ? Naver({ clientId: process.env.NAVER_CLIENT_ID, clientSecret: process.env.NAVER_CLIENT_SECRET })
    : null,
].filter((p) => p !== null);

// proxy.ts(라우트 가드)도 이 auth를 그대로 쓴다 — Next.js 16부터 Proxy가 기본 Node.js
// 런타임이라(엣지 아님) Credentials provider(bcrypt/Prisma)를 그대로 써도 된다.
export const { handlers, auth, signIn, signOut } = NextAuth({
  // Vercel 같은 자동 신뢰 플랫폼이 아니라 pm2+리버스 프록시로 직접 호스팅하는 서버라,
  // 이게 없으면 모든 요청이 "UntrustedHost" 에러로 막힌다(2026-09-08 배포 후 실측 확인).
  trustHost: true,
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      credentials: {
        email: {},
        password: {},
      },
      async authorize(credentials) {
        const email = credentials?.email;
        const password = credentials?.password;
        if (typeof email !== "string" || typeof password !== "string") return null;

        const user = await prisma.user.findUnique({ where: { email } });
        // passwordHash가 없으면 소셜 로그인으로만 가입한 계정 — 이메일+비밀번호로는
        // 로그인할 수 없다(비교할 해시 자체가 없어서 bcrypt.compare에 넘기면 예외가 난다).
        if (!user || !user.passwordHash) return null;

        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) return null;

        return { id: user.id.toString(), email: user.email, name: user.name };
      },
    }),
    ...oauthProviders,
  ],
  callbacks: {
    // trigger === "update"는 클라이언트에서 useSession().update({ name })을 부를 때
    // (앱 설정에서 이름 변경 저장 후) — 재로그인 없이 세션의 이름을 바로 갱신하기 위함.
    async jwt({ token, user, account, trigger, session }) {
      if (user && account && account.provider !== "credentials") {
        // OAuth 로그인 — 이메일로 기존 계정을 찾거나 새로 만든다(비밀번호 없는 계정).
        // 카카오는 이메일 동의를 안 받으면 email이 없을 수 있어서, 그 경우는 로그인을
        // 막는다(우리 스키마가 email을 유니크 식별 키로 쓰고 있어서 대안이 없다).
        if (!user.email) return token;
        const dbUser = await prisma.user.upsert({
          where: { email: user.email },
          update: {},
          create: { email: user.email, name: user.name ?? null, passwordHash: null },
        });
        token.id = dbUser.id.toString();
      } else if (user) {
        token.id = user.id;
      }
      if (trigger === "update" && session?.name !== undefined) token.name = session.name;
      return token;
    },
    async session({ session, token }) {
      if (session.user) session.user.id = token.id as string;
      return session;
    },
  },
});
