import Link from 'next/link';
import { kloelT } from '@/lib/i18n/t';

const linkStyle = 'underline hover:text-gray-600';

/** Footer minimal. */
export function FooterMinimal() {
  return (
    <footer className="mt-4 text-center">
      <p className="text-xs text-gray-400">
        {kloelT(`Ao usar o Kloel, voce concorda com nossos`)}{' '}
        <Link href="/terms" className={linkStyle}>
          {kloelT(`Termos de Uso`)}
        </Link>{' '}
        e{' '}
        <Link href="/privacy" className={linkStyle}>
          {kloelT(`Politica de Privacidade`)}
        </Link>
        .
      </p>
    </footer>
  );
}
