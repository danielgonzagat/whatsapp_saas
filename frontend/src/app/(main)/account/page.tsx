import { redirect } from 'next/navigation';

/**
 * /account is a legacy URL alias for /settings (ContaView).
 * Redirect kept intentionally — both paths serve the account management feature.
 */
export default function Page() {
  redirect('/settings');
}
