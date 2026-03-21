
import { PrismaClient } from '@prisma/client';
import { UnifiedAgentService } from './backend/src/kloel/unified-agent.service';
import { WhatsappService } from './backend/src/whatsapp/whatsapp.service';
import { ConfigService } from '@nestjs/config';

// Este é um script de diagnóstico para rodar via ts-node ou npx
async function diagnoseAgent(workspaceId: string, phone: string, message: string) {
  console.log(`🔍 Iniciando diagnóstico para Agente no workspace ${workspaceId} para o telefone ${phone}...`);
  
  // 1. Simular chamada de ferramenta (tool calling)
  // Vamos ver se o WhatsappService.sendMessage() lança exceção
  console.log(`\n--- Testando WhatsappService.sendMessage() ---`);
  // Note: Precisamos instanciar ou mockar as dependências para um teste isolado
  // Como estamos no ambiente real, vamos tentar ver os logs de erro recentes
}

console.log('Diagnóstico manual:');
console.log('Verifique se o Worker está processando a fila: npx bull-board (se disponível) ou redis-cli LLEN bull:flow-jobs:wait');
