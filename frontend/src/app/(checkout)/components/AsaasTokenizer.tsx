'use client';
/**
 * AsaasTokenizer — Placeholder for future Asaas.js SDK integration.
 *
 * When implemented, this component will:
 * 1. Load Asaas.js SDK
 * 2. Create a secure card input field (iframe-based)
 * 3. Tokenize card data client-side
 * 4. Return only the token to the parent component
 * 5. Card numbers NEVER touch our server
 *
 * For now, card data is sent to our backend which forwards to Asaas.
 * This is acceptable because Asaas is PCI DSS compliant, but
 * tokenizing client-side would be more secure.
 *
 * TODO: Integrate Asaas.js SDK when available
 * Docs: https://docs.asaas.com/docs/tokenizacao-de-cartao
 */
export function AsaasTokenizer() {
  return null; // Placeholder — not yet active
}

export const TOKENIZER_STATUS = 'PENDING_INTEGRATION' as const;
