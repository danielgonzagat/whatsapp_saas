import { redirect } from 'next/navigation';

/**
 * /canvas redirects to /canvas/inicio — the canvas landing/dashboard.
 * Redirect kept intentionally — standard sub-route routing pattern.
 */
export default function CanvasPage() {
  redirect('/canvas/inicio');
}
