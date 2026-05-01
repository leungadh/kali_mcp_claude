import { useEffect, useRef } from 'react';

export function LiveTerminal({ events = [] }) {
  const bottomRef = useRef(null);

  const output = events
    .filter((e) => e.type === 'tool_result')
    .map((e) => {
      const cmd = events.find((ev) => ev.type === 'tool_call' && ev.toolUseId === e.toolUseId);
      return `${cmd ? `$ ${cmd.command}\n` : ''}${e.output}\n`;
    })
    .join('---\n');

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [output]);

  return (
    <div style={{ background: '#0a0a0a', borderRadius: '8px', padding: '12px', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <p style={{ color: '#6b7280', fontSize: '11px', margin: '0 0 8px 0' }}>Live Terminal</p>
      <pre style={{ flex: 1, overflowY: 'auto', margin: 0, fontFamily: '"Courier New", Courier, monospace', fontSize: '12px', color: '#00ff41', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
        {output || <span style={{ color: '#374151' }}>Waiting for commands...</span>}
        <span ref={bottomRef} />
      </pre>
    </div>
  );
}
