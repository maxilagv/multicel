import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Api } from '../lib/api';
import { queryKeys } from '../lib/queryKeys';
import { getAccessToken, getApiBase } from '../lib/storage';

function buildApiUrl(path: string) {
  const base = getApiBase();
  return base ? `${base}${path}` : path;
}

export function useImportJobStream(jobId: string | null, enabled = true) {
  const [streamed, setStreamed] = useState<any | null>(null);

  const query = useQuery({
    queryKey: jobId ? queryKeys.imports.job(jobId) : [...queryKeys.imports.job('empty')],
    queryFn: async () => {
      if (!jobId) return null;
      return Api.importJob(jobId);
    },
    enabled: enabled && Boolean(jobId),
    refetchInterval: (state) => {
      const status = streamed?.status || state.state.data?.status;
      return status === 'completed' || status === 'failed' ? false : 5000;
    },
  });

  useEffect(() => {
    if (!enabled || !jobId) return undefined;
    const controller = new AbortController();

    async function run() {
      const token = getAccessToken();
      const response = await fetch(buildApiUrl(`/api/import-jobs/${jobId}/events`), {
        method: 'GET',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        signal: controller.signal,
      });
      if (!response.ok || !response.body) {
        return;
      }

      const decoder = new TextDecoder();
      const reader = response.body.getReader();
      let buffer = '';

      while (!controller.signal.aborted) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const events = buffer.split('\n\n');
        buffer = events.pop() || '';

        for (const eventChunk of events) {
          const line = eventChunk
            .split('\n')
            .find((entry) => entry.startsWith('data: '));
          if (!line) continue;
          try {
            const payload = JSON.parse(line.slice(6));
            setStreamed(payload);
          } catch {
            // ignore malformed chunks and keep polling fallback active
          }
        }
      }
    }

    run().catch(() => {
      // polling query remains as fallback
    });

    return () => controller.abort();
  }, [enabled, jobId]);

  return useMemo(
    () => ({
      ...query,
      data: streamed || query.data || null,
    }),
    [query, streamed]
  );
}
