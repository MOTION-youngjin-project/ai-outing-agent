import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "./prisma";

// OAuth(카카오 등) 없이 이메일+비밀번호만 지원하므로 Adapter 없이 JWT 세션으로 충분하다
// (Account/Session 테이블이 필요 없음 — Credentials 인증은 next-auth Adapter가 관리 못 함).
export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  pages: { signIn: "/" },
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
        if (!user) return null;

        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) return null;

        return { id: user.id.toString(), email: user.email, name: user.name };
      },
    }),
  ],
  callbacks: {
    // trigger === "update"는 클라이언트에서 useSession().update({ name })을 부를 때
    // (앱 설정에서 이름 변경 저장 후) — 재로그인 없이 세션의 이름을 바로 갱신하기 위함.
    async jwt({ token, user, trigger, session }) {
      if (user) token.id = user.id;
      if (trigger === "update" && session?.name !== undefined) token.name = session.name;
      return token;
    },
    async session({ session, token }) {
      if (session.user) session.user.id = token.id as string;
      return session;
    },
  },
});
