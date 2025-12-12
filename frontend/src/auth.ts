import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Apple from "next-auth/providers/apple";
import Credentials from "next-auth/providers/credentials";

const backendUrl =
  process.env.BACKEND_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://localhost:3001";

const authBaseUrl =
  (process.env.NEXTAUTH_URL || process.env.AUTH_URL || "").replace(/\/+$/, "");

function mask(value: string | undefined, visible = 6) {
  if (!value) return "";
  if (value.length <= visible) return value;
  return `${value.slice(0, visible)}…`;
}

if (process.env.AUTH_DEBUG === "true") {
  const googleRedirect = authBaseUrl
    ? `${authBaseUrl}/api/auth/callback/google`
    : "(NEXTAUTH_URL/AUTH_URL ausente)";
  const appleRedirect = authBaseUrl
    ? `${authBaseUrl}/api/auth/callback/apple`
    : "(NEXTAUTH_URL/AUTH_URL ausente)";

  console.log("[AuthDebug] env", {
    nodeEnv: process.env.NODE_ENV,
    nextauthUrl: process.env.NEXTAUTH_URL,
    authUrl: process.env.AUTH_URL,
    backendUrl,
    googleClientId: mask(process.env.GOOGLE_CLIENT_ID),
  });
  console.log("[AuthDebug] redirect_uris", {
    google: googleRedirect,
    apple: appleRedirect,
  });
}

// Força a URL base para o NextAuth (resolve problemas com proxies/rewrites)
const resolvedAuthUrl =
  process.env.AUTH_URL ||
  process.env.NEXTAUTH_URL ||
  (typeof window !== "undefined" ? window.location.origin : "http://localhost:3000");

export const { handlers, signIn, signOut, auth } = NextAuth({
  trustHost: true,
  // Força a base URL para evitar redirect_uri_mismatch com proxies
  ...(resolvedAuthUrl && { basePath: "/api/auth" }),
  providers: [
    // Google OAuth - usa callback customizado para contornar rewrite do hosting
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          // Força o redirect_uri correto (o que está cadastrado no Google Console)
          redirect_uri: `${resolvedAuthUrl}/auth/google/callback`,
        },
      },
    }),

    // Apple OAuth - usa callback customizado para contornar rewrite do hosting
    Apple({
      clientId: process.env.APPLE_CLIENT_ID!,
      clientSecret: process.env.APPLE_CLIENT_SECRET!,
      authorization: {
        params: {
          redirect_uri: `${resolvedAuthUrl}/auth/apple/callback`,
        },
      },
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
            `${backendUrl}/auth/login`,
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
      // Para OAuth (Google/Apple), precisamos trocar o login pelo token do backend.
      // Sem isso, o usuário "loga" no NextAuth mas fica sem accessToken/workspaceId
      // e o dashboard falha em chamadas autenticadas.
      if (account?.provider === "google" || account?.provider === "apple") {
        try {
          const response = await fetch(`${backendUrl}/auth/oauth`, {
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

          if (!response.ok) {
            const text = await response.text().catch(() => "");
            console.error("OAuth backend sync failed:", {
              status: response.status,
              body: text?.slice?.(0, 500) || text,
            });
            return false;
          }

          const data = await response.json();

          // Injeta dados do backend no user para o jwt() persistir no token.
          (user as any).id = data?.user?.id;
          (user as any).workspaceId = data?.user?.workspaceId;
          (user as any).role = data?.user?.role;
          (user as any).accessToken = data?.access_token;
        } catch (error) {
          console.error("Error syncing OAuth user with backend:", error);
          return false;
        }
      }

      return true;
    },
  },

  session: {
    strategy: "jwt",
  },

  secret: process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET,
});
