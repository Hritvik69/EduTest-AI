import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import sql from "@/lib/db";

const authSecret =
  process.env.NEXTAUTH_SECRET ??
  process.env.AUTH_SECRET ??
  process.env.EDUTEST_GUEST_SECRET ??
  process.env.GOOGLE_CLIENT_SECRET ??
  process.env.DATABASE_URL;

export const authOptions: NextAuthOptions = {
  secret: authSecret,
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    }),
  ],
  pages: {
    signIn: "/signin",
  },
  session: {
    strategy: "jwt",
  },
  callbacks: {
    async signIn({ user }) {
      const email = user.email?.trim().toLowerCase();
      if (!email || !sql) return Boolean(email);

      await sql`
        INSERT INTO users (email, name, image)
        VALUES (${email}, ${user.name ?? null}, ${user.image ?? null})
        ON CONFLICT (email) DO UPDATE
        SET
          name = COALESCE(EXCLUDED.name, users.name),
          image = COALESCE(EXCLUDED.image, users.image)
      `;

      return true;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.email = token.email;
      }

      return session;
    },
  },
};
