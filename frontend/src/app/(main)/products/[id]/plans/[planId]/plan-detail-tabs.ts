import { kloelT } from '@/lib/i18n/t';
import {
  Brain,
  CreditCard,
  Package,
  ScrollText,
  Store,
  Truck,
  Users,
} from 'lucide-react';

export const SUB_TABS = [
  { id: 'store', label: kloelT(`Loja`), icon: Store },
  { id: 'payment', label: kloelT(`Pagamento`), icon: CreditCard },
  { id: 'packaging', label: kloelT(`Embalagem`), icon: Package },
  { id: 'shipping', label: kloelT(`Frete`), icon: Truck },
  { id: 'affiliate', label: kloelT(`Afiliacao`), icon: Users },
  { id: 'checkout', label: kloelT(`Checkout`), icon: CreditCard },
  { id: 'terms', label: kloelT(`Termos`), icon: ScrollText },
  { id: 'ai', label: kloelT(`IA`), icon: Brain },
] as const;
