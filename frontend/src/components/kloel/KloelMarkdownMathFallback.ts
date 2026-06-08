import DOMPurify from 'dompurify';

const LATEX_SYMBOLS: Record<string, string> = {
  alpha: 'α',
  beta: 'β',
  gamma: 'γ',
  delta: 'δ',
  epsilon: 'ε',
  varepsilon: 'ε',
  zeta: 'ζ',
  eta: 'η',
  theta: 'θ',
  vartheta: 'ϑ',
  iota: 'ι',
  kappa: 'κ',
  lambda: 'λ',
  mu: 'μ',
  nu: 'ν',
  xi: 'ξ',
  pi: 'π',
  varpi: 'ϖ',
  rho: 'ρ',
  varrho: 'ϱ',
  sigma: 'σ',
  varsigma: 'ς',
  tau: 'τ',
  upsilon: 'υ',
  phi: 'φ',
  varphi: 'φ',
  chi: 'χ',
  psi: 'ψ',
  omega: 'ω',
  Gamma: 'Γ',
  Delta: 'Δ',
  Theta: 'Θ',
  Lambda: 'Λ',
  Xi: 'Ξ',
  Pi: 'Π',
  Sigma: 'Σ',
  Upsilon: 'Υ',
  Phi: 'Φ',
  Psi: 'Ψ',
  Omega: 'Ω',
  times: '×',
  div: '÷',
  pm: '±',
  mp: '∓',
  cdot: '·',
  ast: '∗',
  star: '⋆',
  leq: '≤',
  le: '≤',
  geq: '≥',
  ge: '≥',
  neq: '≠',
  ne: '≠',
  approx: '≈',
  equiv: '≡',
  sim: '∼',
  simeq: '≃',
  cong: '≅',
  propto: '∝',
  ll: '≪',
  gg: '≫',
  in: '∈',
  notin: '∉',
  ni: '∋',
  subset: '⊂',
  supset: '⊃',
  subseteq: '⊆',
  supseteq: '⊇',
  cup: '∪',
  cap: '∩',
  emptyset: '∅',
  varnothing: '∅',
  forall: '∀',
  exists: '∃',
  nexists: '∄',
  neg: '¬',
  land: '∧',
  lor: '∨',
  wedge: '∧',
  vee: '∨',
  oplus: '⊕',
  otimes: '⊗',
  perp: '⊥',
  parallel: '∥',
  infty: '∞',
  partial: '∂',
  nabla: '∇',
  sum: '∑',
  prod: '∏',
  int: '∫',
  oint: '∮',
  sqrt: '√',
  angle: '∠',
  triangle: '△',
  square: '□',
  rightarrow: '→',
  to: '→',
  leftarrow: '←',
  gets: '←',
  leftrightarrow: String.fromCharCode(0x2194),
  Rightarrow: '⇒',
  implies: '⇒',
  Leftarrow: '⇐',
  Leftrightarrow: '⇔',
  iff: '⇔',
  mapsto: '↦',
  uparrow: '↑',
  downarrow: '↓',
  updownarrow: String.fromCharCode(0x2195),
  ldots: '…',
  cdots: '⋯',
  vdots: '⋮',
  ddots: '⋱',
  dots: '…',
  Re: 'ℜ',
  Im: 'ℑ',
  aleph: 'ℵ',
  hbar: 'ℏ',
  ell: 'ℓ',
  wp: '℘',
  prime: '′',
  circ: '∘',
  bullet: '•',
  dagger: '†',
  ddagger: '‡',
  langle: '⟨',
  rangle: '⟩',
  lceil: '⌈',
  rceil: '⌉',
  lfloor: '⌊',
  rfloor: '⌋',
  quad: ' ',
  qquad: '  ',
  ',': ' ',
  ';': ' ',
  '%': '%',
  $: '$',
  '#': '#',
  '&': '&',
  _: '_',
  '{': '{',
  '}': '}',
};

const SUPERSCRIPT_MAP: Record<string, string> = {
  '0': '⁰',
  '1': '¹',
  '2': '²',
  '3': '³',
  '4': '⁴',
  '5': '⁵',
  '6': '⁶',
  '7': '⁷',
  '8': '⁸',
  '9': '⁹',
  '+': '⁺',
  '-': '⁻',
  '=': '⁼',
  '(': '⁽',
  ')': '⁾',
  n: 'ⁿ',
  i: 'ⁱ',
};

const SUBSCRIPT_MAP: Record<string, string> = {
  '0': '₀',
  '1': '₁',
  '2': '₂',
  '3': '₃',
  '4': '₄',
  '5': '₅',
  '6': '₆',
  '7': '₇',
  '8': '₈',
  '9': '₉',
  '+': '₊',
  '-': '₋',
  '=': '₌',
  '(': '₍',
  ')': '₎',
  a: 'ₐ',
  e: 'ₑ',
  i: 'ᵢ',
  o: 'ₒ',
  x: 'ₓ',
  n: 'ₙ',
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function toScript(run: string, map: Record<string, string>): string | null {
  let out = '';
  for (const ch of run) {
    const mapped = map[ch];
    if (mapped === undefined) {
      return null;
    }
    out += mapped;
  }
  return out;
}

function renderScript(tag: 'sup' | 'sub', inner: string): string {
  const map = tag === 'sup' ? SUPERSCRIPT_MAP : SUBSCRIPT_MAP;
  const unicode = toScript(inner, map);
  if (unicode !== null) {
    return unicode;
  }
  return `<${tag}>${latexToHtml(inner)}</${tag}>`;
}

/**
 * Render a LaTeX-subset string to a safe HTML fragment. Handles \frac, \sqrt,
 * \command symbols, ^{…}/_{…} scripts (and single-char ^a/_a), grouping braces,
 * and passes literal text through escaped. Output is further DOMPurified before
 * it ever reaches the DOM.
 */
function latexToHtml(input: string): string {
  let out = '';
  let i = 0;
  const n = input.length;

  const readGroup = (start: number): { body: string; end: number } => {
    // `start` points at the char after an opening brace; return inner + index past '}'.
    let depth = 1;
    let j = start;
    while (j < n && depth > 0) {
      const c = input[j];
      if (c === '{') {
        depth += 1;
      } else if (c === '}') {
        depth -= 1;
      }
      if (depth === 0) {
        break;
      }
      j += 1;
    }
    return { body: input.slice(start, j), end: j + 1 };
  };

  const readArg = (start: number): { body: string; end: number } => {
    // Either a brace group or a single character.
    if (input[start] === '{') {
      return readGroup(start + 1);
    }
    return { body: input[start] ?? '', end: start + 1 };
  };

  while (i < n) {
    const ch = input[i];

    if (ch === '\\') {
      // Command: read the longest alpha name, else a single symbol char.
      const rest = input.slice(i + 1);
      const nameMatch = rest.match(/^[A-Za-z]+/);
      if (nameMatch) {
        const name = nameMatch[0];
        i += 1 + name.length;
        if (name === 'frac' || name === 'dfrac' || name === 'tfrac') {
          const num = readArg(i);
          const den = readArg(num.end);
          i = den.end;
          out += `<span class="kloel-frac"><span class="kloel-frac-num">${latexToHtml(
            num.body,
          )}</span><span class="kloel-frac-den">${latexToHtml(den.body)}</span></span>`;
          continue;
        }
        if (name === 'sqrt') {
          // optional [index] then the radicand
          let idx = '';
          if (input[i] === '[') {
            const close = input.indexOf(']', i);
            if (close !== -1) {
              idx = input.slice(i + 1, close);
              i = close + 1;
            }
          }
          const arg = readArg(i);
          i = arg.end;
          const indexHtml = idx ? `<sup>${latexToHtml(idx)}</sup>` : '';
          out += `${indexHtml}<span class="kloel-sqrt">√<span class="kloel-sqrt-body">${latexToHtml(
            arg.body,
          )}</span></span>`;
          continue;
        }
        if (name === 'text' || name === 'mathrm' || name === 'mathbf' || name === 'mathit') {
          const arg = readArg(i);
          i = arg.end;
          const weight = name === 'mathbf' ? ' style="font-weight:600"' : '';
          const ital = name === 'mathit' ? ' style="font-style:italic"' : '';
          out += `<span${weight}${ital}>${escapeHtml(arg.body)}</span>`;
          continue;
        }
        if (name === 'left' || name === 'right') {
          // Drop the delimiter sizing command, keep the following delimiter char.
          continue;
        }
        const sym = LATEX_SYMBOLS[name];
        out += sym !== undefined ? escapeHtml(sym) : escapeHtml(name);
        continue;
      }
      // Escaped symbol like \{ \} \% \, etc.
      const symChar = input[i + 1] ?? '';
      const sym = LATEX_SYMBOLS[symChar];
      out += sym !== undefined ? escapeHtml(sym) : escapeHtml(symChar);
      i += 2;
      continue;
    }

    if (ch === '^' || ch === '_') {
      const tag = ch === '^' ? 'sup' : 'sub';
      const arg = readArg(i + 1);
      i = arg.end;
      out += renderScript(tag, arg.body);
      continue;
    }

    if (ch === '{' || ch === '}') {
      // Bare grouping braces are layout-only.
      i += 1;
      continue;
    }

    out += escapeHtml(ch ?? '');
    i += 1;
  }

  return out;
}

const MATH_FALLBACK_PURIFY = {
  ALLOWED_TAGS: ['span', 'sup', 'sub'],
  ALLOWED_ATTR: ['class', 'style'],
};

export const KATEX_PURIFY = {
  ALLOWED_TAGS: [
    'span',
    'sup',
    'sub',
    'svg',
    'path',
    'line',
    'g',
    'mrow',
    'mi',
    'mn',
    'mo',
    'msup',
    'msub',
    'mfrac',
    'msqrt',
    'mroot',
    'math',
    'semantics',
    'annotation',
  ],
  ALLOWED_ATTR: [
    'class',
    'style',
    'aria-hidden',
    'd',
    'viewBox',
    'preserveAspectRatio',
    'width',
    'height',
    'x',
    'y',
    'x1',
    'x2',
    'y1',
    'y2',
    'fill',
    'stroke',
    'stroke-width',
    'xmlns',
    'encoding',
    'mathvariant',
  ],
};

export function buildFallbackMathHtml(source: string): string {
  const rendered = latexToHtml(source.trim());
  return DOMPurify.sanitize(rendered, MATH_FALLBACK_PURIFY);
}
