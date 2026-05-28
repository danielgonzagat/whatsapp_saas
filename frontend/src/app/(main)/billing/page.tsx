import { redirect } from 'next/navigation';

/**
 * /billing redirects to the billing section within /settings.
 * Redirect kept intentionally — billing is managed inside the account settings page.
 */
export default function BillingPage() {
  redirect('/settings?section=billing');
}
