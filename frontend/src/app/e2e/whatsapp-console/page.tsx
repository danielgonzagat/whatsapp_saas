'use client';

import { WhatsAppConsole, useWhatsAppConsole } from '@/components/kloel/WhatsAppConsole';

export default function E2EWhatsAppConsolePage() {
  const consoleState = useWhatsAppConsole();

  return (
    <main className="min-h-screen bg-slate-100">
      <WhatsAppConsole
        isOpen={consoleState.isOpen}
        onClose={consoleState.close}
        onToggle={consoleState.toggle}
        activities={[]}
        isThinking={false}
      />
    </main>
  );
}
