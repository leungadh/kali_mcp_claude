import { useEffect, useReducer, useRef } from 'react';

function reducer(state, action) {
  switch (action.type) {
    case 'OPEN':    return { ...state, connected: true, error: null };
    case 'EVENT':   return { ...state, events: [...state.events, action.payload] };
    case 'ERROR':   return { ...state, connected: false, error: action.error };
    case 'CLOSE':   return { ...state, connected: false };
    case 'RESET':   return { events: [], connected: false, error: null };
    default:        return state;
  }
}

const INITIAL = { events: [], connected: false, error: null };

export function useSessionStream(sessionId) {
  const [state, dispatch] = useReducer(reducer, INITIAL);
  const esRef = useRef(null);

  useEffect(() => {
    if (!sessionId) { dispatch({ type: 'RESET' }); return; }
    dispatch({ type: 'RESET' });

    const es = new EventSource(`/api/session/${sessionId}/stream`);
    esRef.current = es;

    es.onopen    = () => dispatch({ type: 'OPEN' });
    es.onmessage = (e) => {
      try { dispatch({ type: 'EVENT', payload: JSON.parse(e.data) }); }
      catch { /* ignore malformed events */ }
    };
    es.onerror   = () => { dispatch({ type: 'ERROR', error: 'SSE connection error' }); es.close(); };

    return () => es.close();
  }, [sessionId]);

  return state;
}
