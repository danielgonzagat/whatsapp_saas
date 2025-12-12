'use client';

import { colors } from '@/lib/design-tokens';
import { ArrowLeft, Shield, Lock, Eye, Trash2, Download, Bell } from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function PrivacyPage() {
  const router = useRouter();

  return (
    <div
      className="min-h-screen"
      style={{ backgroundColor: colors.background.obsidian }}
    >
      <div className="max-w-3xl mx-auto px-6 py-12">
        {/* Back button */}
        <button
          onClick={() => router.back()}
          className="flex items-center gap-2 text-white/60 hover:text-white transition-colors mb-8"
        >
          <ArrowLeft size={20} />
          Voltar
        </button>

        <h1 className="text-3xl font-bold text-white mb-4">Política de Privacidade</h1>
        <p className="text-white/60 mb-8">Em conformidade com a LGPD (Lei Geral de Proteção de Dados)</p>
        
        <div className="prose prose-invert max-w-none space-y-6">
          <p className="text-white/80 leading-relaxed">
            Última atualização: {new Date().toLocaleDateString('pt-BR')}
          </p>

          {/* Quick summary */}
          <div 
            className="rounded-xl p-6 my-8"
            style={{ backgroundColor: colors.background.charcoal }}
          >
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <Shield className="text-emerald-400" size={20} />
              Resumo dos seus direitos
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex items-start gap-3">
                <Eye className="text-blue-400 mt-1" size={18} />
                <div>
                  <p className="text-white font-medium">Acesso</p>
                  <p className="text-white/60 text-sm">Solicite todos os dados que temos sobre você</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Trash2 className="text-red-400 mt-1" size={18} />
                <div>
                  <p className="text-white font-medium">Exclusão</p>
                  <p className="text-white/60 text-sm">Peça a remoção completa dos seus dados</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Download className="text-yellow-400 mt-1" size={18} />
                <div>
                  <p className="text-white font-medium">Portabilidade</p>
                  <p className="text-white/60 text-sm">Exporte seus dados em formato aberto</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Bell className="text-purple-400 mt-1" size={18} />
                <div>
                  <p className="text-white font-medium">Revogação</p>
                  <p className="text-white/60 text-sm">Cancele seu consentimento a qualquer momento</p>
                </div>
              </div>
            </div>
          </div>

          <section>
            <h2 className="text-xl font-semibold text-white mt-8 mb-4">1. Informações que Coletamos</h2>
            <p className="text-white/70 leading-relaxed">
              Coletamos as seguintes categorias de dados pessoais:
            </p>
            <ul className="list-disc list-inside text-white/70 mt-2 space-y-2">
              <li>
                <strong>Dados de identificação:</strong> nome, email, telefone, foto de perfil
              </li>
              <li>
                <strong>Dados de uso:</strong> interações com a plataforma, logs de acesso, preferências
              </li>
              <li>
                <strong>Dados de conversas:</strong> mensagens trocadas via WhatsApp para processamento do serviço
              </li>
              <li>
                <strong>Dados financeiros:</strong> histórico de pagamentos (não armazenamos dados de cartão)
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mt-8 mb-4">2. Base Legal do Tratamento</h2>
            <p className="text-white/70 leading-relaxed">
              Tratamos seus dados com base nas seguintes hipóteses legais previstas na LGPD:
            </p>
            <ul className="list-disc list-inside text-white/70 mt-2 space-y-1">
              <li><strong>Execução de contrato:</strong> para fornecer o serviço contratado</li>
              <li><strong>Consentimento:</strong> para envio de comunicações de marketing</li>
              <li><strong>Legítimo interesse:</strong> para melhorar nossos produtos e serviços</li>
              <li><strong>Obrigação legal:</strong> para cumprir exigências legais e regulatórias</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mt-8 mb-4">3. Finalidade do Tratamento</h2>
            <p className="text-white/70 leading-relaxed">
              Utilizamos seus dados para:
            </p>
            <ul className="list-disc list-inside text-white/70 mt-2 space-y-1">
              <li>Fornecer e manter o serviço de automação de WhatsApp</li>
              <li>Processar pagamentos e gerenciar sua assinatura</li>
              <li>Enviar notificações importantes sobre o serviço</li>
              <li>Melhorar a experiência do usuário e desenvolver novos recursos</li>
              <li>Prevenir fraudes e garantir a segurança da plataforma</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mt-8 mb-4">4. Compartilhamento de Dados</h2>
            <p className="text-white/70 leading-relaxed">
              Podemos compartilhar seus dados com:
            </p>
            <ul className="list-disc list-inside text-white/70 mt-2 space-y-1">
              <li><strong>Processadores de pagamento:</strong> Stripe, Asaas para transações financeiras</li>
              <li><strong>Provedores de infraestrutura:</strong> AWS, Vercel para hospedagem</li>
              <li><strong>APIs de IA:</strong> OpenAI para processamento de linguagem natural</li>
              <li><strong>Autoridades:</strong> quando exigido por lei ou ordem judicial</li>
            </ul>
            <p className="text-white/70 leading-relaxed mt-2">
              <strong>Nunca vendemos seus dados pessoais para terceiros.</strong>
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mt-8 mb-4">5. Retenção de Dados</h2>
            <p className="text-white/70 leading-relaxed">
              Mantemos seus dados pelo tempo necessário para:
            </p>
            <ul className="list-disc list-inside text-white/70 mt-2 space-y-1">
              <li>Conta ativa: enquanto você usar o serviço</li>
              <li>Após cancelamento: até 30 dias para recuperação da conta</li>
              <li>Dados financeiros: 5 anos (obrigação fiscal)</li>
              <li>Logs de acesso: 6 meses (Marco Civil da Internet)</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mt-8 mb-4">6. Seus Direitos (LGPD Art. 18)</h2>
            <p className="text-white/70 leading-relaxed">
              Você tem direito a:
            </p>
            <ul className="list-disc list-inside text-white/70 mt-2 space-y-1">
              <li>Confirmação da existência de tratamento de dados</li>
              <li>Acesso aos dados pessoais tratados</li>
              <li>Correção de dados incompletos, inexatos ou desatualizados</li>
              <li>Anonimização, bloqueio ou eliminação de dados desnecessários</li>
              <li>Portabilidade dos dados para outro fornecedor</li>
              <li>Eliminação dos dados tratados com consentimento</li>
              <li>Informação sobre compartilhamento com terceiros</li>
              <li>Revogação do consentimento a qualquer momento</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mt-8 mb-4">7. Segurança dos Dados</h2>
            <p className="text-white/70 leading-relaxed">
              Implementamos medidas técnicas e organizacionais para proteger seus dados:
            </p>
            <ul className="list-disc list-inside text-white/70 mt-2 space-y-1">
              <li>Criptografia em trânsito (TLS 1.3) e em repouso (AES-256)</li>
              <li>Autenticação multi-fator disponível</li>
              <li>Controle de acesso baseado em funções</li>
              <li>Monitoramento contínuo de segurança</li>
              <li>Backups criptografados em múltiplas regiões</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mt-8 mb-4">8. Cookies e Tecnologias Similares</h2>
            <p className="text-white/70 leading-relaxed">
              Utilizamos cookies essenciais para o funcionamento da plataforma. Cookies de 
              analytics são opcionais e só ativados com seu consentimento.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mt-8 mb-4">9. Transferência Internacional</h2>
            <p className="text-white/70 leading-relaxed">
              Alguns de nossos provedores podem estar localizados fora do Brasil. Garantimos 
              que essas transferências seguem as exigências da LGPD, com cláusulas contratuais 
              padrão ou certificações adequadas.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mt-8 mb-4">10. Encarregado de Dados (DPO)</h2>
            <p className="text-white/70 leading-relaxed">
              Para exercer seus direitos ou esclarecer dúvidas sobre o tratamento de dados:
            </p>
            <div 
              className="rounded-lg p-4 mt-4"
              style={{ backgroundColor: colors.background.charcoal }}
            >
              <p className="text-white">📧 Email: dpo@kloel.com</p>
              <p className="text-white/60 text-sm mt-1">Respondemos em até 15 dias úteis</p>
            </div>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mt-8 mb-4">11. Alterações nesta Política</h2>
            <p className="text-white/70 leading-relaxed">
              Podemos atualizar esta política periodicamente. Alterações significativas serão 
              comunicadas por email e/ou notificação na plataforma com 30 dias de antecedência.
            </p>
          </section>

          <section className="mt-12 pt-8 border-t border-white/10">
            <p className="text-white/50 text-sm">
              Se você acredita que seus direitos foram violados, pode apresentar reclamação à 
              Autoridade Nacional de Proteção de Dados (ANPD) em{' '}
              <a 
                href="https://www.gov.br/anpd" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-blue-400 hover:underline"
              >
                www.gov.br/anpd
              </a>
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
