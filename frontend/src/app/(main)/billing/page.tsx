import { redirect } from 'next/navigation';

/** Billing page. */
export default function BillingPage() {
  redirect('/settings?section=billing');
}
