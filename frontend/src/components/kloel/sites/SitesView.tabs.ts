import { kloelT } from '@/lib/i18n/t';
import { IC } from './SitesViewIcons';

export const SITE_TABS = [
  { id: 'visao-geral', label: kloelT(`Visao Geral`), icon: IC.globe },
  { id: 'dominios', label: kloelT(`Dominios`), icon: IC.link },
  { id: 'hospedagem', label: kloelT(`Hospedagem`), icon: IC.server },
  { id: 'criar', label: kloelT(`Criar Site`), icon: IC.site },
  { id: 'editar', label: kloelT(`Editar Site`), icon: IC.edit },
  { id: 'apps', label: kloelT(`Apps`), icon: IC.puzzle },
  { id: 'protecao', label: kloelT(`Protecao`), icon: IC.shield },
] as const;
