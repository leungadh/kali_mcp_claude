import { useState } from 'react';

const PRESETS = [
  'Scan the target for open ports',
  'Check for SQL injection vulnerabilities',
  'Attempt to brute-force the login page',
];

export function PromptInput({ onSubmit, disabled = false }) {
  const [value, setValue] = useState('');

  const handleSubmit = (text) => {
    const trimmed = (text ?? value).trim();
    if (!trimmed || disabled) return;
    onSubmit(trimmed);
    setValue('');
  };

  return (
    <div style={{ background: '#111', borderRadius: '8px', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <div style={{ display: 'flex', gap: '8px' }}>
        <input type="text" value={value} onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
          disabled={disabled}
          placeholder="Ask Claude to perform a pentest task..."
          style={{ flex: 1, background: '#1a1a1a', border: '1px solid #374151', borderRadius: '6px', color: '#d1d5db', padding: '8px 12px', fontFamily: 'monospace', fontSize: '13px', outline: 'none' }}
        />
        <button onClick={() => handleSubmit()} disabled={disabled || !value.trim()}
          style={{ background: disabled ? '#374151' : '#16a34a', color: '#fff', border: 'none', borderRadius: '6px', padding: '8px 18px', cursor: disabled ? 'not-allowed' : 'pointer', fontFamily: 'monospace', fontSize: '13px' }}>
          {disabled ? 'Running...' : 'Send'}
        </button>
      </div>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        {PRESETS.map((preset) => (
          <button key={preset} onClick={() => handleSubmit(preset)} disabled={disabled}
            style={{ background: '#1a1a1a', border: '1px solid #374151', borderRadius: '4px', color: '#9ca3af', padding: '4px 10px', cursor: disabled ? 'not-allowed' : 'pointer', fontFamily: 'monospace', fontSize: '11px' }}>
            {preset}
          </button>
        ))}
      </div>
    </div>
  );
}
