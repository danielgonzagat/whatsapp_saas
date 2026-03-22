import { redirect } from "next/navigation";

export default async function RegisterPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedSearchParams = await searchParams;
  const qp = new URLSearchParams();
  qp.set("authMode", "signup");

  const email =
    typeof resolvedSearchParams?.email === "string"
      ? resolvedSearchParams.email
      : "";
  if (email) qp.set("email", email);

  redirect(`/?${qp.toString()}`);
}
