'use client';

import { useEffect, useState, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { 
  Bot,
  MessageSquare,
  CalendarClock,
  FileText,
  AlertCircle,
  Upload,
  Trash2,
  Plus,
  Clock,
  Search,
  Loader2,
  CheckCircle,
  X,
  Sparkles,
  Send,
  Mic,
  FileImage,
  CreditCard,
  BookOpen,
  Workflow,
  ShieldAlert,
} from 'lucide-react';
import {
  listAITools,
  scheduleFollowUp,
  listScheduledFollowUps,
  cancelFollowUp,
  uploadDocument,
  listDocuments,
  saveObjectionScript,
  listObjectionScripts,
  type AIToolInfo,
  type DocumentUpload,
  type FollowUpConfig,
} from '@/lib/api';

export default function ToolsPage() {
  const { data: session } = useSession();
  const token = (session as any)?.accessToken;
  const workspaceId = (session as any)?.user?.workspaceId || '';

  const [activeTab, setActiveTab] = useState<'overview' | 'followups' | 'documents' | 'objections'>('overview');
  const [tools, setTools] = useState<AIToolInfo[]>([]);
  const [followUps, setFollowUps] = useState<any[]>([]);
  const [documents, setDocuments] = useState<DocumentUpload[]>([]);
  const [objections, setObjections] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Follow-up form
  const [followUpForm, setFollowUpForm] = useState({
    phone: '',
    message: '',
    scheduledAt: '',
  });

  // Objection form
  const [objectionForm, setObjectionForm] = useState({
    objection: '',
    response: '',
  });

  // Document upload
  const [uploadFile, setUploadFile] = useState<File | null>(null);

  const fetchData = useCallback(async () => {
    if (!token || !workspaceId) return;
    setLoading(true);
    setError(null);

    try {
      const [toolsData, followUpsData, docsData, objectionsData] = await Promise.all([
        listAITools(token),
        listScheduledFollowUps(workspaceId, token),
        listDocuments(workspaceId, token),
        listObjectionScripts(workspaceId, token),
      ]);

      setTools(toolsData);
      setFollowUps(followUpsData);
      setDocuments(docsData);
      setObjections(objectionsData);
    } catch (err: any) {
      console.error('Erro ao carregar dados:', err);
      setError(err.message || 'Erro ao carregar ferramentas');
    } finally {
      setLoading(false);
    }
  }, [token, workspaceId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleScheduleFollowUp = async () => {
    if (!followUpForm.phone || !followUpForm.message || !followUpForm.scheduledAt) {
      setError('Preencha todos os campos');
      return;
    }

    setActionLoading('followup');
    setError(null);

    try {
      await scheduleFollowUp(workspaceId, {
        phone: followUpForm.phone,
        message: followUpForm.message,
        scheduledAt: new Date(followUpForm.scheduledAt).toISOString(),
      }, token);

      setSuccess('Follow-up agendado com sucesso!');
      setFollowUpForm({ phone: '', message: '', scheduledAt: '' });
      fetchData();
    } catch (err: any) {
      setError(err.message || 'Erro ao agendar follow-up');
    } finally {
      setActionLoading(null);
    }
  };

  const handleCancelFollowUp = async (id: string) => {
    setActionLoading(`cancel-${id}`);
    try {
      await cancelFollowUp(workspaceId, id, token);
      setSuccess('Follow-up cancelado');
      fetchData();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setActionLoading(null);
    }
  };

  const handleUploadDocument = async () => {
    if (!uploadFile) {
      setError('Selecione um arquivo');
      return;
    }

    setActionLoading('upload');
    setError(null);

    try {
      await uploadDocument(workspaceId, uploadFile, 'catalog', token);
      setSuccess('Documento enviado com sucesso!');
      setUploadFile(null);
      fetchData();
    } catch (err: any) {
      setError(err.message || 'Erro ao fazer upload');
    } finally {
      setActionLoading(null);
    }
  };

  const handleSaveObjection = async () => {
    if (!objectionForm.objection || !objectionForm.response) {
      setError('Preencha a objeção e a resposta');
      return;
    }

    setActionLoading('objection');
    setError(null);

    try {
      await saveObjectionScript(workspaceId, objectionForm.objection, objectionForm.response, token);
      setSuccess('Script de objeção salvo!');
      setObjectionForm({ objection: '', response: '' });
      fetchData();
    } catch (err: any) {
      setError(err.message || 'Erro ao salvar');
    } finally {
      setActionLoading(null);
    }
  };

  const categoryIcons: Record<string, any> = {
    messaging: MessageSquare,
    media: Mic,
    scheduling: CalendarClock,
    crm: BookOpen,
    sales: CreditCard,
    payments: CreditCard,
    catalog: FileImage,
    knowledge: Search,
    automation: Workflow,
  };

  const getCategoryIcon = (category: string) => {
    const Icon = categoryIcons[category] || Bot;
    return <Icon className="w-4 h-4" />;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-purple-500" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Sparkles className="w-7 h-7 text-purple-400" />
          Ferramentas da IA
        </h1>
        <p className="text-gray-400 mt-1">
          Configure e gerencie as ferramentas que a IA pode usar para automatizar vendas
        </p>
      </div>

      {/* Alerts */}
      {error && (
        <div className="mb-4 p-4 bg-red-500/10 border border-red-500/30 rounded-lg flex items-center gap-2 text-red-400">
          <AlertCircle className="w-5 h-5" />
          {error}
          <button onClick={() => setError(null)} className="ml-auto">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {success && (
        <div className="mb-4 p-4 bg-green-500/10 border border-green-500/30 rounded-lg flex items-center gap-2 text-green-400">
          <CheckCircle className="w-5 h-5" />
          {success}
          <button onClick={() => setSuccess(null)} className="ml-auto">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 mb-6 border-b border-white/10 pb-4">
        {[
          { id: 'overview', label: 'Visão Geral', icon: Bot },
          { id: 'followups', label: 'Follow-ups', icon: CalendarClock },
          { id: 'documents', label: 'Documentos', icon: FileText },
          { id: 'objections', label: 'Objeções', icon: ShieldAlert },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
              activeTab === tab.id
                ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30'
                : 'text-gray-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <div>
          <h2 className="text-lg font-semibold text-white mb-4">
            Ferramentas Disponíveis ({tools.length})
          </h2>
          <p className="text-gray-400 text-sm mb-6">
            Estas são as ações que a IA pode executar automaticamente durante conversas com leads.
          </p>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {tools.map((tool) => (
              <div
                key={tool.name}
                className="bg-white/5 border border-white/10 rounded-xl p-4 hover:border-purple-500/30 transition-colors"
              >
                <div className="flex items-center gap-3 mb-2">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                    tool.enabled ? 'bg-purple-500/20 text-purple-400' : 'bg-gray-500/20 text-gray-500'
                  }`}>
                    {getCategoryIcon(tool.category)}
                  </div>
                  <div>
                    <h3 className="font-medium text-white text-sm">{tool.name}</h3>
                    <span className="text-xs text-gray-500 capitalize">{tool.category}</span>
                  </div>
                  {tool.enabled && (
                    <CheckCircle className="w-4 h-4 text-green-400 ml-auto" />
                  )}
                </div>
                <p className="text-gray-400 text-sm">{tool.description}</p>
                {tool.usageCount !== undefined && (
                  <p className="text-xs text-gray-500 mt-2">
                    {tool.usageCount} uso(s)
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'followups' && (
        <div className="grid md:grid-cols-2 gap-6">
          {/* Form */}
          <div className="bg-white/5 border border-white/10 rounded-xl p-6">
            <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <Plus className="w-5 h-5" />
              Agendar Follow-up
            </h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Telefone</label>
                <input
                  type="tel"
                  value={followUpForm.phone}
                  onChange={(e) => setFollowUpForm({ ...followUpForm, phone: e.target.value })}
                  placeholder="5511999999999"
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>
              
              <div>
                <label className="block text-sm text-gray-400 mb-1">Mensagem</label>
                <textarea
                  value={followUpForm.message}
                  onChange={(e) => setFollowUpForm({ ...followUpForm, message: e.target.value })}
                  placeholder="Olá! Vi que você se interessou por..."
                  rows={3}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>
              
              <div>
                <label className="block text-sm text-gray-400 mb-1">Data e Hora</label>
                <input
                  type="datetime-local"
                  value={followUpForm.scheduledAt}
                  onChange={(e) => setFollowUpForm({ ...followUpForm, scheduledAt: e.target.value })}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>
              
              <button
                onClick={handleScheduleFollowUp}
                disabled={actionLoading === 'followup'}
                className="w-full bg-purple-500 hover:bg-purple-600 text-white py-2 rounded-lg font-medium flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {actionLoading === 'followup' ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <CalendarClock className="w-4 h-4" />
                    Agendar
                  </>
                )}
              </button>
            </div>
          </div>

          {/* List */}
          <div className="bg-white/5 border border-white/10 rounded-xl p-6">
            <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <Clock className="w-5 h-5" />
              Follow-ups Agendados ({followUps.length})
            </h2>
            
            {followUps.length === 0 ? (
              <p className="text-gray-500 text-center py-8">
                Nenhum follow-up agendado
              </p>
            ) : (
              <div className="space-y-3 max-h-[400px] overflow-y-auto">
                {followUps.map((fu) => (
                  <div
                    key={fu.id}
                    className="bg-white/5 border border-white/10 rounded-lg p-3 flex items-start gap-3"
                  >
                    <div className="flex-1">
                      <p className="text-white text-sm font-medium">{fu.phone}</p>
                      <p className="text-gray-400 text-sm truncate">{fu.message}</p>
                      <p className="text-xs text-gray-500 mt-1">
                        {new Date(fu.scheduledAt).toLocaleString('pt-BR')}
                      </p>
                    </div>
                    <button
                      onClick={() => handleCancelFollowUp(fu.id)}
                      disabled={actionLoading === `cancel-${fu.id}`}
                      className="text-red-400 hover:text-red-300"
                    >
                      {actionLoading === `cancel-${fu.id}` ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Trash2 className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'documents' && (
        <div className="grid md:grid-cols-2 gap-6">
          {/* Upload */}
          <div className="bg-white/5 border border-white/10 rounded-xl p-6">
            <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <Upload className="w-5 h-5" />
              Upload de Documento
            </h2>
            <p className="text-gray-400 text-sm mb-4">
              Envie catálogos, contratos e outros documentos que a IA pode enviar aos leads.
            </p>
            
            <div className="space-y-4">
              <div className="border-2 border-dashed border-white/20 rounded-lg p-6 text-center">
                <input
                  type="file"
                  accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
                  onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                  className="hidden"
                  id="file-upload"
                />
                <label
                  htmlFor="file-upload"
                  className="cursor-pointer"
                >
                  <FileText className="w-10 h-10 text-gray-500 mx-auto mb-2" />
                  <p className="text-gray-400">
                    {uploadFile ? uploadFile.name : 'Clique para selecionar arquivo'}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    PDF, DOC, PNG, JPG (máx 10MB)
                  </p>
                </label>
              </div>
              
              <button
                onClick={handleUploadDocument}
                disabled={!uploadFile || actionLoading === 'upload'}
                className="w-full bg-purple-500 hover:bg-purple-600 text-white py-2 rounded-lg font-medium flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {actionLoading === 'upload' ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <Upload className="w-4 h-4" />
                    Enviar
                  </>
                )}
              </button>
            </div>
          </div>

          {/* List */}
          <div className="bg-white/5 border border-white/10 rounded-xl p-6">
            <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <FileText className="w-5 h-5" />
              Documentos ({documents.length})
            </h2>
            
            {documents.length === 0 ? (
              <p className="text-gray-500 text-center py-8">
                Nenhum documento enviado
              </p>
            ) : (
              <div className="space-y-3 max-h-[400px] overflow-y-auto">
                {documents.map((doc) => (
                  <div
                    key={doc.id}
                    className="bg-white/5 border border-white/10 rounded-lg p-3 flex items-center gap-3"
                  >
                    <FileText className="w-8 h-8 text-purple-400" />
                    <div className="flex-1">
                      <p className="text-white text-sm font-medium">{doc.name}</p>
                      <p className="text-xs text-gray-500">
                        {(doc.size / 1024).toFixed(1)} KB • {new Date(doc.createdAt).toLocaleDateString('pt-BR')}
                      </p>
                    </div>
                    <a
                      href={doc.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-purple-400 hover:text-purple-300 text-sm"
                    >
                      Ver
                    </a>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'objections' && (
        <div className="grid md:grid-cols-2 gap-6">
          {/* Form */}
          <div className="bg-white/5 border border-white/10 rounded-xl p-6">
            <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <Plus className="w-5 h-5" />
              Novo Script de Objeção
            </h2>
            <p className="text-gray-400 text-sm mb-4">
              Ensine a IA como responder objeções comuns dos clientes.
            </p>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Objeção do Cliente</label>
                <input
                  type="text"
                  value={objectionForm.objection}
                  onChange={(e) => setObjectionForm({ ...objectionForm, objection: e.target.value })}
                  placeholder="Ex: Está muito caro"
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>
              
              <div>
                <label className="block text-sm text-gray-400 mb-1">Resposta da IA</label>
                <textarea
                  value={objectionForm.response}
                  onChange={(e) => setObjectionForm({ ...objectionForm, response: e.target.value })}
                  placeholder="Ex: Entendo sua preocupação! O valor reflete a qualidade..."
                  rows={4}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>
              
              <button
                onClick={handleSaveObjection}
                disabled={actionLoading === 'objection'}
                className="w-full bg-purple-500 hover:bg-purple-600 text-white py-2 rounded-lg font-medium flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {actionLoading === 'objection' ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <CheckCircle className="w-4 h-4" />
                    Salvar Script
                  </>
                )}
              </button>
            </div>
          </div>

          {/* List */}
          <div className="bg-white/5 border border-white/10 rounded-xl p-6">
            <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <ShieldAlert className="w-5 h-5" />
              Scripts Salvos ({objections.length})
            </h2>
            
            {objections.length === 0 ? (
              <p className="text-gray-500 text-center py-8">
                Nenhum script de objeção configurado
              </p>
            ) : (
              <div className="space-y-3 max-h-[400px] overflow-y-auto">
                {objections.map((obj) => (
                  <div
                    key={obj.id}
                    className="bg-white/5 border border-white/10 rounded-lg p-3"
                  >
                    <p className="text-red-400 text-sm font-medium mb-1">
                      ❌ "{obj.objection}"
                    </p>
                    <p className="text-green-400 text-sm">
                      ✅ {obj.response}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
