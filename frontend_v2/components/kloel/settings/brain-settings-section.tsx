"use client"

import type React from "react"

import { useState } from "react"
import {
  Building2,
  Package,
  Users,
  MessageSquare,
  ShieldCheck,
  HelpCircle,
  FileText,
  Plus,
  Trash2,
  ChevronDown,
  ChevronUp,
  Upload,
  Sparkles,
  X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ProductCheckoutPlans, type CheckoutPlan } from "./product-checkout-plans"
import { KloelStatusCard } from "./kloel-status-card"
import { MissingStepsCard } from "./missing-steps-card"
import { OpeningMessageCard } from "./opening-message-card"
import { EmergencyModeCard } from "./emergency-mode-card"

interface AccordionSectionProps {
  icon: React.ElementType
  title: string
  children: React.ReactNode
  defaultOpen?: boolean
}

function AccordionSection({ icon: Icon, title, children, defaultOpen = false }: AccordionSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen)

  return (
    <div className="rounded-2xl border border-gray-100 bg-white shadow-sm">
      <button onClick={() => setIsOpen(!isOpen)} className="flex w-full items-center justify-between p-5">
        <div className="flex items-center gap-3">
          <Icon className="h-5 w-5 text-gray-600" />
          <span className="font-semibold text-gray-900">{title}</span>
        </div>
        {isOpen ? <ChevronUp className="h-5 w-5 text-gray-400" /> : <ChevronDown className="h-5 w-5 text-gray-400" />}
      </button>
      {isOpen && <div className="border-t border-gray-100 p-5">{children}</div>}
    </div>
  )
}

interface Product {
  id: string
  name: string
  type: string
  price: string
  files: number
  checkoutPlans: CheckoutPlan[]
}

export function BrainSettingsSection() {
  const [company, setCompany] = useState({
    name: "",
    sector: "",
    description: "",
    mission: "",
    differentials: [""],
  })

  const [products, setProducts] = useState<Product[]>([
    {
      id: "1",
      name: "Curso de Marketing Digital",
      type: "Infoproduto",
      price: "R$ 497",
      files: 2,
      checkoutPlans: [
        {
          id: "p1",
          name: "Plano a Vista",
          type: "single",
          price: "R$ 497",
          provider: "hotmart",
          checkoutLink: "https://hotmart.com/checkout/123",
          isDefault: true,
        },
      ],
    },
  ])

  const [showAddProduct, setShowAddProduct] = useState(false)
  const [editingProductId, setEditingProductId] = useState<string | null>(null)
  const [newProduct, setNewProduct] = useState({
    name: "",
    description: "",
    price: "",
    benefits: "",
    persona: "",
  })

  const [personas, setPersonas] = useState(["Empreendedor iniciante", "Dono de e-commerce", "Freelancer"])
  const [newPersona, setNewPersona] = useState("")

  const [voiceTone, setVoiceTone] = useState({
    style: "",
    customInstructions: "",
    useProfessional: true,
    useFriendly: false,
    usePersuasive: false,
  })

  const [rules, setRules] = useState([
    "Sempre cumprimentar o cliente pelo nome",
    "Nunca prometer prazos que nao podemos cumprir",
    "Oferecer desconto apenas apos 3 interacoes",
  ])
  const [newRule, setNewRule] = useState("")

  const [faqs, setFaqs] = useState([
    { id: "1", question: "Qual o prazo de entrega?", answer: "Entregamos em ate 7 dias uteis." },
  ])
  const [showAddFaq, setShowAddFaq] = useState(false)
  const [newFaq, setNewFaq] = useState({ question: "", answer: "" })

  const [files, setFiles] = useState([
    { id: "1", name: "catalogo-produtos.pdf", type: "PDF", size: "2.4 MB", date: "12/01/2025" },
    { id: "2", name: "tabela-precos.xlsx", type: "Excel", size: "156 KB", date: "10/01/2025" },
  ])
  const [fileFilter, setFileFilter] = useState("all")

  const handleAddProduct = () => {
    if (newProduct.name && newProduct.price) {
      setProducts([
        ...products,
        {
          id: Date.now().toString(),
          name: newProduct.name,
          type: "Produto",
          price: newProduct.price,
          files: 0,
          checkoutPlans: [],
        },
      ])
      setNewProduct({ name: "", description: "", price: "", benefits: "", persona: "" })
      setShowAddProduct(false)
    }
  }

  const handleAddPersona = () => {
    if (newPersona && !personas.includes(newPersona)) {
      setPersonas([...personas, newPersona])
      setNewPersona("")
    }
  }

  const handleAddRule = () => {
    if (newRule) {
      setRules([...rules, newRule])
      setNewRule("")
    }
  }

  const handleAddFaq = () => {
    if (newFaq.question && newFaq.answer) {
      setFaqs([...faqs, { id: Date.now().toString(), ...newFaq }])
      setNewFaq({ question: "", answer: "" })
      setShowAddFaq(false)
    }
  }

  const handleUpdateCheckoutPlans = (productId: string, plans: CheckoutPlan[]) => {
    setProducts(products.map((p) => (p.id === productId ? { ...p, checkoutPlans: plans } : p)))
  }

  // Calculate status for KloelStatusCard
  const hasProducts = products.length > 0
  const hasFiles = files.length > 0
  const hasCheckout = products.some((p) => p.checkoutPlans.length > 0)
  const hasVoiceTone = voiceTone.style !== ""
  const hasFaq = faqs.length > 0
  const hasRules = rules.length > 0

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-gray-900">Configurar Kloel</h3>
        <p className="mt-1 text-sm text-gray-500">Ensine o Kloel sobre seu negocio para um atendimento perfeito.</p>
      </div>

      <KloelStatusCard
        filesProcessed={files.length}
        productsConfigured={products.length}
        rulesLearned={rules.length}
        faqFilled={faqs.length}
        voiceToneDefined={hasVoiceTone}
        checkoutConfigured={hasCheckout}
      />

      <MissingStepsCard
        hasProducts={hasProducts}
        hasFiles={hasFiles}
        hasCheckout={hasCheckout}
        hasVoiceTone={hasVoiceTone}
        hasFaq={hasFaq}
        hasOpeningMessage={false}
        hasWhatsApp={false}
      />

      <OpeningMessageCard />

      {/* Company Identity */}
      <AccordionSection icon={Building2} title="Identidade da empresa" defaultOpen>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label className="text-sm text-gray-700">Nome da empresa</Label>
            <Input
              placeholder="Ex: Minha Loja Digital"
              value={company.name}
              onChange={(e) => setCompany({ ...company, name: e.target.value })}
              className="rounded-xl border-gray-200"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-sm text-gray-700">Setor de atuacao</Label>
            <Select value={company.sector} onValueChange={(v) => setCompany({ ...company, sector: v })}>
              <SelectTrigger className="rounded-xl border-gray-200">
                <SelectValue placeholder="Selecione o setor" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ecommerce">E-commerce</SelectItem>
                <SelectItem value="infoproduct">Infoprodutos</SelectItem>
                <SelectItem value="services">Servicos</SelectItem>
                <SelectItem value="saas">SaaS</SelectItem>
                <SelectItem value="retail">Varejo</SelectItem>
                <SelectItem value="other">Outro</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label className="text-sm text-gray-700">Descricao do negocio</Label>
            <Textarea
              placeholder="Descreva brevemente o que sua empresa faz..."
              value={company.description}
              onChange={(e) => setCompany({ ...company, description: e.target.value })}
              className="min-h-[80px] rounded-xl border-gray-200"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-sm text-gray-700">Missao / Proposta de valor</Label>
            <Textarea
              placeholder="Qual o proposito da sua empresa?"
              value={company.mission}
              onChange={(e) => setCompany({ ...company, mission: e.target.value })}
              className="min-h-[60px] rounded-xl border-gray-200"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-sm text-gray-700">Diferenciais competitivos</Label>
            {company.differentials.map((diff, i) => (
              <div key={i} className="flex gap-2">
                <Input
                  placeholder={`Diferencial ${i + 1}`}
                  value={diff}
                  onChange={(e) => {
                    const newDiffs = [...company.differentials]
                    newDiffs[i] = e.target.value
                    setCompany({ ...company, differentials: newDiffs })
                  }}
                  className="rounded-xl border-gray-200"
                />
                {i > 0 && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      const newDiffs = company.differentials.filter((_, idx) => idx !== i)
                      setCompany({ ...company, differentials: newDiffs })
                    }}
                  >
                    <Trash2 className="h-4 w-4 text-gray-400" />
                  </Button>
                )}
              </div>
            ))}
            <Button
              variant="ghost"
              onClick={() => setCompany({ ...company, differentials: [...company.differentials, ""] })}
              className="text-sm text-gray-600"
            >
              <Plus className="mr-1 h-4 w-4" /> Adicionar diferencial
            </Button>
          </div>
          <Button className="w-full rounded-xl bg-gray-900 text-white hover:bg-gray-800">Salvar identidade</Button>
        </div>
      </AccordionSection>

      {/* Products */}
      <AccordionSection icon={Package} title="Produtos e ofertas">
        <div className="space-y-4">
          {products.length > 0 ? (
            <div className="space-y-3">
              {products.map((product) => (
                <div key={product.id} className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                  <div className="mb-3 flex items-start justify-between">
                    <div>
                      <p className="font-medium text-gray-900">{product.name}</p>
                      <p className="text-sm text-gray-500">
                        {product.type} - {product.price}
                      </p>
                    </div>
                    <div className="flex gap-1">
                      <button
                        onClick={() => setEditingProductId(editingProductId === product.id ? null : product.id)}
                        className="rounded-lg p-2 text-gray-500 hover:bg-gray-200"
                      >
                        <Sparkles className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => setProducts(products.filter((p) => p.id !== product.id))}
                        className="rounded-lg p-2 text-red-500 hover:bg-red-50"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                  {editingProductId === product.id && (
                    <ProductCheckoutPlans
                      plans={product.checkoutPlans}
                      onPlansChange={(plans) => handleUpdateCheckoutPlans(product.id, plans)}
                    />
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-500">Nenhum produto cadastrado ainda.</p>
          )}

          {showAddProduct ? (
            <div className="rounded-xl border border-gray-200 bg-white p-4">
              <div className="space-y-3">
                <Input
                  placeholder="Nome do produto"
                  value={newProduct.name}
                  onChange={(e) => setNewProduct({ ...newProduct, name: e.target.value })}
                  className="rounded-xl border-gray-200"
                />
                <Input
                  placeholder="Preco (ex: R$ 97)"
                  value={newProduct.price}
                  onChange={(e) => setNewProduct({ ...newProduct, price: e.target.value })}
                  className="rounded-xl border-gray-200"
                />
                <Textarea
                  placeholder="Descricao e beneficios"
                  value={newProduct.description}
                  onChange={(e) => setNewProduct({ ...newProduct, description: e.target.value })}
                  className="min-h-[60px] rounded-xl border-gray-200"
                />
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setShowAddProduct(false)} className="flex-1 rounded-xl">
                    Cancelar
                  </Button>
                  <Button onClick={handleAddProduct} className="flex-1 rounded-xl bg-gray-900 text-white">
                    Salvar
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <Button
              onClick={() => setShowAddProduct(true)}
              className="w-full rounded-xl bg-gray-900 text-white hover:bg-gray-800"
            >
              <Plus className="mr-2 h-4 w-4" /> Adicionar produto
            </Button>
          )}
        </div>
      </AccordionSection>

      {/* Customers */}
      <AccordionSection icon={Users} title="Clientes e publico-alvo">
        <div className="space-y-4">
          <div className="space-y-2">
            <Label className="text-sm text-gray-700">Personas de cliente</Label>
            <div className="flex flex-wrap gap-2">
              {personas.map((persona, i) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-3 py-1 text-sm text-gray-700"
                >
                  {persona}
                  <button onClick={() => setPersonas(personas.filter((_, idx) => idx !== i))}>
                    <X className="h-3 w-3 text-gray-500 hover:text-gray-700" />
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                placeholder="Nova persona..."
                value={newPersona}
                onChange={(e) => setNewPersona(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAddPersona()}
                className="rounded-xl border-gray-200"
              />
              <Button onClick={handleAddPersona} variant="outline" className="rounded-xl bg-transparent">
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <Button className="w-full rounded-xl bg-gray-900 text-white hover:bg-gray-800">Salvar personas</Button>
        </div>
      </AccordionSection>

      {/* Voice Tone */}
      <AccordionSection icon={MessageSquare} title="Tom de voz">
        <div className="space-y-4">
          <div className="space-y-2">
            <Label className="text-sm text-gray-700">Estilo de comunicacao</Label>
            <Select value={voiceTone.style} onValueChange={(v) => setVoiceTone({ ...voiceTone, style: v })}>
              <SelectTrigger className="rounded-xl border-gray-200">
                <SelectValue placeholder="Selecione um estilo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="professional">Profissional e formal</SelectItem>
                <SelectItem value="friendly">Amigavel e descontraido</SelectItem>
                <SelectItem value="persuasive">Persuasivo e vendedor</SelectItem>
                <SelectItem value="technical">Tecnico e detalhado</SelectItem>
                <SelectItem value="custom">Personalizado</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between rounded-xl bg-gray-50 p-3">
              <span className="text-sm text-gray-700">Ser profissional</span>
              <Switch
                checked={voiceTone.useProfessional}
                onCheckedChange={(v) => setVoiceTone({ ...voiceTone, useProfessional: v })}
              />
            </div>
            <div className="flex items-center justify-between rounded-xl bg-gray-50 p-3">
              <span className="text-sm text-gray-700">Ser amigavel</span>
              <Switch
                checked={voiceTone.useFriendly}
                onCheckedChange={(v) => setVoiceTone({ ...voiceTone, useFriendly: v })}
              />
            </div>
            <div className="flex items-center justify-between rounded-xl bg-gray-50 p-3">
              <span className="text-sm text-gray-700">Ser persuasivo</span>
              <Switch
                checked={voiceTone.usePersuasive}
                onCheckedChange={(v) => setVoiceTone({ ...voiceTone, usePersuasive: v })}
              />
            </div>
          </div>

          {voiceTone.style === "custom" && (
            <div className="space-y-2">
              <Label className="text-sm text-gray-700">Instrucoes personalizadas</Label>
              <Textarea
                placeholder="Descreva como o Kloel deve se comunicar..."
                value={voiceTone.customInstructions}
                onChange={(e) => setVoiceTone({ ...voiceTone, customInstructions: e.target.value })}
                className="min-h-[80px] rounded-xl border-gray-200"
              />
            </div>
          )}

          <Button className="w-full rounded-xl bg-gray-900 text-white hover:bg-gray-800">Salvar tom de voz</Button>
        </div>
      </AccordionSection>

      {/* Rules */}
      <AccordionSection icon={ShieldCheck} title="Regras de atendimento">
        <div className="space-y-4">
          {rules.length > 0 && (
            <div className="space-y-2">
              {rules.map((rule, i) => (
                <div key={i} className="flex items-center gap-3 rounded-xl bg-gray-50 p-3">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gray-200 text-xs font-medium text-gray-700">
                    {i + 1}
                  </span>
                  <span className="flex-1 text-sm text-gray-700">{rule}</span>
                  <button onClick={() => setRules(rules.filter((_, idx) => idx !== i))}>
                    <Trash2 className="h-4 w-4 text-gray-400 hover:text-red-500" />
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <Input
              placeholder="Nova regra..."
              value={newRule}
              onChange={(e) => setNewRule(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAddRule()}
              className="rounded-xl border-gray-200"
            />
            <Button onClick={handleAddRule} variant="outline" className="rounded-xl bg-transparent">
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </AccordionSection>

      {/* FAQ */}
      <AccordionSection icon={HelpCircle} title="FAQ - Perguntas frequentes">
        <div className="space-y-4">
          {faqs.length > 0 && (
            <div className="space-y-2">
              {faqs.map((faq) => (
                <div key={faq.id} className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                  <div className="mb-2 flex items-start justify-between">
                    <p className="font-medium text-gray-900">{faq.question}</p>
                    <button onClick={() => setFaqs(faqs.filter((f) => f.id !== faq.id))}>
                      <Trash2 className="h-4 w-4 text-gray-400 hover:text-red-500" />
                    </button>
                  </div>
                  <p className="text-sm text-gray-600">{faq.answer}</p>
                </div>
              ))}
            </div>
          )}

          {showAddFaq ? (
            <div className="rounded-xl border border-gray-200 bg-white p-4">
              <div className="space-y-3">
                <Input
                  placeholder="Pergunta"
                  value={newFaq.question}
                  onChange={(e) => setNewFaq({ ...newFaq, question: e.target.value })}
                  className="rounded-xl border-gray-200"
                />
                <Textarea
                  placeholder="Resposta"
                  value={newFaq.answer}
                  onChange={(e) => setNewFaq({ ...newFaq, answer: e.target.value })}
                  className="min-h-[60px] rounded-xl border-gray-200"
                />
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setShowAddFaq(false)} className="flex-1 rounded-xl">
                    Cancelar
                  </Button>
                  <Button onClick={handleAddFaq} className="flex-1 rounded-xl bg-gray-900 text-white">
                    Salvar
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <Button
              onClick={() => setShowAddFaq(true)}
              className="w-full rounded-xl bg-gray-900 text-white hover:bg-gray-800"
            >
              <Plus className="mr-2 h-4 w-4" /> Adicionar pergunta
            </Button>
          )}
        </div>
      </AccordionSection>

      {/* Knowledge Base */}
      <AccordionSection icon={FileText} title="Base de conhecimento">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Select value={fileFilter} onValueChange={setFileFilter}>
              <SelectTrigger className="w-32 rounded-xl border-gray-200">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="pdf">PDF</SelectItem>
                <SelectItem value="excel">Excel</SelectItem>
                <SelectItem value="image">Imagens</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" className="rounded-xl bg-transparent">
              <Upload className="mr-2 h-4 w-4" /> Upload
            </Button>
          </div>

          {files.length > 0 ? (
            <div className="space-y-2">
              {files
                .filter((f) => fileFilter === "all" || f.type.toLowerCase() === fileFilter)
                .map((file) => (
                  <div key={file.id} className="flex items-center justify-between rounded-xl bg-gray-50 p-3">
                    <div className="flex items-center gap-3">
                      <FileText className="h-5 w-5 text-gray-500" />
                      <div>
                        <p className="text-sm font-medium text-gray-900">{file.name}</p>
                        <p className="text-xs text-gray-500">
                          {file.type} - {file.size} - {file.date}
                        </p>
                      </div>
                    </div>
                    <button onClick={() => setFiles(files.filter((f) => f.id !== file.id))}>
                      <Trash2 className="h-4 w-4 text-gray-400 hover:text-red-500" />
                    </button>
                  </div>
                ))}
            </div>
          ) : (
            <p className="text-sm text-gray-500">Nenhum arquivo na base de conhecimento.</p>
          )}
        </div>
      </AccordionSection>

      <EmergencyModeCard />
    </div>
  )
}
