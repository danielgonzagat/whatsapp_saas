# Como publicar este paper (os botões que só o Daniel pode apertar)

O paper está completo em `main.tex` + `part2.tex` (compila com qualquer
`pdflatex`; sem dependências exóticas — article, amsmath, booktabs, hyperref).
Autor: **Daniel Gonzaga Penin**. Disclosure de assistência de IA já incluída
(política do arXiv: IA não pode ser autora; o autor humano assume as claims —
é exatamente a configuração do documento).

## Passo a passo (≈30 min no total)

### 1. Gerar o PDF (2 min)

Sem TeX local nesta máquina. Opções:
- **Overleaf** (recomendado): criar projeto, subir os 2 `.tex`, compilar, revisar.
- Ou instalar BasicTeX: `brew install --cask basictex` e rodar
  `pdflatex main.tex` (2×) na pasta.

### 2. Revisão sua (15 min)

Você é o autor — leia o PDF inteiro. Pontos que EU marcaria para sua atenção:
- O e-mail no cabeçalho (troque se preferir outro público).
- §7/HumanEval: os números vêm do registro de prioridade
  (`formal/atomic-algebra/PAPER.md`); a réplica r2–r5 com permutation test
  estava registrada como "rodando" — se já concluiu, atualizar a frase.
- §Reproducibility menciona `github.com/danielgonzagat/atomic-os` como
  artefato público "em preparação" — confirme que o repo está apresentável
  antes de submeter (o paper aponta para ele).

### 3. arXiv (10 min + espera de endosso)

- Conta: <https://arxiv.org/user/register> (seu nome/e-mail).
- Categoria primária sugerida: **cs.SE** (Software Engineering); cruzadas:
  cs.PL, cs.AI.
- **Endosso**: contas novas precisam de um endorser na categoria. O formulário
  de submissão gera um código de endosso para enviar a qualquer autor já
  publicado em cs.SE. (Alternativa sem endosso: passo 4 primeiro — o DOI do
  Zenodo já fixa prioridade pública com data.)
- Upload: os 2 `.tex` (o arXiv compila; main.tex faz `\input{part2}`).
- Licença sugerida: arXiv non-exclusive license (padrão).

### 4. Zenodo — DOI imediato, sem endosso (10 min)

- <https://zenodo.org> → login (GitHub funciona) → New upload.
- Subir o PDF + um zip com os artefatos de reprodução
  (`formal/atomic-algebra/` inteiro: confluence_z3.py, NwayConfluence.lean,
  t3_corpus.mjs, t3_result.json, PAPER.md).
- Tipo: Preprint. Autor: Daniel Gonzaga Penin. Publish → **DOI na hora**.
- Este passo sozinho já estabelece o registro público de prioridade com
  carimbo de data — o risco-relógio (alguém fechar a célula (a)+(e) primeiro)
  morre aqui, mesmo antes do arXiv.

### 5. Depois de publicado

- Adicionar o DOI/arXiv-id ao README do atomic-os e ao PAPER.md.
- A cauda de reconhecimento (venue revisado: SOSP/OSDI/PLDI/CAV; replicação
  independente) parte deste registro.

## O que o paper afirma (e o que não)

Todas as claims são lastreadas em artefatos do repo: teorema Z3 + refinamento
(147k configs), 169.171 pares externos com 0 falsa-independência, 9.314 ops de
produção com 0 quebras (verificado adversarialmente), bench ancorado por hash
(410-vs-0), HumanEval canônico 85,4→93,9% com feedback digest-verificado, 1.088
bloqueios no-bypass em tráfego vivo. O paper declara explicitamente: Rice não é
derrotado; garantias são estruturais e relativas à bateria; margens do HumanEval
são direcionais em n=24; reconhecimento externo não é reivindicado.
