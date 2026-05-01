import Anthropic from '@anthropic-ai/sdk';

function buildSystemPrompt(targetIp) {
  return `You are an expert penetration tester running inside a controlled AWS lab environment.

Your ONLY authorized target is the host at IP address ${targetIp}.
You MUST NOT attack, scan, or interact with any IP address other than ${targetIp}.

You have access to the following tool:
- run_command(command: string): Executes any shell command on the Kali Linux attacker VM.

Available pentest tools on the Kali VM:
  nmap, nikto, gobuster, hydra, sqlmap, metasploit-framework, curl, wget

Guidelines:
1. Always explain what you are about to do before running a command.
2. Analyze tool output and decide sensible next steps.
3. Run one command at a time and wait for the result before continuing.
4. If a command hangs or times out, try a less aggressive variant.
5. Summarize your findings when you have completed a phase.
6. NEVER use --aggressive flags that could crash the target VM.
7. NEVER exfiltrate real data — this is a demo environment.`;
}

const TOOLS = [
  {
    name: 'run_command',
    description:
      'Run a shell command on the Kali Linux attacker VM and return its stdout. ' +
      'Use this for all scanning, enumeration, and exploitation commands.',
    input_schema: {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          description: 'The shell command to execute (e.g. "nmap -sV 10.0.2.100")',
        },
      },
      required: ['command'],
    },
  },
];

export class ClaudeClient {
  constructor({ anthropic, targetIp, model } = {}) {
    this.anthropic = anthropic ?? new Anthropic();
    this.targetIp = targetIp;
    this.model = model ?? 'claude-sonnet-4-6';
    this._systemPrompt = buildSystemPrompt(targetIp);
  }

  async run(userPrompt, onEvent, toolExecutor) {
    const messages = [{ role: 'user', content: userPrompt }];

    for (let iteration = 0; iteration < 20; iteration++) {
      let stopReason;
      let finalMessage;

      try {
        const stream = this.anthropic.messages.stream({
          model:      this.model,
          max_tokens: 4096,
          system: [
            {
              type: 'text',
              text: this._systemPrompt,
              cache_control: { type: 'ephemeral' },
            },
          ],
          tools:    TOOLS,
          messages: messages,
        });

        for await (const event of stream) {
          if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
            await onEvent({ type: 'text', content: event.delta.text });
          }
        }

        finalMessage = await stream.finalMessage();
        stopReason = finalMessage.stop_reason;
      } catch (err) {
        await onEvent({ type: 'error', message: err.message });
        return;
      }

      messages.push({ role: 'assistant', content: finalMessage.content });

      if (stopReason === 'end_turn' || stopReason === 'stop_sequence') break;
      if (stopReason !== 'tool_use') break;

      const toolUseBlocks = finalMessage.content.filter((b) => b.type === 'tool_use');
      const toolResults = [];

      for (const block of toolUseBlocks) {
        if (block.name !== 'run_command') {
          toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: `Unknown tool: ${block.name}` });
          continue;
        }

        const command = block.input?.command ?? '';
        await onEvent({ type: 'tool_call', toolUseId: block.id, command });

        let output;
        try {
          output = await toolExecutor(command);
        } catch (err) {
          await onEvent({ type: 'error', message: err.message });
          return;
        }

        await onEvent({ type: 'tool_result', toolUseId: block.id, output });
        toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: output });
      }

      messages.push({ role: 'user', content: toolResults });
    }

    await onEvent({ type: 'done' });
  }
}

export function claudeClientFromEnv() {
  return new ClaudeClient({
    targetIp: process.env.TARGET_PRIVATE_IP ?? '10.0.2.100',
  });
}
