import { apiFetch } from './core';

export const growthApi = {
  activateMoneyMachine: () =>
    apiFetch<{ success: boolean; processed: number }>('/growth/money-machine/activate', {
      method: 'POST',
    }),

  getMoneyMachineReport: () =>
    apiFetch<{ processed: number; sent: number; scheduled: number }>(
      '/growth/money-machine/report',
    ),

  generateWhatsAppQr: (phone: string, message?: string) =>
    apiFetch<{ dataUrl: string; waUrl: string }>('/growth/qr/whatsapp', {
      method: 'POST',
      body: { phone, message },
    }),
};
