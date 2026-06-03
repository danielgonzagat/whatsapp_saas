# Atomic OS Principle

Atualizado: 2026-05-16 15:03 America/Sao_Paulo

## Principio Primario

O Sistema Operacional Atomico existe para transformar IA CLI de geradora textual
de patches em operadora verificavel de intencoes.

A regra central:

- entender o comportamento desejado;
- escolher a operacao mais alta que expresse a intencao;
- executar na menor granularidade fiel;
- preservar explicitamente tudo que nao pertence a intencao;
- validar exatamente o que a mudanca pode quebrar;
- registrar prova e continuidade;
- permitir que o fundador valide pelo produto, nao pelo codigo.

## Topologia De Preservacao

Toda mudanca deve classificar antes de editar:

- unidade alvo: simbolo, expressao, propriedade, chamada, contrato, teste ou fluxo;
- ancoras preservadas: texto/semantica que deve continuar igual;
- zonas modificadas: somente a subestrutura necessaria;
- movimento: partes movidas sem recriacao conceitual;
- wrapper/escopo: contexto adicionado/removido sem marcar conteudo preservado como novo;
- impacto semantico: comportamento, contrato publico, runtime ou prova;
- validacao necessaria: sintaxe, tipo, teste, contrato, carga ou comportamento real.

Linha inteira antiga/nova so e aceitavel quando a linha inteira realmente nasce,
morre ou nao ha ancora preservavel. Caso contrario, e regressao de reescrita de
linha.

## Benchmarks Que Importam

O modo atomico so vence quando supera o modo normal em criterios que importam
para autonomia real:

- taxa de aceite independente;
- ausencia de regressao escondida;
- menor superficie modificada fiel a intencao;
- prova comportamental ou sintetica relevante;
- trace verificavel;
- continuidade de estado;
- coordenacao sem colisao;
- menor dependencia de revisao humana de codigo;
- tempo e memoria, sem sacrificar corretude.

Tempo/diff menor sem criterio semantico nao e vitoria.

## Regra De Escalada De Complexidade

O loop A/B nao para quando o modo atomico vence uma tarefa. Uma vitoria ampla
apenas autoriza subir a complexidade da proxima tarefa.

A complexidade so escala quando o Atomic OS vencer o modo CLI normal com margem
grande em todos os criterios mediveis relevantes da rodada:

- aceite independente;
- corretude semantica;
- prova de preservacao;
- ausencia de contaminacao de trace;
- validacao comportamental/sintetica;
- tempo produtivo;
- memoria;
- superficie de diff;
- rastreabilidade;
- continuidade;
- capacidade de self-termination;
- clareza de handoff para a proxima sessao/agente.

Se o normal vencer qualquer criterio importante, ou se a vitoria atomica for
estreita/ambigua, a complexidade nao sobe. Primeiro a derrota vira melhoria de
ferramenta, depois a mesma classe de tarefa e repetida ate a superioridade ficar
inequivoca.

Depois de superioridade inequívoca, a proxima rodada deve aumentar a dificuldade
da tarefa dentro do limite real do workspace: de microintencao para topologia de
preservacao, de uma operacao para transacao multi-arquivo, de codigo para teste
e contrato, de validacao sintetica para fluxo real, e finalmente para tarefas de
produto/infra com prova comportamental.

O limite final do loop e o maior nivel de complexidade que este workspace
consegue sustentar sem colidir com governanca, memoria, seguranca, producao ou
preservacao de trabalho humano.

## Derrotas Viram Atualizacao

Cada rodada A/B deve registrar onde o modo normal venceu, onde o modo atomico
venceu e quais derrotas atomicas precisam virar melhoria de ferramenta.

Derrotas recentes que viraram requisito:

- self-tests devem usar o mesmo avaliador do caminho real;
- hard-cases sinteticos precisam incluir native coarse sem fallback, fallback
  real e trace atomico positivo;
- validacao atomica nao deve depender de escrever artefatos temporarios por
  shell quando o modo atomic-only bloqueia writes de codigo;
- traces precisam evoluir para preservar zonas/ancoras modificadas, nao apenas
  oldText/newText.

## Proximo Nivel

O alvo nao e apenas "editar menos". O alvo e representar a topologia correta de
cada intencao: valor preservado com campo renomeado, campo preservado com valor
trocado, wrapper adicionado preservando conteudo, operador trocado preservando
operandos, simbolo movido preservando corpo, contrato atualizado preservando
runtime, ou prova adicionada preservando comportamento.

O loop de atualizacao do Atomic OS deve sempre aproximar as ferramentas desse
principio.
