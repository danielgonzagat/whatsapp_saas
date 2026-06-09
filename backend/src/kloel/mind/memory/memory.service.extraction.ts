import { asMemoryNodeType, type ExtractedMemory, type MemoryNodeType } from './memory-graph.types';
import { clamp01, slugifyMemorySlot } from './memory.service.utils';

type CompleteJsonFn = (system: string, user: string, maxTokens: number) => Promise<unknown>;

export async function extractMemoriesFromTurnText(
  turnText: string,
  completeJson: CompleteJsonFn,
): Promise<ExtractedMemory[]> {
  const system =
    'Você extrai MEMÓRIAS DURÁVEIS e TIPADAS sobre o USUÁRIO a partir da mensagem dele. ' +
    'Responda APENAS JSON {"memories": [{"type": "...", "slot": "...", "content": "...", ' +
    '"confidence": 0.8, "importance": 0.6, "forget": false}]}. ' +
    'Campos: "type" ∈ {fact, preference, project, goal, decision, entity, document, conversation, task, summary, ' +
    'sensitive, expired, contradiction}; "slot" = chave curta snake_case do ASPECTO (ex.: nome, cidade, profissao, ' +
    'empresa, stack, preferencia_formato, idioma, objetivo, projeto_atual, tarefa_atual, decisao); memórias do ' +
    'MESMO aspecto DEVEM usar o MESMO slot (ex.: "mora no RJ" e "mora em SP" usam slot "cidade"); ' +
    '"content" = frase curta e atômica em 3a pessoa ("O usuário ..."); "confidence" e "importance" ' +
    'são números em [0,1]; "forget" = true SOMENTE quando o usuário pede explicitamente para ' +
    'esquecer/remover aquele aspecto (content pode ser ""). Capture só o que é durável e útil; NÃO ' +
    'inclua perguntas nem conteúdo efêmero. Dados sensíveis (senha, cartão, token) só podem virar ' +
    'type="sensitive" quando forem necessários para política/segurança, sem guardar o segredo bruto. Sem nada ' +
    'durável, responda {"memories": []}.';
  const parsed = await completeJson(system, turnText.slice(0, 6000), 700);
  const raw = (parsed as { memories?: unknown })?.memories;
  if (!Array.isArray(raw)) {
    return [];
  }
  const out: ExtractedMemory[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') {
      continue;
    }
    const rec = item as Record<string, unknown>;
    const type: MemoryNodeType = asMemoryNodeType(rec['type']) ?? 'fact';
    const slot = slugifyMemorySlot(typeof rec['slot'] === 'string' ? rec['slot'] : '');
    const content = typeof rec['content'] === 'string' ? rec['content'].trim() : '';
    const forget = rec['forget'] === true;
    if (!slot) {
      continue;
    }
    if (!forget && (content.length === 0 || content.length > 320)) {
      continue;
    }
    out.push({
      type,
      slot,
      content,
      confidence: clamp01(rec['confidence'], 0.6),
      importance: clamp01(rec['importance'], 0.5),
      forget,
    });
    if (out.length >= 12) {
      break;
    }
  }
  return out;
}
