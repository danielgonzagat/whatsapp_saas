import { ChatCompletionTool } from 'openai/resources/chat';

/** Code-reading and repository-awareness tool definitions for the KLOEL dashboard chat. */
export const KLOEL_CHAT_TOOLS_CODE: ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'read_source_file',
      description:
        'Lê o conteúdo de um arquivo do código-fonte do Kloel (backend, frontend, worker, docs). ' +
        'Use para entender implementações, contratos e configurações. Caminho relativo à raiz do repositório.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Caminho relativo do arquivo, ex: backend/src/kloel/kloel.service.ts',
          },
          startLine: {
            type: 'number',
            description: 'Linha inicial (1-based, opcional)',
          },
          endLine: {
            type: 'number',
            description: 'Linha final (opcional, inclusiva)',
          },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_source_dir',
      description:
        'Lista arquivos e diretórios na raiz do repositório ou em um caminho relativo. ' +
        'Use para explorar a estrutura do projeto.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Caminho relativo do diretório (opcional, default: raiz do repo)',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_codebase',
      description:
        'Pesquisa no código-fonte do Kloel usando regex. ' +
        'Use para encontrar definições, referências, padrões e usos de APIs. ' +
        'Filtre por tipo de arquivo com glob (ex: *.service.ts).',
      parameters: {
        type: 'object',
        properties: {
          pattern: {
            type: 'string',
            description:
              'Expressão regular para buscar no código, ex: "class KloelService" ou "async tick\\\\("',
          },
          glob: {
            type: 'string',
            description: 'Filtro glob opcional, ex: "*.service.ts" ou "backend/src/**/*.ts"',
          },
        },
        required: ['pattern'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'code_outline',
      description:
        'Retorna o mapa estrutural de um arquivo: funções, classes, interfaces, tipos, constantes e decorators ' +
        'com seus nomes e números de linha. Mais leve que ler o arquivo inteiro.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Caminho relativo do arquivo',
          },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'read_prisma_schema',
      description:
        'Lê o schema do Prisma e retorna a lista de models e enums com total de linhas. ' +
        'Use para entender o modelo de dados do Kloel.',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'git_log',
      description:
        'Retorna os commits recentes do repositório (formato oneline). Use para entender o histórico de mudanças.',
      parameters: {
        type: 'object',
        properties: {
          count: {
            type: 'number',
            description: 'Número de commits (default: 10, max: 20)',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'git_diff',
      description:
        'Retorna o resumo (--stat) do diff entre HEAD e um branch/commit alvo. Use para ver o que foi alterado.',
      parameters: {
        type: 'object',
        properties: {
          target: {
            type: 'string',
            description: 'Branch ou commit de referência (default: HEAD~1)',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'git_status',
      description:
        'Retorna o git status resumido (arquivos modificados, adicionados, não rastreados).',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'run_backend_tests',
      description:
        'Executa testes do backend (Jest). Pode filtrar por nome de teste com o parâmetro pattern. ' +
        'Retorna contagem de passou/falhou e lista de arquivos de teste.',
      parameters: {
        type: 'object',
        properties: {
          pattern: {
            type: 'string',
            description: 'Filtro de nome de teste (opcional), ex: "KloelChatTools"',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'build_status',
      description:
        'Verifica o status de build/typecheck do backend, frontend e/ou worker (tsc --noEmit). ' +
        'Sem parâmetro, verifica todos os três.',
      parameters: {
        type: 'object',
        properties: {
          scope: {
            type: 'string',
            enum: ['backend', 'frontend', 'worker'],
            description: 'Escopo específico (opcional)',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'code_lint',
      description:
        'Executa ESLint em um arquivo específico e retorna erros e warnings com linha, coluna e regra. ' +
        'Use para verificar qualidade de código antes de propor mudanças.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Caminho relativo do arquivo a ser analisado',
          },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'code_detect_issues',
      description:
        'Analisa um arquivo em busca de problemas comuns: TODOs/FIXMEs, console.log direto, an' +
        'y explícito, ' +
        '@' +
        'ts-ignore, testes com .only(), e código potencialmente morto (exportações usadas 1x ou menos).',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Caminho relativo do arquivo a ser analisado',
          },
        },
        required: ['path'],
      },
    },
  },
];
