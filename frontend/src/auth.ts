import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Apple from "next-auth/providers/apple";
import Credentials from "next-auth/providers/credentials";

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    // Google OAuth
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),

    // Apple OAuth
    Apple({
      clientId: process.env.APPLE_CLIENT_ID!,
      clientSecret: process.env.APPLE_CLIENT_SECRET!,
    }),

    // Email/Password (Credentials)
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        try {
          const response = await fetch(
            `${process.env.BACKEND_URL}/auth/login`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                email: credentials.email,
                password: credentials.password,
              }),
            }
          );

          if (!response.ok) {
            return null;
          }

          const data = await response.json();
          
          // NextAuth espera um objeto user com id, email, name
          return {
            id: data.user.id,
            email: data.user.email,
            name: data.user.name,
            workspaceId: data.user.workspaceId,
            role: data.user.role,
            accessToken: data.access_token,
          };
        } catch (error) {
          console.error("Auth error:", error);
          return null;
        }
      },
    }),
  ],

  pages: {
    signIn: "/login",
    signOut: "/",
    error: "/login",
    newUser: "/onboarding",
  },

  callbacks: {
    async jwt({ token, user, account }) {
      if (user) {
        token.id = user.id;
        token.email = user.email;
        token.name = user.name;
        // Dados extras do backend
        token.workspaceId = (user as any).workspaceId;
        token.role = (user as any).role;
        token.accessToken = (user as any).accessToken;
      }
      if (account) {
        token.provider = account.provider;
      }
      return token;
    },

    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        (session.user as any).workspaceId = token.workspaceId;
        (session.user as any).role = token.role;
        (session.user as any).accessToken = token.accessToken;
      }
      return session;
    },

    async signIn({ user, account, profile }) {
      // Aqui você pode criar o usuário no seu backend se não existir
      if (account?.provider === "google" || account?.provider === "apple") {
        try {
          await fetch(`${process.env.BACKEND_URL}/auth/oauth`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              provider: account.provider,
              providerId: account.providerAccountId,
              email: user.email,
              name: user.name,
              image: user.image,
            }),
          });
        } catch (error) {
          console.error("Error syncing user:", error);
        }
      }
      return true;
    },
  },

  session: {
    strategy: "jwt",
  },

  secret: process.env.AUTH_SECRET,
});
