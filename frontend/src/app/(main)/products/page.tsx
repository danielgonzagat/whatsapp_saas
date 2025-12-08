'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { 
  Package, 
  Plus, 
  Search, 
  Trash2, 
  Edit2, 
  Loader2,
  RefreshCw,
  Brain,
  Upload,
  FileText,
  DollarSign,
  Tag,
  Link as LinkIcon,
  CheckCircle2,
  XCircle,
  BookOpen
} from 'lucide-react';
import { getMemoryList, getMemoryStats, saveProduct, uploadPdf, type MemoryItem, type Product } from '@/lib/api';
import { CenterStage, Section, UniversalComposer, ContextCapsule, StageHeadline, STAGE_HEADLINES } from '@/components/kloel';
import { colors } from '@/lib/design-tokens';

// -------------- DESIGN TOKENS --------------
const COLORS = {
  bg: colors.background.obsidian,
  surface: colors.background.surface1,
  surfaceHover: colors.background.surface2,
  green: colors.brand.green,
  textPrimary: colors.text.primary,
  textSecondary: colors.text.secondary,
  border: colors.divider,
};

export default function ProductsPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const workspaceId = (session?.user as any)?.workspaceId || 'default-ws';
  
  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const [stats, setStats] = useState<{ totalItems: number; products: number; knowledge: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [memoriesData, statsData] = await Promise.all([
        getMemoryList(workspaceId),
        getMemoryStats(workspaceId),
      ]);
      setMemories(memoriesData);
      setStats(statsData);
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filteredMemories = memories.filter(m => {
    const value = typeof m.value === 'object' ? JSON.stringify(m.value) : String(m.value);
    return m.key.toLowerCase().includes(searchTerm.toLowerCase()) ||
           value.toLowerCase().includes(searchTerm.toLowerCase());
  });

  const products = filteredMemories.filter(m => m.type === 'product');
  const knowledge = filteredMemories.filter(m => m.type !== 'product');

  const formatCurrency = (value: number) => 
    value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  // Handle chat message
  const handleChatSend = (message: string) => {
    const encodedMessage = encodeURIComponent(message);
    router.push(`/chat?q=${encodedMessage}`);
  };

  // Dynamic action chips
  const actionChips = [
    { id: 'add', label: 'Adicionar produto', icon: Plus, prompt: 'Quero cadastrar um novo produto' },
    { id: 'upload', label: 'Importar catálogo', icon: Upload, prompt: 'Me ajude a importar meu catálogo de produtos via PDF' },
    { id: 'price', label: 'Atualizar preços', icon: DollarSign, prompt: 'Quero atualizar os preços dos meus produtos' },
    { id: 'knowledge', label: 'Ensinar algo', icon: Brain, prompt: 'Quero ensinar um novo conhecimento para você sobre meu negócio' },
  ];

  return (
    <div 
      className="min-h-full"
      style={{ backgroundColor: COLORS.bg }}
    >
      {/* Hero Section with Chat */}
      <Section spacing="md" className="flex flex-col items-center">
        <CenterStage size="L" className="text-center">
          <div className="mb-6">
            <ContextCapsule 
              page="products"
              items={stats ? [{ label: 'Produtos', value: String(stats.products) }] : []}
            />
          </div>
          <StageHeadline
            headline={STAGE_HEADLINES.products.headline}
            highlight={STAGE_HEADLINES.products.highlight}
            subheadline={stats ? `${stats.products} produtos · ${stats.knowledge} conhecimentos na memória` : 'Carregando memória...'}
            size="l"
          />
          <UniversalComposer
            placeholder="Descreva o produto ou conhecimento que quer ensinar..."
            chips={actionChips}
            onSend={handleChatSend}
            size="compact"
          />
        </CenterStage>
      </Section>

      <div className="px-6 pb-8 max-w-5xl mx-auto space-y-6">
        {/* Actions Row */}
        <div className="flex items-center gap-3 justify-end">
          <button
            onClick={loadData}
            disabled={loading}
            className="p-2 rounded-lg transition-colors"
            style={{ backgroundColor: COLORS.surface, border: `1px solid ${COLORS.border}` }}
          >
            <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} style={{ color: COLORS.textSecondary }} />
          </button>

          <button
            onClick={() => setShowUploadModal(true)}
            className="flex items-center gap-2 px-4 py-2 font-medium rounded-lg transition-colors"
            style={{ backgroundColor: COLORS.surface, border: `1px solid ${COLORS.border}`, color: COLORS.textSecondary }}
          >
            <Upload className="w-5 h-5" />
            Upload PDF
          </button>

          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 px-4 py-2 font-medium rounded-lg transition-colors"
            style={{ backgroundColor: COLORS.green, color: COLORS.bg }}
          >
            <Plus className="w-5 h-5" />
            Adicionar Produto
          </button>
        </div>

        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div 
              className="rounded-xl p-5"
              style={{ backgroundColor: COLORS.surface, border: `1px solid ${COLORS.border}` }}
            >
              <div className="flex items-center gap-3 mb-2">
                <Brain className="w-5 h-5" style={{ color: COLORS.green }} />
                <p className="text-sm" style={{ color: COLORS.textSecondary }}>Total na Memória</p>
              </div>
              <p className="text-2xl font-bold" style={{ color: COLORS.textPrimary }}>{stats.totalItems}</p>
            </div>

            <div 
              className="rounded-xl p-5"
              style={{ backgroundColor: COLORS.surface, border: `1px solid ${COLORS.border}` }}
            >
              <div className="flex items-center gap-3 mb-2">
                <Package className="w-5 h-5" style={{ color: '#3B82F6' }} />
                <p className="text-sm" style={{ color: COLORS.textSecondary }}>Produtos</p>
              </div>
              <p className="text-2xl font-bold" style={{ color: COLORS.textPrimary }}>{stats.products}</p>
            </div>

            <div 
              className="rounded-xl p-5"
              style={{ backgroundColor: COLORS.surface, border: `1px solid ${COLORS.border}` }}
            >
              <div className="flex items-center gap-3 mb-2">
                <BookOpen className="w-5 h-5" style={{ color: '#A855F7' }} />
                <p className="text-sm" style={{ color: COLORS.textSecondary }}>Conhecimentos</p>
              </div>
              <p className="text-2xl font-bold" style={{ color: COLORS.textPrimary }}>{stats.knowledge}</p>
            </div>
          </div>
        )}

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5" style={{ color: COLORS.textSecondary }} />
          <input
            type="text"
            placeholder="Buscar produtos e conhecimentos..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full rounded-xl pl-12 pr-4 py-3 focus:outline-none"
            style={{ 
              backgroundColor: COLORS.surface, 
              border: `1px solid ${COLORS.border}`,
              color: COLORS.textPrimary,
            }}
          />
        </div>

        {/* Products Section */}
        <div 
          className="rounded-xl"
          style={{ backgroundColor: COLORS.surface, border: `1px solid ${COLORS.border}` }}
        >
          <div 
            className="px-6 py-4 border-b flex items-center justify-between"
            style={{ borderColor: COLORS.border }}
          >
            <h3 className="font-semibold flex items-center gap-2" style={{ color: COLORS.textPrimary }}>
              <Package className="w-5 h-5" style={{ color: COLORS.green }} />
              Produtos ({products.length})
            </h3>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin" style={{ color: COLORS.green }} />
            </div>
          ) : products.length === 0 ? (
            <div className="text-center py-12">
              <Package className="w-16 h-16 mx-auto mb-4" style={{ color: COLORS.textSecondary }} />
              <p className="text-lg" style={{ color: COLORS.textSecondary }}>Nenhum produto cadastrado</p>
              <p className="text-sm mt-2" style={{ color: COLORS.textSecondary }}>
                Adicione produtos para a KLOEL poder vendê-los
              </p>
              <button
                onClick={() => setShowAddModal(true)}
                className="mt-4 px-4 py-2 font-medium rounded-lg transition-colors"
                style={{ backgroundColor: COLORS.green, color: COLORS.bg }}
              >
                Adicionar Primeiro Produto
              </button>
            </div>
          ) : (
            <div className="divide-y" style={{ borderColor: COLORS.border }}>
              {products.map((product) => {
                const data = product.value as Product;
                return (
                  <div 
                    key={product.id} 
                    className="px-6 py-4 flex items-center justify-between transition-colors hover:bg-white/5"
                  >
                    <div className="flex items-center gap-4">
                      <div 
                        className="w-12 h-12 rounded-xl flex items-center justify-center"
                        style={{ backgroundColor: `${COLORS.green}20` }}
                      >
                        <Package className="w-6 h-6" style={{ color: COLORS.green }} />
                      </div>
                      <div>
                        <p className="font-medium" style={{ color: COLORS.textPrimary }}>{data.name}</p>
                        <p className="text-sm line-clamp-1" style={{ color: COLORS.textSecondary }}>{data.description || 'Sem descrição'}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-6">
                      <div className="text-right">
                        <p className="font-bold text-lg" style={{ color: COLORS.green }}>{formatCurrency(data.price)}</p>
                        {data.paymentLink && (
                          <p className="text-xs flex items-center gap-1 justify-end" style={{ color: COLORS.textSecondary }}>
                            <LinkIcon className="w-3 h-3" />
                            Link configurado
                          </p>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        <button 
                          className="p-2 rounded-lg transition-colors hover:bg-white/5"
                          style={{ color: COLORS.textSecondary }}
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button 
                          className="p-2 rounded-lg transition-colors hover:bg-red-500/20"
                          style={{ color: COLORS.textSecondary }}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Knowledge Section */}
        {knowledge.length > 0 && (
          <div 
            className="rounded-xl"
            style={{ backgroundColor: COLORS.surface, border: `1px solid ${COLORS.border}` }}
          >
            <div 
              className="px-6 py-4 border-b flex items-center justify-between"
              style={{ borderColor: COLORS.border }}
            >
              <h3 className="font-semibold flex items-center gap-2" style={{ color: COLORS.textPrimary }}>
                <BookOpen className="w-5 h-5" style={{ color: '#A855F7' }} />
                Conhecimentos ({knowledge.length})
              </h3>
            </div>

            <div className="divide-y" style={{ borderColor: COLORS.border }}>
              {knowledge.map((item) => (
                <div 
                  key={item.id} 
                  className="px-6 py-4 flex items-center justify-between transition-colors hover:bg-white/5"
                >
                  <div className="flex items-center gap-4">
                    <div 
                      className="w-12 h-12 rounded-xl flex items-center justify-center"
                      style={{ backgroundColor: 'rgba(168,85,247,0.2)' }}
                    >
                      <FileText className="w-6 h-6" style={{ color: '#A855F7' }} />
                    </div>
                    <div>
                      <p className="font-medium" style={{ color: COLORS.textPrimary }}>{item.key}</p>
                      <p className="text-sm line-clamp-1" style={{ color: COLORS.textSecondary }}>
                        {typeof item.value === 'string' ? item.value : JSON.stringify(item.value).slice(0, 100)}...
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span 
                      className="text-xs px-2 py-1 rounded"
                      style={{ backgroundColor: COLORS.surfaceHover, color: COLORS.textSecondary }}
                    >
                      {item.type}
                    </span>
                    <button 
                      className="p-2 rounded-lg transition-colors hover:bg-red-500/20"
                      style={{ color: COLORS.textSecondary }}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Add Product Modal */}
      {showAddModal && (
        <AddProductModal 
          onClose={() => setShowAddModal(false)} 
          onSuccess={loadData}
          workspaceId={workspaceId}
        />
      )}

      {/* Upload PDF Modal */}
      {showUploadModal && (
        <UploadPdfModal 
          onClose={() => setShowUploadModal(false)} 
          onSuccess={loadData}
          workspaceId={workspaceId}
        />
      )}
    </div>
  );
}

function AddProductModal({ onClose, onSuccess, workspaceId }: { onClose: () => void; onSuccess: () => void; workspaceId: string }) {
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [form, setForm] = useState({
    name: '',
    price: '',
    description: '',
    paymentLink: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      await saveProduct(workspaceId, {
        name: form.name,
        price: parseFloat(form.price),
        description: form.description || undefined,
        paymentLink: form.paymentLink || undefined,
      });
      setSuccess(true);
      onSuccess();
      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (error) {
      console.error('Failed to save product:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-[#1A1A24] rounded-2xl p-6 w-full max-w-md border border-slate-700/50" onClick={e => e.stopPropagation()}>
        <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
          <Package className="w-6 h-6 text-[#00FFA3]" />
          Adicionar Produto
        </h3>

        {success ? (
          <div className="py-8 text-center">
            <CheckCircle2 className="w-16 h-16 text-emerald-400 mx-auto mb-4" />
            <p className="text-emerald-400 font-medium text-lg">Produto adicionado com sucesso!</p>
            <p className="text-slate-500 text-sm mt-2">A KLOEL já pode vender esse produto</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-slate-400 text-sm mb-1 block flex items-center gap-2">
                <Tag className="w-4 h-4" />
                Nome do Produto
              </label>
              <input
                type="text"
                required
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                className="w-full bg-slate-800/50 border border-slate-700/50 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-[#00FFA3]"
                placeholder="Ex: Curso de IA para Vendas"
              />
            </div>

            <div>
              <label className="text-slate-400 text-sm mb-1 block flex items-center gap-2">
                <DollarSign className="w-4 h-4" />
                Preço (R$)
              </label>
              <input
                type="number"
                required
                min="0"
                step="0.01"
                value={form.price}
                onChange={e => setForm(f => ({ ...f, price: e.target.value }))}
                className="w-full bg-slate-800/50 border border-slate-700/50 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-[#00FFA3]"
                placeholder="1200.00"
              />
            </div>

            <div>
              <label className="text-slate-400 text-sm mb-1 block">Descrição (opcional)</label>
              <textarea
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                className="w-full bg-slate-800/50 border border-slate-700/50 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-[#00FFA3] resize-none"
                rows={3}
                placeholder="Descreva seu produto para a KLOEL poder vendê-lo melhor..."
              />
            </div>

            <div>
              <label className="text-slate-400 text-sm mb-1 block flex items-center gap-2">
                <LinkIcon className="w-4 h-4" />
                Link de Pagamento (opcional)
              </label>
              <input
                type="url"
                value={form.paymentLink}
                onChange={e => setForm(f => ({ ...f, paymentLink: e.target.value }))}
                className="w-full bg-slate-800/50 border border-slate-700/50 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-[#00FFA3]"
                placeholder="https://hotmart.com/..."
              />
              <p className="text-slate-600 text-xs mt-1">
                Hotmart, Kiwify, PagBank, etc.
              </p>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-[#00FFA3] text-black font-medium rounded-lg hover:bg-[#00FFA3]/90 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading && <Loader2 className="w-5 h-5 animate-spin" />}
              Salvar Produto
            </button>

            <button
              type="button"
              onClick={onClose}
              className="w-full py-3 bg-slate-700 text-white font-medium rounded-lg hover:bg-slate-600"
            >
              Cancelar
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

function UploadPdfModal({ onClose, onSuccess, workspaceId }: { onClose: () => void; onSuccess: () => void; workspaceId: string }) {
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile && selectedFile.type === 'application/pdf') {
      setFile(selectedFile);
      setError(null);
    } else {
      setError('Por favor, selecione um arquivo PDF válido.');
    }
  };

  const handleUpload = async () => {
    if (!file) return;

    setLoading(true);
    setError(null);

    try {
      await uploadPdf(workspaceId, file);
      setSuccess(true);
      onSuccess();
      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (err) {
      console.error('Failed to upload PDF:', err);
      setError('Falha ao processar o PDF. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-[#1A1A24] rounded-2xl p-6 w-full max-w-md border border-slate-700/50" onClick={e => e.stopPropagation()}>
        <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
          <FileText className="w-6 h-6 text-violet-400" />
          Upload de PDF
        </h3>

        {success ? (
          <div className="py-8 text-center">
            <CheckCircle2 className="w-16 h-16 text-emerald-400 mx-auto mb-4" />
            <p className="text-emerald-400 font-medium text-lg">PDF processado com sucesso!</p>
            <p className="text-slate-500 text-sm mt-2">O conhecimento foi adicionado à memória da KLOEL</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div 
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-slate-700 rounded-xl p-8 text-center cursor-pointer hover:border-violet-500/50 transition-colors"
            >
              {file ? (
                <div>
                  <FileText className="w-12 h-12 text-violet-400 mx-auto mb-3" />
                  <p className="text-white font-medium">{file.name}</p>
                  <p className="text-slate-500 text-sm">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                </div>
              ) : (
                <div>
                  <Upload className="w-12 h-12 text-slate-600 mx-auto mb-3" />
                  <p className="text-slate-400">Clique para selecionar um PDF</p>
                  <p className="text-slate-600 text-sm mt-1">ou arraste e solte aqui</p>
                </div>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf"
                className="hidden"
                onChange={handleFileChange}
              />
            </div>

            {error && (
              <div className="flex items-center gap-2 text-red-400 text-sm">
                <XCircle className="w-4 h-4" />
                {error}
              </div>
            )}

            <p className="text-slate-500 text-sm">
              A KLOEL irá extrair informações do PDF e adicionar à sua memória.
              Ideal para catálogos de produtos, FAQs, manuais, etc.
            </p>

            <button
              onClick={handleUpload}
              disabled={loading || !file}
              className="w-full py-3 bg-violet-500 text-white font-medium rounded-lg hover:bg-violet-400 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading && <Loader2 className="w-5 h-5 animate-spin" />}
              Processar PDF
            </button>

            <button
              onClick={onClose}
              className="w-full py-3 bg-slate-700 text-white font-medium rounded-lg hover:bg-slate-600"
            >
              Cancelar
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
