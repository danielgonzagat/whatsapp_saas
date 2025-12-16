import { auth } from "@/auth";
import { redirect } from "next/navigation";

export default async function RegisterPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const session = await auth();
  if (session?.user) {
    redirect("/");
  }

  const qp = new URLSearchParams();
  qp.set("authMode", "signup");

  const email = typeof searchParams?.email === "string" ? searchParams.email : "";
  if (email) qp.set("email", email);

  redirect(`/?${qp.toString()}`);
}
