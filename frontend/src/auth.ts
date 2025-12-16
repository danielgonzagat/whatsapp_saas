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

function normalizeAuthBaseUrl(value: string | undefined) {
  if (!value) return "";
  const trimmed = value.trim().replace(/\/+$/, "");
  if (!trimmed) return "";

  try {
    const url = new URL(trimmed);
    const pathname = url.pathname.replace(/\/+$/, "");

    if (pathname === "/api/auth" || pathname === "/auth") {
      url.pathname = "/";
    }

    url.search = "";
    url.hash = "";

    const basePath = url.pathname === "/" ? "" : url.pathname.replace(/\/+$/, "");
    return `${url.origin}${basePath}`;
  } catch {
    return trimmed;
  }
}

function mask(value: string | undefined, visible = 6) {
  if (!value) return "";
  if (value.length <= visible) return value;
  return `${value.slice(0, visible)}…`;
}

if (process.env.AUTH_DEBUG === "true") {
  const effectiveBaseUrl = normalizeAuthBaseUrl(authBaseUrl);
  const googleRedirect = effectiveBaseUrl
    ? `${effectiveBaseUrl}/api/auth/callback/google`
    : "(NEXTAUTH_URL/AUTH_URL ausente)";
  const appleRedirect = effectiveBaseUrl
    ? `${effectiveBaseUrl}/api/auth/callback/apple`
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

// Normaliza AUTH_URL/NEXTAUTH_URL para não terminar em /auth ou /api/auth
// (o callback correto é sempre /api/auth/callback/{provider}).
const rawEnvAuthUrl = process.env.AUTH_URL || process.env.NEXTAUTH_URL;
const resolvedAuthUrl = normalizeAuthBaseUrl(rawEnvAuthUrl) || "http://localhost:3000";

const shouldUseSecureCookies = resolvedAuthUrl.startsWith("https://");

// Se alguém configurar AUTH_URL/NEXTAUTH_URL com "/auth" ou "/api/auth",
// ajusta em runtime para evitar comportamento inesperado.
if (rawEnvAuthUrl && resolvedAuthUrl && rawEnvAuthUrl.replace(/\/+$/, "") !== resolvedAuthUrl) {
  if (process.env.AUTH_DEBUG === "true") {
    console.warn("[AuthDebug] normalizando AUTH_URL/NEXTAUTH_URL", {
      from: rawEnvAuthUrl,
      to: resolvedAuthUrl,
    });
  }

  if (process.env.AUTH_URL) process.env.AUTH_URL = resolvedAuthUrl;
  if (process.env.NEXTAUTH_URL) process.env.NEXTAUTH_URL = resolvedAuthUrl;
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  trustHost: true,
  useSecureCookies: shouldUseSecureCookies,
  providers: [
    // Google OAuth - usa o callback padre3o do NextAuth:
    // /api/auth/callback/google
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),

    // Apple OAuth - usa o callback padre3o do NextAuth:
    // /api/auth/callback/apple
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
    newUser: "/register",
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

            let parsed: any = undefined;
            try {
              parsed = text ? JSON.parse(text) : undefined;
            } catch {
              parsed = undefined;
            }

            const errorId =
              typeof parsed?.errorId === "string" ? parsed.errorId : "";

            const email = typeof user?.email === "string" ? user.email : "";
            const base = "/login";
            const qp = new URLSearchParams();
            if (email) qp.set("email", email);
            qp.set("from", "oauth");
            if (errorId) qp.set("errorId", errorId);

            // Evita cair em /login?error=AccessDenied sem contexto.
            switch (response.status) {
              case 409: {
                qp.set("authError", "email_exists");
                qp.set("authMode", "login");
                return `${base}?${qp.toString()}`;
              }
              case 401:
              case 403: {
                qp.set("authError", "access_blocked");
                return `${base}?${qp.toString()}`;
              }
              case 429: {
                qp.set("authError", "rate_limit_exceeded");
                return `${base}?${qp.toString()}`;
              }
              case 500: {
                qp.set("authError", "oauth_backend_error_detailed");
                qp.set("status", "500");
                return `${base}?${qp.toString()}`;
              }
              case 503: {
                qp.set("authError", "service_unavailable");
                return `${base}?${qp.toString()}`;
              }
              default: {
                qp.set("authError", "oauth_backend_error_detailed");
                qp.set("status", String(response.status));
                return `${base}?${qp.toString()}`;
              }
            }
          }

          const data = await response.json();

          // Injeta dados do backend no user para o jwt() persistir no token.
          (user as any).id = data?.user?.id;
          (user as any).workspaceId = data?.user?.workspaceId;
          (user as any).role = data?.user?.role;
          (user as any).accessToken = data?.access_token;
        } catch (error) {
          console.error("Error syncing OAuth user with backend:", error);
          return "/?authError=oauth_network_error";
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
