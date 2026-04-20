// PULSE Browser Stress Tester — Test Data Generator

const TEST_PREFIX = 'PULSE_TEST_';
const ts = () => Date.now().toString(36);

/** Generate test data. */
export function generateTestData(context: {
  placeholder?: string;
  label?: string;
  inputType?: string;
  inputName?: string;
  tagName?: string;
}): string {
  const { placeholder = '', label = '', inputType = '', inputName = '' } = context;
  const all = `${placeholder} ${label} ${inputName}`.toLowerCase();

  // Email
  if (inputType === 'email' || /email|e-mail/i.test(all)) {
    return `pulse_test_${ts()}@test.kloel.com`;
  }

  // Password
  if (inputType === 'password' || /senha|password/i.test(all)) {
    return 'PulseTest123!';
  }

  // Phone
  if (inputType === 'tel' || /telefone|phone|celular|whatsapp|\(\d{2}\)/i.test(all)) {
    return '11999990000';
  }

  // CPF
  if (/cpf|000\.000\.000/i.test(all)) {
    return '12345678901';
  }

  // CNPJ
  if (/cnpj|00\.000\.000/i.test(all)) {
    return '12345678000190';
  }

  // CEP / ZIP
  if (/cep|00000-000|zip/i.test(all)) {
    return '01001000';
  }

  // URL
  if (inputType === 'url' || /url|link|site|website|dominio/i.test(all)) {
    return `https://pulse-test-${ts()}.example.com`;
  }

  // Price / Currency
  if (inputType === 'number' && /pre[çc]o|price|valor|amount|custo/i.test(all)) {
    return '99.90';
  }

  // Number
  if (inputType === 'number' || /numero|number|quantidade|qty|estoque/i.test(all)) {
    return '42';
  }

  // Date
  if (inputType === 'date' || /data|date/i.test(all)) {
    return '2026-04-01';
  }

  // Name
  if (/nome|name/i.test(all)) {
    return `${TEST_PREFIX}User_${ts()}`;
  }

  // Description / Long text
  if (context.tagName === 'TEXTAREA' || /descri[çc]|description|observa[çc]/i.test(all)) {
    return `${TEST_PREFIX}Texto de teste gerado em ${new Date().toISOString()}`;
  }

  // Color
  if (inputType === 'color' || /cor|color/i.test(all)) {
    return '#E85D30';
  }

  // Search
  if (/busca|search|filtro|pesquis/i.test(all)) {
    return `${TEST_PREFIX}search`;
  }

  // Default
  return `${TEST_PREFIX}${ts()}`;
}

/**
 * Generate a minimal 1x1 PNG for file upload tests.
 * This is the smallest valid PNG file possible (68 bytes).
 */
export function generateTestImage(): Buffer {
  return Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQI12NgAAIABQAB' +
      'Nl7BcQAAAABJRU5ErkJggg==',
    'base64',
  );
}

/** Is test data. */
export function isTestData(value: string): boolean {
  return value.includes(TEST_PREFIX);
}
