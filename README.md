# AI PenTest Demo Dashboard

An educational demo where Claude autonomously performs penetration testing against a deliberately vulnerable web server, streaming every command and result to a real-time React dashboard.

Inspired by [Kali & LLM: macOS with Claude Desktop](https://www.kali.org/blog/kali-llm-claude-desktop/), adapted to run fully on AWS with a custom visualization layer.

> **For educational use only.** The target is a deliberately vulnerable VM (DVWA) in an isolated AWS VPC. Never point this at systems you don't own.

---

## Architecture

```
Browser (localhost:3000)
    │  HTTP + SSE
    ▼
Express backend (localhost:3001)
    │  Anthropic SDK (streaming)       │  ssh2 (Node.js)
    ▼                                  ▼
Claude API  ◄──── tool results ────  Kali EC2 (18.x.x.x, public)
                                          │  private network
                                          ▼
                                     DVWA Target EC2 (10.0.2.100, private)
```

Claude runs an agentic loop: it receives a natural language prompt, decides which pentest commands to run, executes them on Kali via SSH, reads the output, and continues until it's done. Every step streams to the dashboard in real time via Server-Sent Events (SSE).

A standalone Python MCP server (`mcp-server/`) provides the same capabilities for Claude Desktop or Claude Code.

---

## File Structure

```
.
├── .env.example                  # Environment variable template
├── Design.md                     # Original spec and architecture notes
├── infrastructure/
│   ├── kali-setup.sh             # Bootstrap Kali EC2 (installs nmap, nikto, etc.)
│   └── target-setup.sh           # Bootstrap target EC2 (Docker + DVWA)
├── mcp-server/
│   ├── server.py                 # Standalone FastMCP server for Claude Desktop
│   └── requirements.txt
└── dashboard/
    ├── backend/
    │   ├── server.js             # Express API + SSE streaming endpoint
    │   ├── claude_client.js      # Anthropic SDK agentic loop
    │   ├── kali_ssh.js           # ssh2 wrapper (exec + SFTP upload)
    │   ├── session_logger.js     # SQLite session + event persistence
    │   ├── package.json
    │   └── __tests__/            # 20 Vitest unit tests
    └── frontend/
        ├── vite.config.js        # Vite + proxy to :3001 + jsdom test env
        ├── src/
        │   ├── App.jsx           # Global state (useReducer) + layout
        │   ├── hooks/
        │   │   └── useSessionStream.js   # EventSource → accumulated events
        │   └── components/
        │       ├── NetworkMap.jsx        # D3 force graph, animates during attacks
        │       ├── AttackTimeline.jsx    # Expandable command/result history
        │       ├── LiveTerminal.jsx      # Streaming raw terminal output
        │       └── PromptInput.jsx       # Text input + preset prompt buttons
        └── package.json
```

---

## Dashboard

Four panels update in real time as Claude works:

| Panel | What it shows |
|---|---|
| **Network Map** | Kali → DVWA topology; arrow pulses green while a command runs |
| **Attack Timeline** | Each command as an expandable row; yellow while running, green when done |
| **Live Terminal** | Raw stdout from every command, auto-scrolling |
| **Prompt Input** | Free-text input + three preset buttons; disabled while a session runs |

---

## Prerequisites

- Node.js 20+
- AWS EC2 — Kali Linux instance (public IP, SSH accessible)
- AWS EC2 — Ubuntu instance (private IP only, DVWA running)
- Anthropic API key

---

## Setup

### 1. Provision AWS infrastructure

Both EC2 instances should be in the same VPC/subnet so Kali can reach the target via private IP.

**Security Groups:**
- Kali: allow SSH (22) from your machine only
- Target: allow HTTP (80) from Kali's private IP only; no public access

### 2. Bootstrap Kali EC2

```bash
scp infrastructure/kali-setup.sh ubuntu@<KALI_PUBLIC_IP>:/tmp/
ssh ubuntu@<KALI_PUBLIC_IP> "sudo bash /tmp/kali-setup.sh"
```

Installs: `nmap`, `nikto`, `metasploit-framework`, `gobuster`, `hydra`, `sqlmap`, `curl`, `wget`, Python 3.10, `uv`.

### 3. Bootstrap target EC2

```bash
scp infrastructure/target-setup.sh ubuntu@<TARGET_PUBLIC_IP>:/tmp/
ssh ubuntu@<TARGET_PUBLIC_IP> "sudo bash /tmp/target-setup.sh"
```

Installs Docker and launches DVWA on port 80. Default credentials: `admin` / `password`.

> After first login, go to **DVWA Security → Setup/Reset DB** to initialize the database.

### 4. Configure environment

```bash
cp .env.example .env
```

Edit `.env`:

```bash
ANTHROPIC_API_KEY=sk-ant-...
KALI_HOST=<kali-ec2-public-ip>
KALI_SSH_USER=ubuntu
KALI_SSH_KEY_PATH=~/.ssh/your-key.pem
TARGET_PRIVATE_IP=10.0.2.100   # private IP of DVWA EC2, as seen from Kali
PORT=3001
```

### 5. Install dependencies

```bash
cd dashboard/backend && npm install
cd ../frontend && npm install
```

### 6. Run

Open two terminals:

```bash
# Terminal 1 — backend
cd dashboard/backend
node server.js
# [server] AI PenTest backend running on http://localhost:3001

# Terminal 2 — frontend
cd dashboard/frontend
npm run dev
# VITE ready at http://localhost:3000/
```

Open `http://localhost:3000` in your browser.

---

## Demo

1. Open `http://localhost:3000`
2. Click **"Scan the target for open ports"** (or type your own prompt)
3. Watch all four panels update as Claude:
   - Runs `nmap -sV <target>` and reads port/service data
   - Runs `nikto -h <target>` to check for web vulnerabilities
   - Interprets results and decides follow-up actions
   - Summarizes findings when done

Typical prompts to try:

```
Scan the target for open ports
Check for SQL injection vulnerabilities
Attempt to brute-force the login page
Run a full enumeration and summarize all findings
```

Each session is saved to `sessions.sqlite` — you can replay events by reconnecting to the SSE stream endpoint (`GET /api/session/:id/stream`).

---

## MCP Server (Claude Desktop / Claude Code)

`mcp-server/server.py` is a standalone FastMCP server that exposes the same `run_command` and `upload_file` tools over stdio transport, for use with Claude Desktop or Claude Code.

```bash
cd /path/to/repo
cp .env.example .env   # fill in KALI_HOST, KALI_SSH_USER, KALI_SSH_KEY_PATH
uv run mcp-server/server.py
```

Add to your Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "kali-pentest": {
      "command": "uv",
      "args": ["run", "/path/to/repo/mcp-server/server.py"]
    }
  }
}
```

---

## Tests

```bash
cd dashboard/backend
npm test
# 20 tests passing (session_logger × 6, kali_ssh × 5, claude_client × 3, server × 6)
```

All tests use in-memory SQLite and injected mock clients — no real SSH or Anthropic calls.

---

## Key Design Decisions

- **ssh2 not child_process+ssh**: Pure Node.js SSH client, no system binary dependency.
- **SSE not WebSocket**: Unidirectional streaming is sufficient; works through Vite's dev proxy without extra config.
- **Prompt caching**: System prompt uses `cache_control: { type: 'ephemeral' }` — cuts input token cost ~90% on turns 2+ of a session.
- **Injectable factories**: `KaliSSH` and `ClaudeClient` accept injected clients so unit tests never touch real SSH or the Anthropic API.
- **SQLite late-join replay**: SSE clients that connect after a session starts receive all prior events replayed from SQLite before subscribing to live ones.
- **MCP server separate from backend**: `mcp-server/server.py` is for Claude Desktop integration. The dashboard backend SSHes to Kali directly — no MCP subprocess needed.

---

## Security Notes

- The DVWA target has no public IP and is only reachable from the Kali EC2 via its private IP.
- The system prompt restricts Claude to only interact with `TARGET_PRIVATE_IP` — any attempt to target other hosts will be refused.
- SSH key auth only; password auth should be disabled on both EC2 instances.
- `.env`, `*.pem`, and `*.sqlite` are gitignored and must never be committed.
