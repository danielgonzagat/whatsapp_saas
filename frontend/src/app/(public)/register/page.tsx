import { KloelAuthScreen } from "@/components/kloel/auth/kloel-auth-screen";

interface RegisterPageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export default async function RegisterPage({ searchParams }: RegisterPageProps) {
  const params = (await searchParams) || {};
  const rawEmail = params.email;
  const prefilledEmail = Array.isArray(rawEmail) ? rawEmail[0] : rawEmail;

  return <KloelAuthScreen initialMode="register" prefilledEmail={prefilledEmail} />;
}
