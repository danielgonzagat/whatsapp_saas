'use client';

export function SkeletonBlock({
  width = '100%',
  height = 12,
  style,
}: {
  width?: string | number;
  height?: string | number;
  style?: React.CSSProperties;
}) {
  return (
    <div
      style={{
        width,
        height,
        borderRadius: 6,
        background:
          'linear-gradient(90deg, rgba(25,25,28,0.96) 0%, rgba(41,41,46,0.98) 50%, rgba(25,25,28,0.96) 100%)',
        ...style,
      }}
    />
  );
}

export function MemberAreaSidebarSkeleton() {
  return (
    <div style={{ padding: '16px' }}>
      {[0, 1, 2].map((index) => (
        <div key={`skeleton-${index}`} style={{ marginBottom: 20 }}>
          <SkeletonBlock
            width={`${68 - index * 8}%`}
            height={14}
            style={{ marginBottom: 10 }}
          />
          <SkeletonBlock
            width="88%"
            height={11}
            style={{ marginLeft: 16, marginBottom: 8 }}
          />
          <SkeletonBlock width="76%" height={11} style={{ marginLeft: 16 }} />
        </div>
      ))}
    </div>
  );
}

export function MemberAreaContentSkeleton() {
  return (
    <div>
      <SkeletonBlock width="42%" height={24} style={{ marginBottom: 12 }} />
      <SkeletonBlock width="76%" height={13} style={{ marginBottom: 8 }} />
      <SkeletonBlock width="61%" height={13} style={{ marginBottom: 24 }} />
      <SkeletonBlock width="100%" height={420} style={{ borderRadius: 10 }} />
    </div>
  );
}
