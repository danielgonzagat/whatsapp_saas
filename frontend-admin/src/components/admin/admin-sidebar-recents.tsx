'use client';

import { useRouter } from 'next/navigation';
import { ConversationsIcon } from './admin-sidebar-config';
import { useAdminChatHistory } from '@/lib/admin-chat-history';

/** Admin sidebar recents. */
export function AdminSidebarRecents({ expanded }: { expanded: boolean }) {
  const router = useRouter();
  const { sessions, activeSessionId, setActiveSessionId } = useAdminChatHistory();

  if (!expanded || sessions.length === 0) {
    return null;
  }

  return (
    <div className="mt-4">
      <div className="mb-1 flex items-center justify-between px-3">
        <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--app-text-tertiary)]">
          Recentes
        </span>
        <span className="text-[10px] text-[var(--app-text-tertiary)]">{sessions.length}</span>
      </div>

      <div className="flex flex-col gap-0.5 px-1">
        {sessions.slice(0, 8).map((session) => {
          const active = session.id === activeSessionId;
          return (
            <button
              key={session.id}
              type="button"
              onClick={() => {
                setActiveSessionId(session.id);
                router.push(`/chat?sessionId=${encodeURIComponent(session.id)}`);
              }}
              className={`flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left transition-colors ${
                active
                  ? 'bg-[var(--app-accent-light)] text-[var(--app-accent)]'
                  : 'hover:bg-[var(--app-bg-hover)]'
              }`}
            >
              <ConversationsIcon
                size={14}
                color={active ? 'var(--app-accent)' : 'var(--app-text-tertiary)'}
              />
              <span
                className={`truncate text-[12px] ${
                  active
                    ? 'font-semibold text-[var(--app-accent)]'
                    : 'text-[var(--app-text-secondary)]'
                }`}
              >
                {session.title}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
