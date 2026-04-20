// Static data extracted from chat-container.tsx to reduce file-level NLOC
// and cyclomatic complexity. No React, no JSX, no runtime logic.

export const AUTH_ERROR_MESSAGES: Record<string, string> = {
  email_exists: 'E-mail já cadastrado. Faça login para continuar.',
  access_blocked: 'Acesso bloqueado. Contate o suporte.',
  service_unavailable: 'Serviço indisponível no momento. Tente novamente em instantes.',
  rate_limit_exceeded:
    'Muitas tentativas em pouco tempo. Aguarde alguns minutos e tente novamente.',
  oauth_backend_error_detailed:
    'Não foi possível concluir o login com o provedor. Tente novamente mais tarde.',
  oauth_network_error:
    'Falha de rede ao concluir o login. Verifique sua conexão e tente novamente.',
};

/** Seed_product_knowledge_prompt. */
export const SEED_PRODUCT_KNOWLEDGE_PROMPT = `Kloel, agora irei te ensinar sobre meus produtos e preciso que você salve todas as respostas dentro da sua memória permanente:

Quais são os meus produtos?
O que eu vendo?
Como eu vendo?
O que eu entrego?
Como eu entrego?
Quando eu entrego?
O que eu ofereço?
Como eu ofereço?
Quem são os meus clientes?
Como são os meus clientes?
Quais os problemas dos meus clientes?
Qual a idade dos meus clientes?
Qual o gênero dos meus clientes?
O que meus clientes esperam de mim?
Quais são as perguntas que meus clientes sempre me fazem?
Quais são as respostas para essas perguntas?
Como devo agir para ser o melhor vendedor da sua empresa?
Como devo agir para ser o melhor agente comercial possível?
O que eu não posso esquecer jamais?
Como devo agir quando não tenho respostas?
Como devo me apresentar?
Você quer que eu me apresente como inteligência artificial comercial autônoma da sua empresa ou prefere outro modo?

Lembre-se de subir arquivos, fotos, PDFs e tudo que você possui sobre o seu negócio. Quanto mais informações você enviar, melhor o Kloel irá operar.`;
