"use client"

import { useState } from "react"
import { MessageSquare } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"

export function OpeningMessageCard() {
  const [message, setMessage] = useState("")
  const [useEmojis, setUseEmojis] = useState(true)
  const [isFormal, setIsFormal] = useState(false)
  const [isFriendly, setIsFriendly] = useState(true)

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
      <div className="mb-4 flex items-center gap-3">
        <MessageSquare className="h-5 w-5 text-gray-600" />
        <h4 className="text-lg font-semibold text-gray-900">Mensagem de abertura do Kloel</h4>
      </div>

      <p className="mb-4 text-sm text-gray-500">
        Essa e a primeira mensagem que o Kloel envia quando um cliente inicia uma conversa.
      </p>

      <div className="mb-4 space-y-2">
        <Label className="text-sm text-gray-700">Mensagem inicial</Label>
        <Textarea
          placeholder="Ex: Ola! Eu sou o Kloel, assistente comercial da sua empresa. Como posso ajudar voce hoje?"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          className="min-h-[100px] rounded-xl border-gray-200"
        />
      </div>

      {/* WhatsApp Preview */}
      {message && (
        <div className="mb-6 rounded-xl bg-[#E5DDD5] p-4">
          <p className="mb-1 text-xs text-gray-600">Pre-visualizacao no WhatsApp</p>
          <div className="inline-block max-w-[80%] rounded-lg bg-white px-3 py-2 shadow-sm">
            <p className="text-sm text-gray-800">{message}</p>
            <p className="mt-1 text-right text-[10px] text-gray-400">12:00</p>
          </div>
        </div>
      )}

      <div className="space-y-4">
        <div className="flex items-center justify-between rounded-xl bg-gray-50 p-4">
          <div>
            <p className="text-sm font-medium text-gray-700">Usar emojis?</p>
            <p className="text-xs text-gray-500">Adiciona emojis para deixar a mensagem mais amigavel</p>
          </div>
          <Switch checked={useEmojis} onCheckedChange={setUseEmojis} />
        </div>
        <div className="flex items-center justify-between rounded-xl bg-gray-50 p-4">
          <div>
            <p className="text-sm font-medium text-gray-700">Ser formal?</p>
            <p className="text-xs text-gray-500">Usa linguagem mais profissional e corporativa</p>
          </div>
          <Switch checked={isFormal} onCheckedChange={setIsFormal} />
        </div>
        <div className="flex items-center justify-between rounded-xl bg-gray-50 p-4">
          <div>
            <p className="text-sm font-medium text-gray-700">Ser amigavel?</p>
            <p className="text-xs text-gray-500">Usa tom mais descontraido e acolhedor</p>
          </div>
          <Switch checked={isFriendly} onCheckedChange={setIsFriendly} />
        </div>
      </div>

      <Button className="mt-4 w-full rounded-xl bg-gray-900 text-white hover:bg-gray-800">Salvar mensagem</Button>
    </div>
  )
}
