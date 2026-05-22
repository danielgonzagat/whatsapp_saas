import { redirect } from 'next/navigation';

/**
 * "Conversas" left the Marketing menu permanently (spec §15). The unified
 * inbox is the canonical messages surface — redirect any lingering link or
 * bookmark there transparently.
 */
export default function MarketingConversasRedirect() {
  redirect('/inbox');
}
