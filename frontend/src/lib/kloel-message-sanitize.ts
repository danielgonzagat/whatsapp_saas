'use client';

const ASSISTANT_DSML_TOOL_CALLS_BLOCK_RE =
  /<[\uFF5C|]{2}DSML[\uFF5C|]{2}tool_calls\b[^>]*>[\s\S]*?<\/[\uFF5C|]{2}DSML[\uFF5C|]{2}tool_calls>/gi;
const ASSISTANT_DSML_INVOKE_BLOCK_RE =
  /<[\uFF5C|]{2}DSML[\uFF5C|]{2}invoke\b[^>]*>[\s\S]*?<\/[\uFF5C|]{2}DSML[\uFF5C|]{2}invoke>/gi;
const ASSISTANT_XML_TOOL_CALLS_BLOCK_RE = /<tool_calls\b[^>]*>[\s\S]*?<\/tool_calls>/gi;
const ASSISTANT_XML_INVOKE_BLOCK_RE = /<invoke\b[^>]*>[\s\S]*?<\/invoke>/gi;
const ASSISTANT_OPEN_TOOL_MARKUP_RE =
  /<[\uFF5C|]{2}DSML[\uFF5C|]{2}(?:tool_calls|invoke)\b[\s\S]*$|<(?:tool_calls|invoke)\b[\s\S]*$/i;
const ASSISTANT_IMPLEMENTATION_PATH_RE =
  /\b(?:backend|frontend|src|scripts|apps|packages)\/[A-Za-z0-9._~!$&'()*+,;=:@/%-]+/g;
const ASSISTANT_FILE_REFERENCE_RE =
  /\barquivo\s+(?=[A-Za-z0-9._~!$&'()*+,;=:@/%-]*(?:[\\/\\\\]|(?:\.[A-Za-z0-9]{1,12}\b)))[A-Za-z0-9._~!$&'()*+,;=:@/%-]+/gi;
const ASSISTANT_IMPLEMENTATION_LANGUAGE_RE = /\b(?:TypeScript|JavaScript|TSX|JSX)\b/g;
const ASSISTANT_SYMBOL_COUNT_RE = /\b\d+\s+s[ií]mbolos?\b/gi;
const ASSISTANT_INTERNAL_CERTIFICATION_SENTENCE_RE =
  /\s*Meu status de\s+["“]?no overclaim["”]?\s+é\s+PASS\.[ \t]*/gi;
const ASSISTANT_INTERNAL_CERTIFICATION_TOKEN_RE =
  /\b(?:no overclaim|overclaim|PASS(?![-A-Za-zÀ-ÖØ-öø-ÿ0-9_])|ABI\s+\d+(?:\.\d+){1,3}|certificationVerdict|runtimeEvidencePct|INSUFFICIENT_EVIDENCE)\b/gi;
const ASSISTANT_INTERNAL_VERSION_RE = /\bversão\s+\d+(?:\.\d+){1,3}\b/gi;
const ASSISTANT_PRODUCT_LANGUAGE_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\bworkingMemory\b/g, 'memória de trabalho'],
  [/\battention\.candidates\b/gi, 'foco de atenção'],
  [/\bdashboard:chat\b/gi, 'chat do Kloel'],
  [/\bdashboard\b/gi, 'chat do Kloel'],
  [/\bskill\s+checkout-recovery\b/gi, 'habilidade de recuperação de checkout'],
  [/\bskill\s+recuperação de checkout\b/gi, 'habilidade de recuperação de checkout'],
  [/\bcheckout-recovery\b/gi, 'recuperação de checkout'],
  [/\bwebhook\b/gi, 'integração externa'],
  [/\bscore\b/gi, 'pontuação'],
  [/\bworkspace\b/gi, 'ambiente operacional'],
  [/\bruntime\b/gi, 'arquitetura cognitiva'],
  [/\bbackend\b/gi, 'infraestrutura'],
  [/\bfrontend\b/gi, 'interface'],
  [/\bstateless\b/gi, 'sem memória persistente'],
  [/\bpending\b/gi, 'pendente'],
  [/\bactive\b/gi, 'ativo'],
  [/\bhealthy\b/gi, 'saudável'],
  [/\bdeveloping\b/gi, 'em desenvolvimento'],
  [/\bstable\b/gi, 'estável'],
  [/\bproven\b/gi, 'comprovado'],
  [/\bobserved\b/gi, 'observado'],
  [/\bcertificação interna\b/gi, 'verificação de consistência'],
  [/\bmódulo principal\b/gi, 'núcleo operacional'],
];

export function sanitizeAssistantVisibleContent(value: string): string {
  return ASSISTANT_PRODUCT_LANGUAGE_REPLACEMENTS.reduce(
    (text, [pattern, replacement]) => text.replace(pattern, replacement),
    value,
  )
    .replace(ASSISTANT_DSML_TOOL_CALLS_BLOCK_RE, ' ')
    .replace(ASSISTANT_DSML_INVOKE_BLOCK_RE, ' ')
    .replace(ASSISTANT_XML_TOOL_CALLS_BLOCK_RE, ' ')
    .replace(ASSISTANT_XML_INVOKE_BLOCK_RE, ' ')
    .replace(ASSISTANT_OPEN_TOOL_MARKUP_RE, '')
    .replace(
      /\bErro:\s*Venda\s+n[aã]o\s+encontrada\.?/gi,
      'Não encontrei uma venda correspondente para essa consulta.',
    )
    .replace(
      /\bA criação de site está conectada, mas o provedor de geração de sites ainda não está configurado neste ambiente\. Configure a chave do provedor e tente novamente\.?/gi,
      'A criação de site está conectada, mas a configuração de geração de sites ainda não foi concluída neste ambiente. Finalize a configuração e tente novamente.',
    )
    .replace(/\bMissing Authorization header\b/gi, 'sessão expirada')
    .replace(/\bAcao\b/g, 'Ação')
    .replace(
      ASSISTANT_INTERNAL_CERTIFICATION_SENTENCE_RE,
      ' A verificação de consistência não detectou capacidades sem evidência observada. ',
    )
    .replace(/\bc[oó]digo(?:\s+fonte)?\b/gi, 'arquitetura interna')
    .replace(ASSISTANT_FILE_REFERENCE_RE, 'camada interna')
    .replace(ASSISTANT_IMPLEMENTATION_PATH_RE, 'arquitetura interna')
    .replace(ASSISTANT_IMPLEMENTATION_LANGUAGE_RE, 'tecnologia interna')
    .replace(ASSISTANT_SYMBOL_COUNT_RE, 'componentes reais')
    .replace(ASSISTANT_INTERNAL_VERSION_RE, 'versão atual')
    .replace(ASSISTANT_INTERNAL_CERTIFICATION_TOKEN_RE, 'verificação de consistência')
    .replace(/\balegação acima do observadoos\b/gi, 'passos')
    .replace(/\bvers[aã]o\s+verifica[cç][aã]o de consist[eê]ncia\b/gi, 'versão atual')
    .replace(
      /(?:\s+com)?\s+verifica[cç][aã]o de consist[eê]ncia(?:\s+verifica[cç][aã]o de consist[eê]ncia)+/gi,
      ' verificação de consistência',
    )
    .replace(
      /existe(?:\s+no contexto)?\s+com\s+outcome:\s*[^.]+/gi,
      'está registrada, mas ainda sem execução real',
    )
    .replace(/\b(?:outcome|success|failure|patch|view):\s*[^\s,.`]+`?/gi, '')
    .replace(/\bmétrica interna\b/gi, '')
    .replace(
      /A\s+(?:skill|habilidade)\s+`?(?:checkout-recovery|recuperação de checkout|habilidade de recuperação de checkout)`?\s+existe no contexto com[^.]*\./gi,
      'A habilidade de recuperação de checkout está registrada, mas ainda não foi exercitada.',
    )
    .replace(
      /A habilidade de recuperação de checkout existe no contexto com[^.]*\./gi,
      'A habilidade de recuperação de checkout está registrada, mas ainda não foi exercitada.',
    )
    .replace(
      /A skill recuperação de checkout existe no contexto com[^.]*\./gi,
      'A habilidade de recuperação de checkout está registrada, mas ainda não foi exercitada.',
    )
    .replace(/(?:[\u2705\u274c\u26a0\u{1f680}]|\uFE0F)+/gu, '')
    .replace(/\binfraestrutura\/arquitetura interna\b/gi, 'camada interna')
    .replace(/\bcamada internaexado\b/gi, 'arquivo anexado')
    .replace(/\bcamada interna teste\b/gi, 'Arquivo de teste')
    .replace(/\bcamada interna\s+interna\b/gi, 'camada interna')
    .replace(
      /\bEle está em tecnologia interna, no arquivo camada interna\./gi,
      'Ela está acessível em uma camada operacional validada.',
    )
    .replace(
      /\bEle está em camada operacional, no arquivo camada interna\./gi,
      'Ela está acessível em uma camada operacional validada.',
    )
    .replace(/\barquivo\s+camada interna\b/gi, 'camada operacional')
    .replace(/\btecnologia interna\b/gi, 'camada operacional')
    .replace(/\bcamada operacional\s+intern[ao]\b/gi, 'camada operacional')
    .replace(/\bO módulo contém componentes reais\./gi, 'O núcleo contém capacidades reais.')
    .replace(/\bfunções,\s*classes,\s*tipos\b/gi, 'componentes reais')
    .replace(/\bs[ií]mbolos reais\b/gi, 'componentes reais')
    .replace(/\bcomponentes reais\s*\(componentes reais\)/gi, 'componentes reais')
    .replace(/\barquitetura cognitiva\s+cognitiva\b/gi, 'arquitetura cognitiva')
    .replace(
      /\binspeção da arquitetura interna\s+camada interna\s+camada operacional\s+componentes reais\b/gi,
      'camada interna validada com componentes reais',
    )
    .replace(
      /\binspeção da arquitetura interna\s+camada interna\s+tecnologia interna\s+componentes reais\b/gi,
      'camada interna validada com componentes reais',
    )
    .replace(
      /\barquitetura interna\s+camada interna\s+componentes reais\b/gi,
      'camada interna validada com componentes reais',
    )
    .replace(/\bmeu arquitetura interna\b/gi, 'minha arquitetura interna')
    .replace(/\bmeu próprio arquitetura interna\b/gi, 'minha própria arquitetura interna')
    .replace(/\bao minha própria arquitetura interna\b/gi, 'à minha própria arquitetura interna')
    .replace(/\bdo minha arquitetura interna\b/gi, 'da minha arquitetura interna')
    .replace(
      /\bnão é uma simulação, é o camada interna na infraestrutura\b/gi,
      'não é uma simulação; é acesso real à camada operacional',
    )
    .replace(/\bo arquitetura interna\b/gi, 'a arquitetura interna')
    .replace(/\bdo arquitetura interna\b/gi, 'da arquitetura interna')
    .replace(/\bno arquitetura interna\b/gi, 'na arquitetura interna')
    .replace(/\bcamada interna no infraestrutura\b/gi, 'camada interna na infraestrutura')
    .replace(
      /\bEle está em camada operacional,\s+no\s+arquivo\s+`?camada interna`?\./gi,
      'Ela está acessível em uma camada operacional validada.',
    )
    .replace(/\bno\s+arquivo\s+`?camada interna`?\b/gi, 'em uma camada operacional')
    .replace(/\bno\s+chat do Kloel\b/gi, 'pelo chat do Kloel')
    .replace(/\barquitetura interna\b/gi, 'camada operacional')
    .replace(/\bcamada operacional\s+intern[ao]\b/gi, 'camada operacional')
    .replace(/\bambiente operacional está operacional\b/gi, 'ambiente operacional está ativo')
    .replace(/\binspeção da camada operacional\b/gi, 'checagem privada')
    .replace(/\bbusca na camada operacional\b/gi, 'checagem privada')
    .replace(/\bauditoria da camada operacional\b/gi, 'checagem privada')
    .replace(/\bestado oculto da ferramenta\b/gi, 'estado privado')
    .replace(/\bchamada a sistema\b/gi, 'detalhe privado')
    .replace(/\bcamada operacional\b/gi, 'processo privado')
    .replace(/à processo privado\b/gi, 'ao processo privado')
    .replace(/\bda processo privado\b/gi, 'do processo privado')
    .replace(/\bna processo privado\b/gi, 'no processo privado')
    .replace(/"em desenvolvimento"\s+\(em desenvolvimento\)/gi, '"em desenvolvimento"')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

// Markdown code spans that must be preserved verbatim. Fenced blocks (``` … ```
// and ~~~ … ~~~) come first so an inline-code regex inside a fence is never
// matched; inline code (`…`, ``…``) is matched after. The whole-string prose
// rewrite must NOT touch these, otherwise paths like `frontend/src/...`,
// language names like `TypeScript`, and tokens such as `runtime`/`backend`
// would be rewritten inside the rendered/downloadable code artifact.
const MARKDOWN_CODE_SEGMENT_RE = /(```[\s\S]*?```|~~~[\s\S]*?~~~|(`+)[\s\S]*?\2)/g;

/**
 * Apply the product-facing prose rewrite (`sanitizeAssistantVisibleContent`) to
 * a Markdown string while leaving fenced and inline code segments untouched.
 *
 * The assistant's answer is also mined for downloadable file cards from the very
 * same fenced blocks (see `detectDeliverableAnswerFiles`), so rewriting code in
 * place would corrupt both the rendered artifact and its download. This splits
 * the string on code segments, sanitizes only the prose between them, and
 * reassembles — preserving multiple/sequential fences and inline code verbatim.
 */
export function sanitizeAssistantMarkdown(value: string): string {
  const source = String(value || '');
  let result = '';
  let lastIndex = 0;
  MARKDOWN_CODE_SEGMENT_RE.lastIndex = 0;
  let match = MARKDOWN_CODE_SEGMENT_RE.exec(source);
  while (match) {
    const prose = source.slice(lastIndex, match.index);
    if (prose) {
      result += sanitizeAssistantVisibleContent(prose);
    }
    // Code segment is preserved byte-for-byte.
    result += match[0];
    lastIndex = match.index + match[0].length;
    match = MARKDOWN_CODE_SEGMENT_RE.exec(source);
  }
  const trailingProse = source.slice(lastIndex);
  if (trailingProse) {
    result += sanitizeAssistantVisibleContent(trailingProse);
  }
  return result;
}
