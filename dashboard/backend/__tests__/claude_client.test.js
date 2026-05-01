import { describe, it, expect, vi, beforeEach } from 'vitest';

function makeTextEvent(text) {
  return { type: 'content_block_delta', delta: { type: 'text_delta', text } };
}
function makeToolUseStart(id, name) {
  return { type: 'content_block_start', content_block: { type: 'tool_use', id, name } };
}
function makeToolInputDelta(partialJson) {
  return { type: 'content_block_delta', delta: { type: 'input_json_delta', partial_json: partialJson } };
}
function makeMessageStart() {
  return { type: 'message_start', message: { usage: { input_tokens: 100 } } };
}
function makeMessageDelta(stopReason = 'end_turn') {
  return { type: 'message_delta', delta: { stop_reason: stopReason }, usage: { output_tokens: 50 } };
}
function makeMessageStop() { return { type: 'message_stop' }; }

async function* makeStream(events) { for (const e of events) yield e; }

function fakeAnthropicClient(turns) {
  let callCount = 0;
  return {
    messages: {
      stream: vi.fn((_params) => {
        const turn = turns[callCount++];
        return {
          [Symbol.asyncIterator]: () => makeStream(turn.events)[Symbol.asyncIterator](),
          finalMessage: async () => turn.finalMessage,
        };
      }),
    },
  };
}

describe('ClaudeClient agentic loop', () => {
  let ClaudeClient;

  beforeEach(async () => {
    vi.resetModules();
    const mod = await import('../claude_client.js');
    ClaudeClient = mod.ClaudeClient;
  });

  it('emits text events for a simple text-only response', async () => {
    const anthropic = fakeAnthropicClient([{
      events: [makeMessageStart(), makeTextEvent('Hello, '), makeTextEvent('world!'), makeMessageDelta('end_turn'), makeMessageStop()],
      finalMessage: { stop_reason: 'end_turn', content: [{ type: 'text', text: 'Hello, world!' }], usage: { input_tokens: 100, output_tokens: 50 } },
    }]);

    const client = new ClaudeClient({ anthropic, targetIp: '10.0.2.100' });
    const emitted = [];
    await client.run('say hello', async (event) => emitted.push(event));

    const combined = emitted.filter((e) => e.type === 'text').map((e) => e.content).join('');
    expect(combined).toContain('Hello');
    expect(emitted.find((e) => e.type === 'done')).toBeDefined();
  });

  it('calls toolExecutor and continues the loop on tool_use', async () => {
    const toolResult = 'PORT 22/tcp open ssh\n80/tcp open http\n';
    const toolExecutor = vi.fn().mockResolvedValue(toolResult);

    const anthropic = fakeAnthropicClient([
      {
        events: [
          makeMessageStart(),
          makeToolUseStart('tool_abc', 'run_command'),
          makeToolInputDelta('{"command":"nmap -sV 10.0.2.100"}'),
          makeMessageDelta('tool_use'),
          makeMessageStop(),
        ],
        finalMessage: {
          stop_reason: 'tool_use',
          content: [{ type: 'tool_use', id: 'tool_abc', name: 'run_command', input: { command: 'nmap -sV 10.0.2.100' } }],
          usage: { input_tokens: 200, output_tokens: 80 },
        },
      },
      {
        events: [makeMessageStart(), makeTextEvent('Scan complete.'), makeMessageDelta('end_turn'), makeMessageStop()],
        finalMessage: { stop_reason: 'end_turn', content: [{ type: 'text', text: 'Scan complete.' }], usage: { input_tokens: 300, output_tokens: 30 } },
      },
    ]);

    const client = new ClaudeClient({ anthropic, targetIp: '10.0.2.100' });
    const emitted = [];
    await client.run('scan the target', async (event) => emitted.push(event), toolExecutor);

    expect(toolExecutor).toHaveBeenCalledWith('nmap -sV 10.0.2.100');
    expect(emitted.find((e) => e.type === 'tool_call')?.command).toBe('nmap -sV 10.0.2.100');
    expect(emitted.find((e) => e.type === 'tool_result')?.output).toBe(toolResult);
    expect(emitted.find((e) => e.type === 'done')).toBeDefined();
  });

  it('emits error event when toolExecutor throws', async () => {
    const toolExecutor = vi.fn().mockRejectedValue(new Error('SSH failed'));

    const anthropic = fakeAnthropicClient([{
      events: [makeMessageStart(), makeToolUseStart('tool_err', 'run_command'), makeToolInputDelta('{"command":"id"}'), makeMessageDelta('tool_use'), makeMessageStop()],
      finalMessage: { stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 'tool_err', name: 'run_command', input: { command: 'id' } }], usage: { input_tokens: 100, output_tokens: 20 } },
    }]);

    const client = new ClaudeClient({ anthropic, targetIp: '10.0.2.100' });
    const emitted = [];
    await client.run('run id', async (event) => emitted.push(event), toolExecutor);

    const errorEvent = emitted.find((e) => e.type === 'error');
    expect(errorEvent).toBeDefined();
    expect(errorEvent.message).toContain('SSH failed');
  });
});
