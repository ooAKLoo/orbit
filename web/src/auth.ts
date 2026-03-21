import NextAuth from "next-auth"
import GitHub from "next-auth/providers/github"
import Google from "next-auth/providers/google"

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    GitHub({
      clientId: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
    }),
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
  ],
  pages: {
    signIn: "/login",
  },
  callbacks: {
    authorized({ auth }) {
      return !!auth;
    },
    async jwt({ token, account }) {
      // On first sign-in, sync user with Worker backend
      if (account) {
        try {
          const res = await fetch(`${process.env.ORBIT_API_URL}/admin/auth/sync`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Sync-Secret": process.env.ORBIT_SYNC_SECRET!,
            },
            body: JSON.stringify({
              provider: account.provider,
              provider_id: account.providerAccountId,
              email: token.email,
              name: token.name,
              avatar_url: token.picture,
            }),
          });

          if (res.ok) {
            const data = (await res.json()) as {
              user_id: string;
              auth_token: string;
              plan: string;
              daily_limit: number;
              retention_days: number;
            };
            token.authToken = data.auth_token;
            token.userId = data.user_id;
            token.plan = data.plan;
            token.dailyLimit = data.daily_limit;
            token.retentionDays = data.retention_days;
          }
        } catch (error) {
          console.error("Failed to sync user with Worker:", error);
        }
        token.avatarUrl = token.picture || undefined;
      }
      return token;
    },
    async session({ session, token }) {
      /* eslint-disable @typescript-eslint/no-explicit-any */
      const s = session as any;
      s.authToken = token.authToken;
      s.userId = token.userId;
      s.plan = token.plan;
      s.dailyLimit = token.dailyLimit;
      s.retentionDays = token.retentionDays;
      if (session.user) {
        s.user = { ...session.user, id: token.userId, image: token.avatarUrl || session.user.image };
      }
      return s;
    },
  },
});
