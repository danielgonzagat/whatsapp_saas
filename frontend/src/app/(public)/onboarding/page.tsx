'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { motion, AnimatePresence } from 'framer-motion';
import { apiUrl } from '@/lib/http';
import { 
  Sparkles, 
  Building2, 
  Phone, 
  Package, 
  Target,
  CheckCircle2,
  ArrowRight,
  Loader2
} from 'lucide-react';

const stepIcons = [
  <Building2 key="building" className="w-8 h-8" />,
  <Package key="package" className="w-8 h-8" />,
  <Phone key="phone" className="w-8 h-8" />,
  <Package key="products" className="w-8 h-8" />,
  <Target key="target" className="w-8 h-8" />,
];

export default function OnboardingPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [started, setStarted] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [totalSteps, setTotalSteps] = useState(5);
  const [question, setQuestion] = useState('');
  const [response, setResponse] = useState('');
  const [completed, setCompleted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [businessData, setBusinessData] = useState<Record<string, any>>({});
  
  // Onboarding conversacional depende de um workspace real
  const workspaceId = (session?.user as any)?.workspaceId;
  const accessToken = (session?.user as any)?.accessToken;

  // Se não está autenticado, força login antes do onboarding
  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login?callbackUrl=/onboarding');
    }
  }, [status, router]);

  // Redirecionar se já completou onboarding
  useEffect(() => {
    if (status === 'authenticated' && (session?.user as any)?.onboardingCompleted) {
      router.push('/');
    }
  }, [status, session, router]);

  const startOnboarding = async () => {
    if (!workspaceId) return;
    setLoading(true);
    try {
      const headers: Record<string, string> = {};
      if (accessToken) {
        headers['Authorization'] = `Bearer ${accessToken}`;
      }
      
      const res = await fetch(apiUrl(`/kloel/onboarding/${workspaceId}/start`), {
        method: 'POST',
        headers,
      });
      const data = await res.json();
      setQuestion(data.message);
      setCurrentStep(data.step || 1);
      setTotalSteps(data.total || 5);
      setStarted(true);
    } catch (error) {
      console.error('Erro ao iniciar onboarding:', error);
    }
    setLoading(false);
  };

  const submitResponse = async () => {
    if (!response.trim()) return;
    if (!workspaceId) return;
    
    setLoading(true);
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (accessToken) {
        headers['Authorization'] = `Bearer ${accessToken}`;
      }
      
      const res = await fetch(apiUrl(`/kloel/onboarding/${workspaceId}/chat`), {
        method: 'POST',
        headers,
        body: JSON.stringify({ message: response }),
      });
      const data = await res.json();
      
      setQuestion(data.message);
      setCurrentStep(data.step || currentStep + 1);
      setResponse('');
      
      if (data.completed) {
        setCompleted(true);
        setBusinessData(data.data || {});
      }
    } catch (error) {
      console.error('Erro ao enviar resposta:', error);
    }
    setLoading(false);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submitResponse();
    }
  };

  // Tela inicial
  if (!started) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-violet-950 via-slate-900 to-slate-950 flex items-center justify-center p-4">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-lg w-full text-center"
        >
          <div className="bg-gradient-to-r from-violet-500 to-fuchsia-500 w-24 h-24 rounded-3xl flex items-center justify-center mx-auto mb-8 shadow-2xl shadow-violet-500/30">
            <Sparkles className="w-12 h-12 text-white" />
          </div>
          
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            Bem-vindo ao KLOEL
          </h1>
          <p className="text-gray-600 text-lg mb-8">
            Vou te ajudar a configurar sua Inteligência Comercial Autônoma em menos de 2 minutos.
          </p>

          <div className="bg-white rounded-2xl p-6 mb-8 border border-gray-200">
            <h3 className="text-gray-900 font-medium mb-4">O que vamos configurar:</h3>
            <div className="space-y-3 text-left">
              {[
                'Nome e segmento do negócio',
                'WhatsApp comercial',
                'Produtos e serviços',
                'Objetivo principal',
              ].map((item, i) => (
                <div key={i} className="flex items-center gap-3 text-gray-600">
                  <div className="w-6 h-6 rounded-full bg-violet-500/20 flex items-center justify-center text-violet-400 text-sm font-medium">
                    {i + 1}
                  </div>
                  {item}
                </div>
              ))}
            </div>
          </div>

          <button
            onClick={startOnboarding}
            disabled={loading}
            className="w-full bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white py-4 px-8 rounded-xl font-medium text-lg hover:from-violet-500 hover:to-fuchsia-500 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {loading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <>
                Começar Configuração
                <ArrowRight className="w-5 h-5" />
              </>
            )}
          </button>
        </motion.div>
      </div>
    );
  }

  // Tela de conclusão
  if (completed) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-emerald-950 via-slate-900 to-slate-950 flex items-center justify-center p-4">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="max-w-lg w-full text-center"
        >
          <motion.div 
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.2, type: "spring" }}
            className="bg-gradient-to-r from-emerald-500 to-teal-500 w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-8 shadow-2xl shadow-emerald-500/30"
          >
            <CheckCircle2 className="w-12 h-12 text-white" />
          </motion.div>
          
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            🎉 Configuração Completa!
          </h1>
          <p className="text-gray-600 text-lg mb-8">
            Seu negócio <span className="text-emerald-400 font-semibold">{businessData.businessName}</span> está pronto para usar a KLOEL.
          </p>

          <div className="bg-white rounded-2xl p-6 mb-8 border border-gray-200 text-left">
            <h3 className="text-gray-900 font-medium mb-4">Resumo:</h3>
            <div className="space-y-2 text-gray-600">
              <p>📌 <strong>Segmento:</strong> {businessData.segment}</p>
              <p>📱 <strong>WhatsApp:</strong> {businessData.whatsappNumber}</p>
              <p>📦 <strong>Produtos:</strong> {businessData.products}</p>
              <p>🎯 <strong>Objetivo:</strong> {businessData.mainGoal}</p>
            </div>
          </div>

          <div className="space-y-3">
            <button
              onClick={() => router.push('/whatsapp?from=onboarding')}
              className="block w-full bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white py-4 px-8 rounded-xl font-medium text-lg hover:from-violet-500 hover:to-fuchsia-500 transition-all"
            >
              Conectar WhatsApp (QR Code)
            </button>
            <button
              onClick={() => router.push('/')}
              className="block w-full bg-gray-100 text-gray-600 py-4 px-8 rounded-xl font-medium hover:bg-gray-200 transition-all"
            >
              Ir para o início
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  // Tela de perguntas
  return (
    <div className="min-h-screen bg-gradient-to-br from-violet-950 via-slate-900 to-slate-950 flex items-center justify-center p-4">
      <div className="max-w-lg w-full">
        {/* Progress */}
        <div className="mb-8">
          <div className="flex justify-between items-center mb-2">
            <span className="text-gray-600 text-sm">Passo {currentStep} de {totalSteps}</span>
            <span className="text-violet-400 text-sm font-medium">
              {Math.round((currentStep / totalSteps) * 100)}%
            </span>
          </div>
          <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
            <motion.div 
              className="h-full bg-gradient-to-r from-violet-500 to-fuchsia-500"
              initial={{ width: 0 }}
              animate={{ width: `${(currentStep / totalSteps) * 100}%` }}
              transition={{ duration: 0.5 }}
            />
          </div>
        </div>

        {/* Question Card */}
        <AnimatePresence mode="wait">
          <motion.div
            key={currentStep}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="bg-white rounded-2xl p-8 border border-gray-200 backdrop-blur-sm"
          >
            <div className="flex items-center gap-4 mb-6">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-500/20 to-fuchsia-500/20 flex items-center justify-center text-violet-400">
                {stepIcons[currentStep - 1] || stepIcons[0]}
              </div>
              <div>
                <h2 className="text-gray-900 font-semibold text-lg">KLOEL</h2>
                <p className="text-gray-400 text-sm">Assistente de configuração</p>
              </div>
            </div>

            <p className="text-slate-200 text-lg leading-relaxed mb-6 whitespace-pre-wrap">
              {question}
            </p>

            <div className="space-y-4">
              <textarea
                value={response}
                onChange={(e) => setResponse(e.target.value)}
                onKeyDown={handleKeyPress}
                placeholder="Digite sua resposta..."
                className="w-full bg-gray-100 border border-gray-200 rounded-xl px-4 py-3 text-gray-900 placeholder-gray-400 focus:outline-none focus:border-gray-900 focus:ring-1 focus:ring-gray-900 resize-none"
                rows={3}
                autoFocus
              />

              <button
                onClick={submitResponse}
                disabled={loading || !response.trim()}
                className="w-full bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white py-3 px-6 rounded-xl font-medium hover:from-violet-500 hover:to-fuchsia-500 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <>
                    Continuar
                    <ArrowRight className="w-5 h-5" />
                  </>
                )}
              </button>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
