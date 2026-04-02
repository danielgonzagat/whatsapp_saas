const svgDataUri = (label: string, bg: string, fg: string) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" width="72" height="72" viewBox="0 0 72 72">
      <rect width="72" height="72" rx="20" fill="${bg}" />
      <circle cx="36" cy="22" r="6" fill="${fg}" opacity="0.16" />
      <text x="36" y="43" text-anchor="middle" font-family="Arial, sans-serif" font-size="15" font-weight="700" fill="${fg}">
        ${label}
      </text>
    </svg>
  `)}`;

export const THANOS_ICONS = [
  { n: 'Checkout', d: svgDataUri('CK', '#111113', '#E85D30') },
  { n: 'CRM', d: svgDataUri('CRM', '#111113', '#E0DDD8') },
  { n: 'Ads', d: svgDataUri('ADS', '#111113', '#3B82F6') },
  { n: 'Email', d: svgDataUri('EM', '#111113', '#10B981') },
  { n: 'Inbox', d: svgDataUri('IN', '#111113', '#F59E0B') },
  { n: 'Members', d: svgDataUri('MB', '#111113', '#EC4899') },
  { n: 'Analytics', d: svgDataUri('AN', '#111113', '#8B5CF6') },
  { n: 'AI', d: svgDataUri('AI', '#111113', '#25D366') },
];
