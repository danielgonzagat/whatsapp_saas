import { kloelT } from '@/lib/i18n/t';
/** Footer minimal. */
export function FooterMinimal() {
  return (
    <footer className="mt-4 text-center">
      <p className="text-xs text-gray-400">
        
        {kloelT(`Ao usar o Kloel, você concorda com nossos`)}{' '}
        <a href="#" className="underline hover:text-gray-600">
          
          {kloelT(`Termos de Uso`)}
        </a>{' '}
        e{' '}
        <a href="#" className="underline hover:text-gray-600">
          
          {kloelT(`Política de Privacidade`)}
        </a>
        .
      </p>
    </footer>
  );
}
