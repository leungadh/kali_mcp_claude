import { useReducer, useCallback, useEffect } from 'react';
import { NetworkMap }      from './components/NetworkMap.jsx';
import { AttackTimeline }  from './components/AttackTimeline.jsx';
import { LiveTerminal }    from './components/LiveTerminal.jsx';
import { PromptInput }     from './components/PromptInput.jsx';
import { useSessionStream } from './hooks/useSessionStream.js';

const INITIAL_STATE = {
  sessions:        [],
  activeSessionId: null,
  isRunning:       false,
};

function reducer(state, action) {
  switch (action.type) {
    case 'START_SESSION':
      return {
        ...state,
        activeSessionId: action.sessionId,
        isRunning: true,
        sessions: [
          { id: action.sessionId, prompt: action.prompt, createdAt: new Date().toISOString() },
          ...state.sessions,
        ],
      };
    case 'SESSION_DONE':
      return { ...state, isRunning: false };
    default:
      return state;
  }
}

export default function App() {
  const [state, dispatch] = useReducer(reducer, INITIAL_STATE);
  const { activeSessionId, isRunning } = state;
  const { events } = useSessionStream(activeSessionId);

  const isDone = events.some((e) => e.type === 'done' || e.type === 'error');
  useEffect(() => {
    if (isRunning && isDone) dispatch({ type: 'SESSION_DONE' });
  }, [isRunning, isDone]);

  const isToolActive = events.some(
    (e) => e.type === 'tool_call' &&
      !events.find((r) => r.type === 'tool_result' && r.toolUseId === e.toolUseId),
  );

  const handlePromptSubmit = useCallback(async (prompt) => {
    try {
      const res = await fetch('/api/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      });
      if (!res.ok) throw new Error(await res.text());
      const { sessionId } = await res.json();
      dispatch({ type: 'START_SESSION', sessionId, prompt });
    } catch (err) {
      console.error('[App] Failed to start session:', err);
    }
  }, []);

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0a', color: '#d1d5db', fontFamily: 'monospace', display: 'flex', flexDirection: 'column' }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 20px', borderBottom: '1px solid #1f2937', background: '#111' }}>
        <span style={{ color: '#00ff41', fontSize: '14px', fontWeight: 'bold' }}>
          AI PenTest Demo Dashboard
        </span>
        <span style={{ fontSize: '11px', color: isRunning ? '#f97316' : '#6b7280' }}>
          {isRunning ? 'Running...' : activeSessionId ? 'Idle' : 'No active session'}
        </span>
      </header>

      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', padding: '8px', minHeight: 0, height: 'calc(100vh - 110px)' }}>
        <NetworkMap isActive={isToolActive} />
        <AttackTimeline events={events} />
        <LiveTerminal events={events} />
      </div>

      <div style={{ padding: '0 8px 8px' }}>
        <PromptInput onSubmit={handlePromptSubmit} disabled={isRunning} />
      </div>
    </div>
  );
}
