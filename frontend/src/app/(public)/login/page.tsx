import { redirect } from "next/navigation";

export default async function LoginPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedSearchParams = await searchParams;
  const qp = new URLSearchParams();
  qp.set("authMode", "login");

  const email =
    typeof resolvedSearchParams?.email === "string"
      ? resolvedSearchParams.email
      : "";
  if (email) qp.set("email", email);

  const authError =
    typeof resolvedSearchParams?.authError === "string"
      ? resolvedSearchParams.authError
      : "";
  if (authError) qp.set("authError", authError);

  redirect(`/?${qp.toString()}`);
}
