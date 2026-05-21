import { sanitizeSmtpHeaderValue } from './email-smtp-delivery';

describe('email smtp delivery helpers', () => {
  it('removes CRLF and NUL characters from SMTP header values', () => {
    expect(sanitizeSmtpHeaderValue('Pedido\r\nBcc: attacker@example.com\0')).toBe(
      'PedidoBcc: attacker@example.com',
    );
  });

  it('preserves ordinary subject text', () => {
    expect(sanitizeSmtpHeaderValue('Mensagem Kloel')).toBe('Mensagem Kloel');
  });
});
