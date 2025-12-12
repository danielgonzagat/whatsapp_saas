import { AuthProvider } from "@/components/kloel/auth/auth-provider"
import { ChatContainer } from "@/components/kloel/chat-container"

export default function Home() {
  return (
    <main className="min-h-screen bg-[#F8F8F8]">
      <AuthProvider>
        <ChatContainer />
      </AuthProvider>
    </main>
  )
}
