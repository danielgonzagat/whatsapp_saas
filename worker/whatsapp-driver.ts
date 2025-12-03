import { WorkerLogger } from "./logger";

const log = new WorkerLogger("whatsapp-driver");

function randomDelay(min = 120, max = 400) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export const whatsapp = {
  async sendText(to: string, message: string) {
    const delay = randomDelay();
    await new Promise((r) => setTimeout(r, delay));

    log.info("send_text", { to, delayMs: delay });

    await fetch("http://localhost:3000/whatsapp/send", {
      method: "POST",
      body: JSON.stringify({ to, message }),
      headers: { "Content-Type": "application/json" },
    }).catch((err) => {
      log.error("send_error", { to, error: (err as any)?.message });
    });
  },
};
