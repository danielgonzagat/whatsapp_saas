export type CheckoutSocialProvider = 'google' | 'facebook' | 'apple';

export interface CheckoutSocialIdentitySnapshot {
  leadId?: string;
  provider: CheckoutSocialProvider;
  name: string;
  email: string;
  avatarUrl?: string | null;
  deviceFingerprint: string;
  phone?: string | null;
  cpf?: string | null;
  cep?: string | null;
  street?: string | null;
  number?: string | null;
  neighborhood?: string | null;
  city?: string | null;
  state?: string | null;
  complement?: string | null;
}

export type PrefillResponse = {
  leadId: string;
  provider: CheckoutSocialProvider;
  name?: string | null;
  email?: string | null;
  avatarUrl?: string | null;
  deviceFingerprint?: string | null;
  phone?: string | null;
  cpf?: string | null;
  cep?: string | null;
  street?: string | null;
  number?: string | null;
  neighborhood?: string | null;
  city?: string | null;
  state?: string | null;
  complement?: string | null;
};
