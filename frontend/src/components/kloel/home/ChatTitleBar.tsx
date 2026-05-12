interface ChatTitleBarProps {
  title: string;
}

export function ChatTitleBar({ title }: ChatTitleBarProps) {
  return (
    <div
      style={{
        height: 44,
        display: 'flex',
        alignItems: 'center',
        padding: '0 20px',
        borderBottom: '1px solid var(--app-border-subtle)',
        flexShrink: 0,
      }}
    >
      <span
        style={{
          fontFamily: "'Sora', sans-serif",
          fontSize: 16,
          fontWeight: 600,
          color: 'var(--app-text-primary)',
          letterSpacing: '-0.01em',
        }}
      >
        {title}
      </span>
    </div>
  );
}
