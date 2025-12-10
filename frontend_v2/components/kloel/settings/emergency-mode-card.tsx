"use client"

import { useState } from "react"
import { AlertTriangle } from "lucide-react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"

export function EmergencyModeCard() {
  const [emergencyAction, setEmergencyAction] = useState("")
  const [fixedMessage, setFixedMessage] = useState("")

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
      <div className="mb-4 flex items-center gap-3">
        <AlertTriangle className="h-5 w-5 text-orange-600" />
        <h4 className="text-lg font-semibold text-gray-900">Modo de Emergencia</h4>
      </div>

      <p className="mb-4 text-sm text-gray-500">
        Configure o que o Kloel deve fazer quando houver problemas tecnicos ou instabilidades.
      </p>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label className="text-sm text-gray-700">O que o Kloel deve fazer quando houver problemas?</Label>
          <Select value={emergencyAction} onValueChange={setEmergencyAction}>
            <SelectTrigger className="rounded-xl border-gray-200">
              <SelectValue placeholder="Selecione uma acao" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="pause">Pausar atendimento</SelectItem>
              <SelectItem value="forward">Encaminhar para humano</SelectItem>
              <SelectItem value="fixed">Enviar mensagem fixa</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {emergencyAction === "fixed" && (
          <div className="space-y-2">
            <Label className="text-sm text-gray-700">Mensagem de emergencia</Label>
            <Textarea
              placeholder="Estamos passando por uma instabilidade. Ja vamos te responder."
              value={fixedMessage}
              onChange={(e) => setFixedMessage(e.target.value)}
              className="min-h-[80px] rounded-xl border-gray-200"
            />
          </div>
        )}

        {emergencyAction === "forward" && (
          <div className="rounded-xl bg-blue-50 p-4">
            <p className="text-sm text-blue-800">
              Quando ativado, o Kloel ira notificar o responsavel e encaminhar a conversa para atendimento humano.
            </p>
          </div>
        )}

        {emergencyAction === "pause" && (
          <div className="rounded-xl bg-yellow-50 p-4">
            <p className="text-sm text-yellow-800">
              O Kloel ira pausar todas as respostas automaticas ate que o problema seja resolvido.
            </p>
          </div>
        )}
      </div>

      <Button className="mt-4 w-full rounded-xl bg-gray-900 text-white hover:bg-gray-800">
        Salvar configuracao de emergencia
      </Button>
    </div>
  )
}
