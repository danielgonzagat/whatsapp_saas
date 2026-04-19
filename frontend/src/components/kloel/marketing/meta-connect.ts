type MetaConnectResponse = {
  url?: string;
  data?: {
    url?: string;
    data?: {
      url?: string;
    };
  };
  error?: string;
};

export function resolveMetaConnectUrl(response: MetaConnectResponse) {
  const url = String(response?.url || response?.data?.url || response?.data?.data?.url || '').trim();
  if (url) {
    return url;
  }

  const message = String(response?.error || '').trim();
  if (message) {
    throw new Error(message);
  }

  throw new Error('Nao foi possivel iniciar a conexao oficial da Meta.');
}
