import { useEffect, useRef, useState } from 'react';
import { Api } from '../lib/api';
import type { AgentEnvelope, AgentRunInput, AgentRuntimeStatus } from '../types/agent';

export function useAgentRuntime() {
  const [data, setData] = useState<AgentEnvelope | null>(null);
  const [status, setStatus] = useState<AgentRuntimeStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const lastInputRef = useRef<AgentRunInput | null>(null);

  useEffect(() => {
    Api.agentStatus()
      .then((result) => setStatus(result as AgentRuntimeStatus))
      .catch(() => {});
  }, []);

  async function runAgent(input: AgentRunInput) {
    setLoading(true);
    setError(null);
    try {
      const payload: AgentRunInput = {
        ...input,
        session_id: input.session_id ?? sessionIdRef.current ?? null,
      };
      const result = (await Api.agentRun(payload)) as AgentEnvelope;
      setData(result);
      sessionIdRef.current = result?.session?.id || sessionIdRef.current;
      lastInputRef.current = payload;
      return result;
    } catch (e: any) {
      setError(e?.message || 'No se pudo ejecutar el agente.');
      throw e;
    } finally {
      setLoading(false);
    }
  }

  async function continueSession(input: Omit<AgentRunInput, 'session_id'>) {
    if (!sessionIdRef.current) return runAgent(input);
    setLoading(true);
    setError(null);
    try {
      const result = (await Api.agentContinueSession(sessionIdRef.current, input)) as AgentEnvelope;
      setData(result);
      sessionIdRef.current = result?.session?.id || sessionIdRef.current;
      lastInputRef.current = {
        ...input,
        session_id: sessionIdRef.current,
      };
      return result;
    } catch (e: any) {
      setError(e?.message || 'No se pudo continuar la sesion del agente.');
      throw e;
    } finally {
      setLoading(false);
    }
  }

  async function refreshCurrentSurface() {
    const lastInput = lastInputRef.current;
    if (!lastInput) return runAgent({ surface: 'today', preset: 'overview' });
    return continueSession({
      ...lastInput,
      action: undefined,
    });
  }

  async function triggerAction(intent: string, proposalId: number) {
    return continueSession({
      surface: 'priorities',
      action: {
        intent,
        proposal_id: proposalId,
      },
    });
  }

  async function submitFeedback({
    runId = null,
    proposalId = null,
    feedbackType,
    rating = null,
    notes = null,
  }: {
    runId?: number | null;
    proposalId?: number | null;
    feedbackType: string;
    rating?: number | null;
    notes?: string | null;
  }) {
    return Api.agentFeedback({
      run_id: runId,
      proposal_id: proposalId,
      feedback_type: feedbackType,
      rating,
      notes,
    });
  }

  async function openHistory() {
    return continueSession({ surface: 'history' });
  }

  function clearSession() {
    sessionIdRef.current = null;
    lastInputRef.current = null;
    setData(null);
    setError(null);
  }

  return {
    data,
    status,
    loading,
    error,
    sessionId: sessionIdRef.current,
    runAgent,
    continueSession,
    refreshCurrentSurface,
    triggerAction,
    submitFeedback,
    openHistory,
    clearSession,
  };
}
