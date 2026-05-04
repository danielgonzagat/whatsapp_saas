const D_RE = /\D/g;

export function getStatusLabel(status: string): string {
  switch (status) {
    case 'executed':
      return 'Executado';
    case 'cancelled':
      return 'Cancelado';
    default:
      return 'Pendente';
  }
}

export function formatDate(dateStr: string): string {
  if (!dateStr) {
    return '-';
  }
  try {
    return new Date(dateStr).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return dateStr;
  }
}

export function formatPhone(phone: string): string {
  if (!phone) {
    return '-';
  }
  const cleaned = phone.replace(D_RE, '');
  if (cleaned.length === 13) {
    return `+${cleaned.slice(0, 2)} (${cleaned.slice(2, 4)}) ${cleaned.slice(4, 9)}-${cleaned.slice(9)}`;
  }
  if (cleaned.length === 11) {
    return `(${cleaned.slice(0, 2)}) ${cleaned.slice(2, 7)}-${cleaned.slice(7)}`;
  }
  return phone;
}
