import { auth } from "@/auth";
import { redirect } from "next/navigation";

export default async function LoginPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const session = await auth();
  if (session?.user) {
    redirect("/");
  }

  const qp = new URLSearchParams();
  qp.set("authMode", "login");

  const email = typeof searchParams?.email === "string" ? searchParams.email : "";
  if (email) qp.set("email", email);

  const authError =
    typeof searchParams?.authError === "string" ? searchParams.authError : "";
  if (authError) qp.set("authError", authError);

  // Compat: quando NextAuth manda ?error=AccessDenied etc.
  const nextAuthError =
    typeof searchParams?.error === "string" ? searchParams.error : "";
  if (nextAuthError && !authError) qp.set("authError", "oauth_backend_error_detailed");

  redirect(`/?${qp.toString()}`);
}
