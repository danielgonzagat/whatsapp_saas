import { redirect } from 'next/navigation';

/**
 * /metrics is a legacy URL alias for /analytics.
 * Redirect kept intentionally — both paths serve the analytics feature.
 */
export default function Page() {
  redirect('/analytics');
}
