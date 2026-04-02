const toDataUri = (svg: string) => `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;

const whatsapp = toDataUri(`
  <svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96" fill="none">
    <rect width="96" height="96" rx="28" fill="#25D366"/>
    <path fill="#ffffff" d="M58.4 51.2c-.53-.28-3.14-1.55-3.64-1.73-.49-.18-.85-.26-1.22.26-.35.53-1.37 1.72-1.67 2.08-.3.35-.62.4-1.15.13-.53-.27-2.22-.82-4.23-2.61-1.57-1.4-2.63-3.13-2.94-3.66-.3-.53-.04-.82.24-1.08.24-.24.53-.62.8-.93.27-.31.36-.53.53-.89.18-.35.1-.67-.04-.94-.14-.26-1.21-2.93-1.66-4.01-.43-1.05-.87-.92-1.21-.94-.31-.01-.67-.02-1.03-.02-.35 0-.93.14-1.42.67-.49.53-1.87 1.83-1.87 4.51 0 2.66 1.93 5.23 2.2 5.58.27.35 3.79 5.79 9.18 8.13 1.29.56 2.31.89 3.09 1.16 1.29.41 2.46.35 3.4.22 1.03-.16 3.18-1.29 3.63-2.55.45-1.26.45-2.31.31-2.53-.13-.22-.49-.35-1.03-.62Z"/>
    <path fill="#ffffff" d="M48.02 15C29.78 15 15 29.78 15 48c0 5.84 1.53 11.53 4.43 16.53L15 81l17.52-4.58a32.95 32.95 0 0 0 15.46 3.97h.03C66.22 80.39 81 65.61 81 47.4A32.83 32.83 0 0 0 71.3 24 32.83 32.83 0 0 0 48.02 15Zm-.03 60.49h-.02a27.45 27.45 0 0 1-14.02-3.84l-1-.6-10.4 2.72 2.79-10.12-.64-1.03a27.37 27.37 0 0 1-4.2-14.72c0-15.23 12.39-27.62 27.63-27.62 7.37 0 14.3 2.87 19.52 8.06a27.43 27.43 0 0 1 8.03 19.53c0 15.23-12.39 27.62-27.6 27.62Z"/>
  </svg>
`);

const instagram = toDataUri(`
  <svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96" fill="none">
    <defs>
      <linearGradient id="ig-a" x1="10" y1="86" x2="86" y2="10" gradientUnits="userSpaceOnUse">
        <stop stop-color="#FEDA75"/>
        <stop offset=".28" stop-color="#FA7E1E"/>
        <stop offset=".56" stop-color="#D62976"/>
        <stop offset=".8" stop-color="#962FBF"/>
        <stop offset="1" stop-color="#4F5BD5"/>
      </linearGradient>
    </defs>
    <rect width="96" height="96" rx="28" fill="url(#ig-a)"/>
    <rect x="25" y="25" width="46" height="46" rx="14" stroke="#ffffff" stroke-width="6.5"/>
    <circle cx="48" cy="48" r="11.5" stroke="#ffffff" stroke-width="6.5"/>
    <circle cx="64" cy="32" r="4" fill="#ffffff"/>
  </svg>
`);

const messenger = toDataUri(`
  <svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96" fill="none">
    <defs>
      <linearGradient id="ms-a" x1="14" y1="14" x2="82" y2="82" gradientUnits="userSpaceOnUse">
        <stop stop-color="#00B2FF"/>
        <stop offset="1" stop-color="#006AFF"/>
      </linearGradient>
    </defs>
    <rect width="96" height="96" rx="28" fill="url(#ms-a)"/>
    <path fill="#ffffff" d="M48 20c-15.46 0-28 11.64-28 26 0 8.18 4.07 15.47 10.43 20.23V76l8.76-4.8c2.8.78 5.77 1.2 8.81 1.2 15.46 0 28-11.64 28-26S63.46 20 48 20Zm3.26 34.5-7.11-7.6-13.7 7.6 15.06-15.98 7.26 7.61 13.53-7.61L51.26 54.5Z"/>
  </svg>
`);

const gmail = toDataUri(`
  <svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96" fill="none">
    <rect width="96" height="96" rx="28" fill="#ffffff"/>
    <rect x="17" y="24" width="62" height="48" rx="12" fill="#F6F7F9"/>
    <path fill="#EA4335" d="M24 68V31.4l24 18.2 24-18.2V68h-8V44.27L48 55.91 32 44.27V68h-8Z"/>
    <path fill="#34A853" d="M72 31.4v36.6h-8V44.27L72 31.4Z"/>
    <path fill="#4285F4" d="M24 31.4 32 44.27V68h-8V31.4Z"/>
    <path fill="#FBBC04" d="M24 31.4 48 49.6 72 31.4v-1.3A6.1 6.1 0 0 0 65.9 24H30.1A6.1 6.1 0 0 0 24 30.1v1.3Z"/>
  </svg>
`);

const sms = toDataUri(`
  <svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96" fill="none">
    <defs>
      <linearGradient id="sms-a" x1="18" y1="18" x2="78" y2="78" gradientUnits="userSpaceOnUse">
        <stop stop-color="#34C759"/>
        <stop offset="1" stop-color="#10B981"/>
      </linearGradient>
    </defs>
    <rect width="96" height="96" rx="28" fill="url(#sms-a)"/>
    <path fill="#ffffff" d="M25 31.5c0-4.14 3.36-7.5 7.5-7.5h31c4.14 0 7.5 3.36 7.5 7.5v19c0 4.14-3.36 7.5-7.5 7.5H44.3L31.1 69.6c-1.77 1.55-4.6.29-4.6-2.05V58h-1.5A7.5 7.5 0 0 1 17.5 50.5v-19Z"/>
    <circle cx="38" cy="41" r="3.6" fill="#34C759"/>
    <circle cx="48" cy="41" r="3.6" fill="#34C759"/>
    <circle cx="58" cy="41" r="3.6" fill="#34C759"/>
  </svg>
`);

const tiktok = toDataUri(`
  <svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96" fill="none">
    <rect width="96" height="96" rx="28" fill="#121212"/>
    <path fill="#25F4EE" d="M53.55 24h7.78c.45 4.16 2.78 8.14 6.38 10.45 2.1 1.37 4.53 2.16 7.03 2.31v7.81a23.4 23.4 0 0 1-13.41-4.18v18.8c0 9.5-7.7 17.21-17.2 17.21A17.2 17.2 0 0 1 31.4 46.7c1.7-1.58 3.7-2.74 5.88-3.45v8.18a9.46 9.46 0 0 0-3.17 7.07c0 5.25 4.26 9.5 9.51 9.5 5.24 0 9.5-4.25 9.5-9.5V24Z"/>
    <path fill="#FE2C55" d="M50.48 24h7.78c.45 4.16 2.78 8.14 6.38 10.45 2.1 1.37 4.53 2.16 7.03 2.31v7.81a23.4 23.4 0 0 1-13.41-4.18v18.8c0 9.5-7.7 17.21-17.2 17.21A17.2 17.2 0 0 1 28.33 46.7a17.04 17.04 0 0 1 12.8-5.94c.88 0 1.75.07 2.6.2v7.94a9.57 9.57 0 0 0-2.6-.36c-5.25 0-9.5 4.25-9.5 9.5 0 5.24 4.25 9.5 9.5 9.5 5.24 0 9.5-4.26 9.5-9.5V24Z"/>
    <path fill="#ffffff" d="M52 23h7.5c.43 4 2.7 7.8 6.2 10.02 2.04 1.31 4.4 2.07 6.82 2.22v7.5a22.44 22.44 0 0 1-12.94-4.01v18.01A16.61 16.61 0 0 1 43 73.35c-9.17 0-16.6-7.43-16.6-16.6 0-8.48 6.37-15.47 14.57-16.45v7.66a8.93 8.93 0 0 0-6.99 8.71c0 4.95 4.01 8.96 8.96 8.96 4.94 0 8.95-4.01 8.95-8.96V23Z"/>
  </svg>
`);

export const CHANNEL_ICON_MAP: Record<string, string> = {
  wa: whatsapp,
  ig: instagram,
  fb: messenger,
  em: gmail,
  sms,
  tt: tiktok,
};

export const THANOS_ICONS = [
  { id: 'hotmart', n: 'Hotmart', d: '/landing-icons/thanos/hotmart.png' },
  { id: 'braip', n: 'Braip', d: '/landing-icons/thanos/braip.png' },
  { id: 'corevault', n: 'Corevault', d: '/landing-icons/thanos/corevault.png' },
  { id: 'shopify', n: 'Shopify', d: '/landing-icons/thanos/shopify.png' },
  { id: 'kiwify', n: 'Kiwify', d: '/landing-icons/thanos/kiwify.png' },
  { id: 'canva', n: 'Canva', d: '/landing-icons/thanos/canva.png' },
  { id: 'heart', n: 'Heart', d: '/landing-icons/thanos/heart.png' },
  { id: 'hostgator', n: 'HostGator', d: '/landing-icons/thanos/hostgator.png' },
  { id: 'mailchimp', n: 'Mailchimp', d: '/landing-icons/thanos/mailchimp.png' },
  {
    id: 'activecampaign',
    n: 'ActiveCampaign',
    d: '/landing-icons/thanos/activecampaign.png',
  },
] as const;
