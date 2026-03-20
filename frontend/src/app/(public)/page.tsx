import { AuthProvider } from "@/components/kloel/auth/auth-provider";
import { ChatContainer } from "@/components/kloel/chat-container";

export default async function HomePage({
  searchParams,
}: {
  searchParams?: Promise<{ settings?: string; scroll?: string }>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const openBilling = resolvedSearchParams?.settings === "billing";
  const scrollCard = openBilling && resolvedSearchParams?.scroll === "card";

  return (
    <main className="min-h-screen bg-[#F8F8F8]">
      <AuthProvider>
        <ChatContainer
          initialOpenSettings={openBilling}
          initialSettingsTab={openBilling ? "billing" : "account"}
          initialScrollToCreditCard={scrollCard}
        />
      </AuthProvider>
    </main>
  );
}
