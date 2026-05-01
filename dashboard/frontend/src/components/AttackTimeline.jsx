import { useState } from 'react';

export function AttackTimeline({ events = [] }) {
  const [expanded, setExpanded] = useState(new Set());

  const steps = [];
  let current = null;
  for (const e of events) {
    if (e.type === 'tool_call') {
      current = { id: e.toolUseId, command: e.command, result: null, done: false };
      steps.push(current);
    } else if (e.type === 'tool_result' && current && e.toolUseId === current.id) {
      current.result = e.output;
      current.done = true;
      current = null;
    }
  }

  const commentary = events.filter((e) => e.type === 'text').map((e) => e.content).join('');
  const toggle = (id) => setExpanded((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  return (
    <div style={{ background: '#111', borderRadius: '8px', padding: '12px', height: '100%', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <p style={{ color: '#6b7280', fontSize: '11px', margin: 0 }}>Attack Timeline</p>
      {commentary && (
        <div style={{ color: '#d1d5db', fontSize: '12px', fontFamily: 'monospace', whiteSpace: 'pre-wrap', borderLeft: '2px solid #374151', paddingLeft: '8px' }}>
          {commentary}
        </div>
      )}
      {steps.map((step, i) => (
        <div key={step.id} style={{ border: '1px solid #1f2937', borderRadius: '6px', overflow: 'hidden' }}>
          <button onClick={() => toggle(step.id)} style={{ width: '100%', background: step.done ? '#052e16' : '#1c1917', border: 'none', cursor: 'pointer', padding: '8px 10px', textAlign: 'left', display: 'flex', alignItems: 'center', gap: '8px', color: '#d1d5db' }}>
            <span style={{ background: step.done ? '#16a34a' : '#ca8a04', color: '#fff', fontSize: '10px', borderRadius: '4px', padding: '1px 6px', flexShrink: 0 }}>
              {i + 1}
            </span>
            <span style={{ fontFamily: 'monospace', fontSize: '12px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
              {step.command}
            </span>
            <span style={{ color: '#6b7280', fontSize: '11px' }}>{expanded.has(step.id) ? '▲' : '▼'}</span>
          </button>
          {expanded.has(step.id) && step.result && (
            <pre style={{ margin: 0, padding: '8px 10px', background: '#0a0a0a', color: '#00ff41', fontFamily: 'monospace', fontSize: '11px', overflowX: 'auto', maxHeight: '200px', overflowY: 'auto' }}>
              {step.result}
            </pre>
          )}
        </div>
      ))}
      {steps.length === 0 && (
        <p style={{ color: '#374151', fontSize: '12px', textAlign: 'center', marginTop: '24px' }}>No commands run yet.</p>
      )}
    </div>
  );
}
