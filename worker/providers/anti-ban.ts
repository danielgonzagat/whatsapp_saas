import { ContextStore } from "../context-store";
import { HealthMonitor } from "./health-monitor";

const store = new ContextStore("antiban");

export const AntiBan = {
  /**
   * Delay humano baseado em jitter por workspace
   */
  async humanDelay(workspace: any) {
    const min = workspace?.jitterMin ?? 2000; // Increased default for safety
    const max = workspace?.jitterMax ?? 5000;

    const delay = Math.floor(Math.random() * (max - min + 1)) + min;
    console.log(`🛡️ [ANTI-BAN] Human Delay: ${delay}ms`);
    await new Promise((r) => setTimeout(r, delay));
  },

  /**
   * Registro de timestamps para detectar bursts (Redis Scalable)
   */
  async registerSend(workspaceId: string) {
    const now = Date.now();
    const key = `burst:${workspaceId}`;

    // Adiciona timestamp (score=timestamp, member=unique_id)
    await store.zadd(key, now, `${now}-${Math.random()}`);

    // Limpa registros antigos (> 60s)
    const cutoff = now - 60000;
    await store.zremRangeByScore(key, 0, cutoff);
  },

  /**
   * Burst detection → mais de X mensagens em 1 minuto
   */
  async burstProtector(workspace: any) {
    const workspaceId = workspace.id;
    const key = `burst:${workspaceId}`;
    const now = Date.now();

    // Conta mensagens nos últimos 60s
    const count = await store.zcount(key, now - 60000, now);

    // Warm-up Check: If number is new (health score < 50 or undefined), force limit
    const health = await HealthMonitor.getHealth(workspaceId);
    const isWarmup = health.score < 80; // Stricter warmup threshold

    let limit = 40;
    if (isWarmup) {
        limit = 10; // Hard limit for warming up
        console.log(`🔥 [ANTI-BAN] Warm-up Mode Active (Limit: ${limit}/min)`);
    }

    if (count > limit) {
      console.warn(`🚨 [ANTI-BAN] Burst limit exceeded (${count}/${limit}). Throttling...`);
      // Exponential backoff based on excess
      const excess = count - limit;
      const delay = excess * 1000; // 1s per extra msg
      await new Promise((r) => setTimeout(r, delay));
    }
  },

  /**
   * Night-Mode (Meta monitora padrões noturnos)
   */
  async nightMode(workspace: any) {
    const hour = new Date().getHours();

    // entre meia-noite e 06h → penalidade leve
    if (hour >= 0 && hour <= 6) {
      console.log(`🌙 [ANTI-BAN] Night Mode Active`);
      await new Promise((r) => setTimeout(r, 2000));
    }
  },

  /**
   * Chamado antes de QUALQUER envio
   */
  async apply(workspace: any) {
    await this.humanDelay(workspace);
    await this.burstProtector(workspace);
    await this.nightMode(workspace);
    await this.registerSend(workspace.id);
  }
};