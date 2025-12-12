'use client';

import { colors } from '@/lib/design-tokens';
import { ArrowLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function TermsPage() {
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

        <h1 className="text-3xl font-bold text-white mb-8">Termos de Uso</h1>
        
        <div className="prose prose-invert max-w-none space-y-6">
          <p className="text-white/80 leading-relaxed">
            Última atualização: {new Date().toLocaleDateString('pt-BR')}
          </p>

          <section>
            <h2 className="text-xl font-semibold text-white mt-8 mb-4">1. Aceitação dos Termos</h2>
            <p className="text-white/70 leading-relaxed">
              Ao acessar e usar a plataforma KLOEL (&quot;Serviço&quot;), você concorda em ficar vinculado a estes 
              Termos de Uso. Se você não concordar com qualquer parte destes termos, não poderá acessar o Serviço.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mt-8 mb-4">2. Descrição do Serviço</h2>
            <p className="text-white/70 leading-relaxed">
              O KLOEL é uma plataforma SaaS de automação de WhatsApp que oferece:
            </p>
            <ul className="list-disc list-inside text-white/70 mt-2 space-y-1">
              <li>Automação de conversas via inteligência artificial</li>
              <li>Gestão de relacionamento com clientes (CRM)</li>
              <li>Criação de fluxos de atendimento</li>
              <li>Campanhas de marketing</li>
              <li>Integração com pagamentos</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mt-8 mb-4">3. Uso Adequado</h2>
            <p className="text-white/70 leading-relaxed">
              Você concorda em não usar o Serviço para:
            </p>
            <ul className="list-disc list-inside text-white/70 mt-2 space-y-1">
              <li>Enviar spam ou mensagens não solicitadas</li>
              <li>Violar leis de proteção de dados (LGPD, GDPR)</li>
              <li>Assediar, ameaçar ou prejudicar outros usuários</li>
              <li>Distribuir malware ou conteúdo ilegal</li>
              <li>Violar os termos de uso do WhatsApp</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mt-8 mb-4">4. Conformidade com WhatsApp</h2>
            <p className="text-white/70 leading-relaxed">
              O uso do Serviço está sujeito às políticas do WhatsApp. Você é responsável por garantir 
              que seu uso esteja em conformidade com os termos do WhatsApp Business API e política de comércio.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mt-8 mb-4">5. Conta e Segurança</h2>
            <p className="text-white/70 leading-relaxed">
              Você é responsável por manter a confidencialidade de sua conta e senha. Notifique-nos 
              imediatamente sobre qualquer uso não autorizado de sua conta.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mt-8 mb-4">6. Pagamentos e Assinaturas</h2>
            <p className="text-white/70 leading-relaxed">
              Os planos são cobrados mensalmente ou anualmente conforme selecionado. Cancelamentos 
              podem ser feitos a qualquer momento, com acesso mantido até o final do período pago.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mt-8 mb-4">7. Propriedade Intelectual</h2>
            <p className="text-white/70 leading-relaxed">
              O Serviço e seu conteúdo original são de propriedade exclusiva do KLOEL. Os dados 
              que você insere na plataforma permanecem seus.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mt-8 mb-4">8. Limitação de Responsabilidade</h2>
            <p className="text-white/70 leading-relaxed">
              O KLOEL não será responsável por danos indiretos, incidentais ou consequenciais 
              decorrentes do uso ou incapacidade de uso do Serviço.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mt-8 mb-4">9. Modificações</h2>
            <p className="text-white/70 leading-relaxed">
              Reservamos o direito de modificar estes termos a qualquer momento. Alterações 
              significativas serão notificadas por email com 30 dias de antecedência.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mt-8 mb-4">10. Lei Aplicável</h2>
            <p className="text-white/70 leading-relaxed">
              Estes termos são regidos pelas leis do Brasil. Qualquer disputa será resolvida 
              nos tribunais da cidade de São Paulo, SP.
            </p>
          </section>

          <section className="mt-12 pt-8 border-t border-white/10">
            <p className="text-white/50 text-sm">
              Para dúvidas sobre estes Termos de Uso, entre em contato pelo email: suporte@kloel.com
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
