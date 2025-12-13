import { AuthProvider } from "@/components/kloel/auth/auth-provider";
import { ChatContainer } from "@/components/kloel/chat-container";

export default function HomePage({
  searchParams,
}: {
  searchParams?: { settings?: string; scroll?: string };
}) {
  const openBilling = searchParams?.settings === "billing";
  const scrollCard = openBilling && searchParams?.scroll === "card";

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
