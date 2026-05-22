import { redirect } from 'next/navigation';

/**
 * The Marketing module has no index surface — "Conversas" was retired
 * (spec §15). Land users on the first channel.
 */
export default function MarketingPage() {
  redirect('/marketing/whatsapp');
}
