import { describe, expect, it } from 'vitest';

import type { CheckoutExperienceForm } from './checkout-experience-social-helpers';
import { mergeSocialIdentityPrefill } from './useCheckoutExperienceAutomation';

const EMPTY_FORM: CheckoutExperienceForm = {
  name: '',
  email: '',
  cpf: '',
  phone: '',
  cep: '',
  street: '',
  number: '',
  neighborhood: '',
  complement: '',
  city: '',
  state: '',
  destinatario: '',
  cardNumber: '',
  cardExp: '',
  cardCvv: '',
  cardName: '',
  cardCpf: '',
  installments: '1',
};

describe('mergeSocialIdentityPrefill', () => {
  it('keeps sensitive Google People API fields out of the form when extended prefill is disabled for the session', () => {
    const result = mergeSocialIdentityPrefill(
      EMPTY_FORM,
      {
        provider: 'google',
        name: 'Maria Google',
        email: 'maria@google.com',
        deviceFingerprint: 'device-1',
        phone: '11999999999',
        cep: '01310-100',
        street: 'Av Paulista',
        number: '1000',
        neighborhood: 'Bela Vista',
        city: 'São Paulo',
        state: 'SP',
        complement: '10 andar',
      },
      false,
    );

    expect(result.name).toBe('Maria Google');
    expect(result.email).toBe('maria@google.com');
    expect(result.phone).toBe('');
    expect(result.cep).toBe('');
    expect(result.street).toBe('');
    expect(result.city).toBe('');
    expect(result.state).toBe('');
  });

  it('hydrates phone and address when extended Google prefill remains enabled', () => {
    const result = mergeSocialIdentityPrefill(
      EMPTY_FORM,
      {
        provider: 'google',
        name: 'Maria Google',
        email: 'maria@google.com',
        deviceFingerprint: 'device-1',
        phone: '11999999999',
        cep: '01310-100',
        street: 'Av Paulista',
        number: '1000',
        neighborhood: 'Bela Vista',
        city: 'São Paulo',
        state: 'SP',
        complement: '10 andar',
      },
      true,
    );

    expect(result.phone).toBe('11999999999');
    expect(result.cep).toBe('01310-100');
    expect(result.street).toBe('Av Paulista');
    expect(result.number).toBe('1000');
    expect(result.neighborhood).toBe('Bela Vista');
    expect(result.city).toBe('São Paulo');
    expect(result.state).toBe('SP');
    expect(result.complement).toBe('10 andar');
  });
});
