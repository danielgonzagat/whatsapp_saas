/** next-intl request config — single-locale (pt-BR) runtime that returns a
 *  deterministic set of messages. Used by <NextIntlClientProvider> and by
 *  Server Components via getTranslations(). */
import { getRequestConfig } from 'next-intl/server';

const DEFAULT_LOCALE = 'pt-BR';

export default getRequestConfig(async () => {
  const messages = (await import('../../messages/pt.json')).default;
  return {
    locale: DEFAULT_LOCALE,
    messages,
  };
});
