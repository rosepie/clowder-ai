import { useEffect, useState } from 'react';
import { apiFetch } from '@/utils/api-client';

export interface AvailableClient {
  id: string;
  label: string;
  command: string;
  available: boolean;
}

interface AvailableClientsState {
  clients: AvailableClient[];
  loading: boolean;
  error: string | null;
}

/**
 * Fetches the list of CLI clients detected by the backend at startup.
 * Returns only the available ones by default.
 */
export function useAvailableClients(): AvailableClientsState {
  const [state, setState] = useState<AvailableClientsState>({
    clients: [],
    loading: true,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;
    apiFetch('/api/available-clients')
      .then(async (res) => {
        if (!res.ok) throw new Error(`Failed to load available clients (${res.status})`);
        return (await res.json()) as { clients: AvailableClient[] };
      })
      .then((body) => {
        if (!cancelled) {
          setState({
            clients: body.clients.filter((c) => c.available),
            loading: false,
            error: null,
          });
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setState({ clients: [], loading: false, error: err instanceof Error ? err.message : String(err) });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
