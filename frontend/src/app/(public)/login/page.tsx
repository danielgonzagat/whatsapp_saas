import { redirect } from "next/navigation";

export default async function LoginPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const qp = new URLSearchParams();
  qp.set("authMode", "login");

  const email = typeof searchParams?.email === "string" ? searchParams.email : "";
  if (email) qp.set("email", email);

  const authError =
    typeof searchParams?.authError === "string" ? searchParams.authError : "";
  if (authError) qp.set("authError", authError);

  redirect(`/?${qp.toString()}`);
}
