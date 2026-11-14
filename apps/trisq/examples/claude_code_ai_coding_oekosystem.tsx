import React, { useState } from 'react';
import {
  Terminal,
  Monitor,
  Smartphone,
  Layers,
  Cpu,
  Users,
  Zap,
  ArrowLeftRight,
  GitBranch,
  Copy,
  Check,
  Sparkles,
  Workflow,
  ShieldCheck,
  LayoutGrid,
  MessageSquare,
  Play
} from 'lucide-react';

/**
 * Interactive Architecture Diagram & Technical Guide for Claude Code (General Ecosystem)
 * Covers: Claude Desktop vs. CLI, Shared Agentic Runtime (~/.claude/), Remote Control (/rc),
 * tmux multiplexing, Subagents vs. Parallel Sessions / Agent Teams, and the optimal workflow.
 */
export default function App() {
  const [selectedPillar, setSelectedPillar] = useState('surfaces');
  const [topologyMode, setTopologyMode] = useState('comparison'); // 'comparison' | 'visual'
  const [copied, setCopied] = useState(false);

  const pillarDetails = {
    surfaces: {
      title: '1. Claude Desktop vs. Claude Code CLI (Die Oberflächen)',
      badge: 'Interaktions-Schicht',
      summary:
        'Beide Oberflächen nutzen exakt dieselbe unterliegende Agent-Engine und teilen sich Sessions, Konfiguration und MCP-Server. Die Wahl hängt davon ab, ob du interaktiv steuerst oder automatisierst.',
      points: [
        {
          label: 'Claude Desktop (Code-Tab)',
          text: 'Visuelles Cockpit für den Alltag: übersichtliche Inline-Diffs, Berechtigungs-Dialoge, parallele Session-Sidebar, 1-Klick-Git-Worktrees und integrierte Vorschau.'
        },
        {
          label: 'Claude Code CLI (claude)',
          text: 'Unix-natives Power-Tool für Terminal, SSH-Server, Pipes (cat log | claude -p "..."), Headless-Skripte und CI/CD-Pipelines (--output-format stream-json).'
        },
        {
          label: 'Nahtloser Session-Transfer',
          text: 'Mit /desktop schiebst du eine laufende Terminal-Session samt Historie in Claude Desktop; mit claude --resume <id> holst du jede Session ins Terminal zurück.'
        }
      ],
      commands: [
        'claude                        # Interaktive CLI-Session starten',
        'claude -p "Analysiere Logs"   # Headless / Pipe-Modus für Skripte',
        '/desktop                      # Aktive CLI-Session an Claude Desktop übergeben',
        'claude --resume               # Bestehende Session (aus CLI oder Desktop) fortsetzen'
      ]
    },
    engine: {
      title: '2. Shared Core Runtime & Projekt-Gedächtnis',
      badge: 'Gemeinsame Engine (~/.claude/)',
      summary:
        'Unter Desktop, CLI und IDE-Plugins läuft derselbe agentische Loop (Lesen → Planen → Editieren → Ausführen → Prüfen). Der gesamte Zustand liegt transparent als Datei auf der Platte.',
      points: [
        {
          label: 'CLAUDE.md (Regelwerk & Architektur-Kontext)',
          text: 'Wird automatisch in jede Session geladen. Definiert Build-Befehle, Coding-Standards, Architektur-Leitplanken und Anti-Patterns für das Repository.'
        },
        {
          label: 'Hooks (Deterministische Leitplanken)',
          text: 'Shell-Befehle, die automatisch vor oder nach Tool-Aufrufen feuern (z. B. nach jedem Datei-Edit automatisch Formatter, Linter oder Typecheck ausführen).'
        },
        {
          label: 'MCP-Server & Skills',
          text: 'Über das Model Context Protocol (MCP) greift Claude auf Datenbanken, GitHub, Browser oder Ticket-Systeme zu; Skills (/command) kapseln wiederkehrende Workflows.'
        }
      ],
      commands: [
        './CLAUDE.md                   # Projektspezifische Regeln (im Git-Repo)',
        '~/.claude/CLAUDE.md           # Globale Entwickler-Präferenzen',
        '~/.claude/plans/*.md          # Persistierte Architektur- & Umsetzungspläne',
        '~/.claude/projects/.../*.jsonl # Vollständige Session-Transkripte (austauschbar)'
      ]
    },
    remote: {
      title: '3. Remote Control (/rc): Lokale Umgebung mobil steuern',
      badge: 'HTTPS-Tunnel • 100 % Lokal',
      summary:
        'Im Gegensatz zu "Claude Code on the Web" (Cloud-VM) bleibt bei Remote Control alles auf deinem Rechner: Dateisystem, lokale DBs, MCP-Server und Environment-Variablen.',
      points: [
        {
          label: 'Interaktiver Modus (/rc)',
          text: 'Aktiviert in einer laufenden Desktop- oder CLI-Session einen verschlüsselten ausgehenden Tunnel zu claude.ai/code und der Claude Mobile-App (QR-Code / Link).'
        },
        {
          label: 'Server-Modus (claude remote-control)',
          text: 'Läuft als dauerhafter Listener auf deiner Workstation. Jede neue Aufgabe vom Smartphone spawnt automatisch eine eigene Session – ideal mit --spawn worktree.'
        },
        {
          label: 'Kein offener Port nötig',
          text: 'Nutzt ausgehende HTTPS-Verbindungen mit kurzlebigen Tokens. Du kannst lange Refactorings am Schreibtisch starten und unterwegs per Smartphone freigeben.'
        }
      ],
      commands: [
        '/rc                                        # Laufende Session für Mobile/Web freigeben',
        'claude remote-control --spawn worktree     # Listener für isolierte Worktree-Sessions',
        'claude remote-control --capacity 4         # Maximal 4 parallele Remote-Sessions'
      ]
    },
    tmux: {
      title: '4. Die Rolle von tmux im KI-Workflow',
      badge: 'Terminal-Multiplexer & Sichtbarkeit',
      summary:
        'Wer viel im Terminal arbeitet, nutzt tmux als unverzichtbare Betriebsschicht zwischen Betriebssystem und Claude Code – aus drei konkreten Gründen:',
      points: [
        {
          label: 'Persistenz & Entkopplung (Detach / Attach)',
          text: 'Lange Agenten-Läufe oder Remote-Control-Listener laufen in tmux weiter, selbst wenn sich das Terminal-Fenster schließt, die SSH-Verbindung abbricht oder du den Rechner wechselst.'
        },
        {
          label: 'Live-Split-Panes für Agent Teams',
          text: 'Im Modus teammateMode: "tmux" öffnet Claude für jeden parallel arbeitenden Agenten ein eigenes tmux-Pane. Du siehst gleichzeitig in Echtzeit, was jeder Agent denkt und testet.'
        },
        {
          label: 'Direkter Eingriff in jeden Strang',
          text: 'Anders als bei unsichtbaren Hintergrundprozessen kannst du jederzeit per Tastenkürzel (Ctrl+b) in jedes Agent-Pane wechseln, Outputs scrollen oder manuell eingreifen.'
        }
      ],
      commands: [
        'tmux new -s dev                            # Persistente Arbeits-Session anlegen',
        'tmux attach -t dev                         # Nach Trennung nahtlos wieder verbinden',
        'claude --teammate-mode tmux                # Agent Teams in sichtbare Split-Panes legen'
      ]
    },
    agents: {
      title: '5. Subagents vs. Sessions / Agent Teams',
      badge: 'Skalierung & Parallelität',
      summary:
        'Claude kennt zwei grundlegend verschiedene Wege, Arbeit aufzuteilen: leichtgewichtige Subagents innerhalb einer Session oder vollwertige parallele Sessions (inkl. Agent Teams).',
      points: [
        {
          label: 'Subagents (Kontext-Schutz & Delegation)',
          text: 'Kurzlebige Spezial-Helfer (z. B. Explore, Test-Runner, Code-Reviewer) innerhalb derselben Session. Sie durchsuchen hunderte Dateien in einem eigenen Context Window und liefern nur eine kompakte Summary zurück.'
        },
        {
          label: 'Parallele Sessions & Git Worktrees',
          text: 'Mehrere eigenständige Claude-Instanzen arbeiten gleichzeitig an verschiedenen Features/Bugs. Jede Session bekommt per --worktree einen isolierten Git-Branch und eigenen Ordner.'
        },
        {
          label: 'Agent Teams (Koordinierte Multi-Session)',
          text: 'Ein Team-Lead spawnt mehrere eigenständige Sessions (Teammates) mit gemeinsamer Task-Liste und direkter Inbox-Kommunikation untereinander – z. B. Frontend-, Backend- und Test-Agent parallel.'
        }
      ],
      commands: [
        'claude --worktree feature-auth             # Neue Session in isoliertem Git-Worktree',
        'CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1     # Koordinierte Agent Teams aktivieren',
        '# Subagents werden automatisch oder per Prompt ("Nutze einen Subagent für...") gespawnt'
      ]
    }
  };

  const activeInfo = pillarDetails[selectedPillar];

  const markdownSummary = `# Effektives Arbeiten mit Claude Code (Ökosystem & Architektur)

## 1. Oberflächen: Claude Desktop vs. Claude Code CLI
- **Claude Desktop (Code-Tab):** Visuelle Steuerung, Inline-Diffs, parallele Worktree-Sessions, Berechtigungs-UI.
- **Claude Code CLI:** Unix-Pipes (\`claude -p\`), Headless-Automatisierung, SSH, Skripte.
- **Wechsel:** \`/desktop\` (CLI → Desktop) und \`claude --resume\` (Desktop → CLI).

## 2. Gemeinsame Runtime (~/.claude/)
- \`CLAUDE.md\` für Projektregeln, \`~/.claude/plans/\` für Pläne, **Hooks** für deterministische Checks (Linter/Tests) nach Edits, **MCP** für externe Tools.

## 3. Remote Control (/rc)
- Verbindet die **lokale** Umgebung (Dateien, MCPs, Credentials) per ausgehendem HTTPS-Tunnel mit Browser/Smartphone.
- \`claude remote-control --spawn worktree\` startet pro Remote-Auftrag einen isolierten Git-Worktree.

## 4. tmux
- Hält CLI-Sessions & Remote-Control-Listener persistent (\`tmux attach\`).
- Visualisiert **Agent Teams** als parallele Split-Panes (\`--teammate-mode tmux\`).

## 5. Subagents vs. Sessions (Agent Teams)
- **Subagents:** Kurzlebige Helfer *innerhalb* einer Session; gekapselter Kontext; geben nur eine Summary an den Parent zurück (Einbahnstraße).
- **Sessions / Agent Teams:** Eigenständige Claude-Instanzen mit vollem Context Window, eigener Task-Liste, Peer-to-Peer-Messaging und Isolation über **Git Worktrees**.
`;

  const handleCopy = () => {
    navigator.clipboard.writeText(markdownSummary);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans p-4 md:p-8 selection:bg-indigo-500/30">
      <div className="max-w-6xl mx-auto space-y-8">
        
        {/* HEADER */}
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-6">
          <div>
            <div className="flex items-center space-x-2 text-indigo-400 text-xs font-semibold uppercase tracking-wider mb-1">
              <Sparkles size={14} />
              <span>Agentic Coding Architektur • Genereller Überblick</span>
            </div>
            <h1 className="text-2xl md:text-3xl font-bold text-slate-100">
              Wie man effektiv mit Claude Code arbeitet
            </h1>
            <p className="text-slate-400 text-sm mt-1 max-w-2xl">
              Zusammenspiel aus <strong className="text-slate-200">Claude Desktop</strong>, <strong className="text-slate-200">CLI</strong>, <strong className="text-cyan-300">Remote Control</strong>, <strong className="text-emerald-300">tmux</strong> sowie <strong className="text-amber-300">Subagents vs. Sessions/Worktrees</strong>.
            </p>
          </div>

          <button
            onClick={handleCopy}
            className="self-start md:self-auto flex items-center space-x-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 border border-slate-700 rounded-lg text-xs font-medium text-slate-300 transition-colors shadow-sm"
          >
            {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
            <span>{copied ? 'Als Markdown kopiert!' : 'Leitfaden als Markdown kopieren'}</span>
          </button>
        </header>

        {/* INTERACTIVE ARCHITECTURE DIAGRAM */}
        <section className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 md:p-6 shadow-xl">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-5">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400 flex items-center">
              <Workflow size={16} className="mr-2 text-indigo-400" />
              System-Architektur (Klicke auf einen Baustein für Technik-Details & Befehle)
            </h2>
            <span className="text-xs text-slate-500">Alle Bausteine greifen auf denselben lokalen Zustand zu</span>
          </div>

          {/* 3-Layer Visual Diagram */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
            
            {/* COLUMN A: USER INTERFACES & REMOTE */}
            <div className="lg:col-span-4 flex flex-col gap-3">
              {/* Desktop & CLI */}
              <div
                onClick={() => setSelectedPillar('surfaces')}
                className={`flex-1 rounded-xl p-4 border transition-all cursor-pointer ${
                  selectedPillar === 'surfaces'
                    ? 'bg-indigo-950/40 border-indigo-500 ring-1 ring-indigo-500/40'
                    : 'bg-slate-950/80 border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-indigo-400">
                    1. Steuerungs-Oberflächen
                  </span>
                  <ArrowLeftRight size={15} className="text-indigo-400" />
                </div>

                <div className="space-y-2.5">
                  <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 flex items-start space-x-2.5">
                    <Monitor size={16} className="text-indigo-400 shrink-0 mt-0.5" />
                    <div>
                      <div className="text-xs font-semibold text-slate-200">Claude Desktop (Code-Tab)</div>
                      <div className="text-[11px] text-slate-400">Visuelle Diffs, Session-Liste, Worktree-Buttons</div>
                    </div>
                  </div>

                  <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 flex items-start space-x-2.5">
                    <Terminal size={16} className="text-emerald-400 shrink-0 mt-0.5" />
                    <div>
                      <div className="text-xs font-semibold text-slate-200">Claude Code CLI (claude)</div>
                      <div className="text-[11px] text-slate-400">Terminal, Pipes (-p), SSH, Automation</div>
                    </div>
                  </div>
                </div>

                <div className="mt-3 pt-2 border-t border-slate-800/80 text-[11px] text-slate-400 flex justify-between">
                  <span>Wechsel jederzeit möglich:</span>
                  <code className="text-indigo-300">/desktop ↔ --resume</code>
                </div>
              </div>

              {/* Remote Control */}
              <div
                onClick={() => setSelectedPillar('remote')}
                className={`rounded-xl p-3.5 border transition-all cursor-pointer ${
                  selectedPillar === 'remote'
                    ? 'bg-cyan-950/35 border-cyan-500 ring-1 ring-cyan-500/40'
                    : 'bg-slate-950/80 border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-cyan-400 flex items-center">
                    <Smartphone size={14} className="mr-1.5" />
                    3. Remote Control (/rc)
                  </span>
                  <span className="text-[10px] bg-cyan-500/10 text-cyan-300 px-2 py-0.5 rounded">HTTPS-Tunnel</span>
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Steuert deine <strong>lokale</strong> Desktop- oder CLI-Session von Smartphone & Web (claude.ai/code) – inkl. lokaler Dateien & MCPs.
                </p>
              </div>
            </div>

            {/* COLUMN B: SHARED CORE ENGINE */}
            <div
              onClick={() => setSelectedPillar('engine')}
              className={`lg:col-span-4 rounded-xl p-4 border transition-all cursor-pointer flex flex-col justify-between ${
                selectedPillar === 'engine'
                  ? 'bg-amber-950/30 border-amber-500 ring-1 ring-amber-500/40'
                  : 'bg-slate-950/80 border-slate-800 hover:border-slate-700'
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-amber-400">
                    2. Shared Core Engine
                  </span>
                  <Cpu size={16} className="text-amber-400" />
                </div>

                <div className="p-3 rounded-lg bg-slate-900 border border-slate-800 mb-3">
                  <div className="text-xs font-semibold text-slate-100 mb-1">Agentic Loop (Identisch überall)</div>
                  <div className="text-[11px] text-slate-400">
                    Kontext sammeln → Plan entwerfen → Tools ausführen → Diffs prüfen → Tests/Hooks verifizieren.
                  </div>
                </div>

                <div className="space-y-2 text-[11px]">
                  <div className="p-2 rounded bg-slate-900/90 border border-slate-800/90 flex justify-between items-center">
                    <span className="text-slate-300 font-medium">Projekt-Gedächtnis</span>
                    <code className="text-amber-300">CLAUDE.md</code>
                  </div>
                  <div className="p-2 rounded bg-slate-900/90 border border-slate-800/90 flex justify-between items-center">
                    <span className="text-slate-300 font-medium">Persistente Sessions & Pläne</span>
                    <code className="text-amber-300">~/.claude/</code>
                  </div>
                  <div className="p-2 rounded bg-slate-900/90 border border-slate-800/90 flex justify-between items-center">
                    <span className="text-slate-300 font-medium">Auto-Checks & Externe Tools</span>
                    <code className="text-amber-300">Hooks + MCP</code>
                  </div>
                </div>
              </div>

              <div className="mt-4 pt-2.5 border-t border-slate-800/80 text-[11px] text-slate-400">
                Kein Vendor-Lock-in in der UI: Andere CLI-Agents (Codex CLI, OpenCode, Aider) folgen demselben Prinzip (<code className="text-slate-300">AGENTS.md</code> + MCP).
              </div>
            </div>

            {/* COLUMN C: SCALING (TMUX, SUBAGENTS, SESSIONS/WORKTREES) */}
            <div className="lg:col-span-4 flex flex-col gap-3">
              {/* Subagents vs Sessions */}
              <div
                onClick={() => setSelectedPillar('agents')}
                className={`flex-1 rounded-xl p-4 border transition-all cursor-pointer ${
                  selectedPillar === 'agents'
                    ? 'bg-rose-950/30 border-rose-500 ring-1 ring-rose-500/40'
                    : 'bg-slate-950/80 border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-rose-400">
                    5. Parallelisierung & Isolation
                  </span>
                  <Users size={16} className="text-rose-400" />
                </div>

                <div className="space-y-2.5">
                  <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-indigo-300">Subagents (In-Session)</span>
                      <span className="text-[10px] text-slate-500">1 Session</span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1">
                      Gekapselte Recherche-/Test-Helfer; liefern nur eine Summary an den Haupt-Agent zurück.
                    </p>
                  </div>

                  <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-rose-300">Sessions & Agent Teams</span>
                      <span className="text-[10px] text-emerald-400 flex items-center">
                        <GitBranch size={11} className="mr-1" /> Worktrees
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1">
                      Unabhängige Claude-Instanzen mit eigenem Context Window & Git-Worktree (keine Dateikonflikte).
                    </p>
                  </div>
                </div>
              </div>

              {/* tmux */}
              <div
                onClick={() => setSelectedPillar('tmux')}
                className={`rounded-xl p-3.5 border transition-all cursor-pointer ${
                  selectedPillar === 'tmux'
                    ? 'bg-emerald-950/35 border-emerald-500 ring-1 ring-emerald-500/40'
                    : 'bg-slate-950/80 border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-emerald-400 flex items-center">
                    <LayoutGrid size={14} className="mr-1.5" />
                    4. tmux Multiplexing
                  </span>
                  <span className="text-[10px] bg-emerald-500/10 text-emerald-300 px-2 py-0.5 rounded">Persistenz & Panes</span>
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Hält Sessions & Remote-Listener dauerhaft aktiv und zeigt Agent-Teams in parallelen Split-Panes live an.
                </p>
              </div>
            </div>
          </div>

          {/* DETAIL INSPECTOR FOR SELECTED PILLAR */}
          <div className="mt-5 bg-slate-950 border border-slate-800 rounded-xl p-4 md:p-5">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <h3 className="text-base font-semibold text-slate-100">{activeInfo.title}</h3>
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-slate-800 text-indigo-300 border border-slate-700">
                {activeInfo.badge}
              </span>
            </div>
            <p className="text-sm text-slate-300 mb-4">{activeInfo.summary}</p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
              {activeInfo.points.map((pt, i) => (
                <div key={i} className="bg-slate-900/90 border border-slate-800 rounded-lg p-3">
                  <div className="text-xs font-semibold text-slate-200 mb-1">{pt.label}</div>
                  <div className="text-xs text-slate-400 leading-relaxed">{pt.text}</div>
                </div>
              ))}
            </div>

            <div className="bg-slate-900 border border-slate-800/90 rounded-lg p-3 font-mono text-xs text-slate-300 space-y-1 overflow-x-auto">
              {activeInfo.commands.map((cmd, idx) => (
                <div key={idx} className="whitespace-pre">{cmd}</div>
              ))}
            </div>
          </div>
        </section>

        {/* SECTION 2: SUBAGENTS VS. SESSIONS / AGENT TEAMS */}
        <section className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
            <div>
              <h2 className="text-lg font-semibold text-slate-100 flex items-center">
                <Layers size={18} className="mr-2 text-rose-400" />
                Deep-Dive: Subagents vs. Sessions (Agent Teams)
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Wann delegiert die KI an einen Subagent und wann startet sie eine eigene Session?
              </p>
            </div>

            <div className="flex bg-slate-950 p-1 rounded-lg border border-slate-800 self-start">
              <button
                onClick={() => setTopologyMode('comparison')}
                className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                  topologyMode === 'comparison' ? 'bg-slate-800 text-slate-100' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Direkt-Vergleich
              </button>
              <button
                onClick={() => setTopologyMode('visual')}
                className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                  topologyMode === 'visual' ? 'bg-slate-800 text-slate-100' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Topologie & Zweck
              </button>
            </div>
          </div>

          {topologyMode === 'comparison' ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400">
                    <th className="py-2.5 pr-4 font-semibold">Dimension</th>
                    <th className="py-2.5 px-4 font-semibold text-indigo-300">Subagents (Delegation)</th>
                    <th className="py-2.5 pl-4 font-semibold text-rose-300">Sessions & Agent Teams</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70 text-slate-300">
                  <tr>
                    <td className="py-3 pr-4 font-medium text-slate-400">Lebenszyklus</td>
                    <td className="py-3 px-4">Kurzlebig; existiert nur für einen Teilauftrag innerhalb der Haupt-Session.</td>
                    <td className="py-3 pl-4">Eigenständige, vollwertige Claude-Instanz mit eigener Session-ID und Historie.</td>
                  </tr>
                  <tr>
                    <td className="py-3 pr-4 font-medium text-slate-400">Context Window</td>
                    <td className="py-3 px-4">Isoliert, um den Hauptkontext nicht mit Such-/Log-Müll zu fluten.</td>
                    <td className="py-3 pl-4">Volles eigenes Context Window für komplexe Teilprojekte.</td>
                  </tr>
                  <tr>
                    <td className="py-3 pr-4 font-medium text-slate-400">Kommunikation</td>
                    <td className="py-3 px-4"><strong>Einbahnstraße:</strong> Meldet nur das Endergebnis (Summary) an den Parent-Agent.</td>
                    <td className="py-3 pl-4"><strong>Peer-to-Peer:</strong> Gemeinsame Task-Liste + direkte Nachrichten (Inbox) zwischen Teammates.</td>
                  </tr>
                  <tr>
                    <td className="py-3 pr-4 font-medium text-slate-400">Dateisystem / Git</td>
                    <td className="py-3 px-4">Arbeitet im selben Verzeichnis wie die Haupt-Session (meist lesend).</td>
                    <td className="py-3 pl-4">Jede Session nutzt idealerweise einen eigenen <strong>Git Worktree</strong> (kein Überschreiben).</td>
                  </tr>
                  <tr>
                    <td className="py-3 pr-4 font-medium text-slate-400">Optimaler Einsatz</td>
                    <td className="py-3 px-4">Codebase durchsuchen, Stacktraces analysieren, Tests ausführen, Security-Check.</td>
                    <td className="py-3 pl-4">Parallele Features (API + UI + Tests), große Migrationen, konkurrierende Hypothesen.</td>
                  </tr>
                </tbody>
              </table>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-3">
                <div className="font-semibold text-indigo-300 flex items-center justify-between">
                  <span>Hub & Spoke: Haupt-Session + Subagents</span>
                  <span className="text-[10px] bg-indigo-500/10 px-2 py-0.5 rounded">Kontext-Hygiene</span>
                </div>
                <div className="p-3 rounded-lg bg-slate-900 border border-slate-800 font-mono text-[11px] text-slate-300 leading-relaxed">
                  <div>[Haupt-Session (Architekt)]</div>
                  <div className="text-slate-500"> ├──▶ Subagent A (Explore: Auth-Dateien suchen)</div>
                  <div className="text-slate-500"> │     └──▶ liefert 15 Zeilen Summary zurück</div>
                  <div className="text-slate-500"> ├──▶ Subagent B (Test-Runner: Logs filtern)</div>
                  <div className="text-slate-500"> │     └──▶ liefert nur Fehlerursache zurück</div>
                  <div className="text-indigo-300"> └──▶ Haupt-Session bleibt schlank & fokussiert!</div>
                </div>
                <p className="text-slate-400">
                  <strong>Warum wichtig:</strong> Ohne Subagents füllen 30 gelesene Dateien sofort das Context Window und die Qualität der KI sinkt („Context Rot“).
                </p>
              </div>

              <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-3">
                <div className="font-semibold text-rose-300 flex items-center justify-between">
                  <span>Mesh: Parallele Sessions & Agent Teams</span>
                  <span className="text-[10px] bg-rose-500/10 px-2 py-0.5 rounded">Echte Parallelität</span>
                </div>
                <div className="p-3 rounded-lg bg-slate-900 border border-slate-800 font-mono text-[11px] text-slate-300 leading-relaxed">
                  <div>[Shared Task List + Inbox]</div>
                  <div className="text-emerald-400"> ├── Session 1 (Worktree: feat/api) ◀──▶</div>
                  <div className="text-cyan-400"> ├── Session 2 (Worktree: feat/ui)  ◀──▶</div>
                  <div className="text-amber-400"> └── Session 3 (Worktree: tests)    ◀──▶</div>
                  <div className="text-slate-400 mt-1">Alle 3 laufen gleichzeitig (Desktop-Tabs / tmux-Panes)</div>
                </div>
                <p className="text-slate-400">
                  <strong>Warum wichtig:</strong> Durch Git Worktrees hat jede Session ihr eigenes Arbeitsverzeichnis. Du kannst 3 Aufgaben parallel vorantreiben und einzeln mergen.
                </p>
              </div>
            </div>
          )}
        </section>

        {/* SECTION 3: THE OPTIMAL 4-STEP DAILY WORKFLOW */}
        <section className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6">
          <h2 className="text-lg font-semibold text-slate-100 mb-1 flex items-center">
            <Play size={18} className="mr-2 text-emerald-400" />
            Der optimale Tages-Workflow in der Praxis
          </h2>
          <p className="text-xs text-slate-400 mb-5">
            Dieses Muster hat sich bei erfahrenen Entwicklern als produktivster Standard etabliert:
          </p>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-amber-400">Schritt 1 • Fundament</span>
                <ShieldCheck size={15} className="text-amber-400" />
              </div>
              <h3 className="text-sm font-semibold text-slate-100 mb-1.5">CLAUDE.md & Hooks</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Lege Build-/Test-Befehle und Architektur-Regeln in <code className="text-slate-300">CLAUDE.md</code> ab. Richte Post-Edit-Hooks ein, damit Linter und Compiler Fehler sofort automatisch an Claude zurückmelden.
              </p>
            </div>

            <div className="bg-slate-950 border border-slate-800 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-indigo-400">Schritt 2 • Plan Mode</span>
                <MessageSquare size={15} className="text-indigo-400" />
              </div>
              <h3 className="text-sm font-semibold text-slate-100 mb-1.5">Erst planen, dann coden</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Starte im <strong>Plan Mode</strong> (<code className="text-slate-300">Shift+Tab</code>). Claude nutzt Subagents zur Analyse, schreibt einen Plan in <code className="text-slate-300">~/.claude/plans/</code> und ändert noch keine Zeile Code, bis du den Plan abnickst.
              </p>
            </div>

            <div className="bg-slate-950 border border-slate-800 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-rose-400">Schritt 3 • Isolation</span>
                <GitBranch size={15} className="text-rose-400" />
              </div>
              <h3 className="text-sm font-semibold text-slate-100 mb-1.5">Worktrees & Parallelität</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Öffne in Claude Desktop (oder per <code className="text-slate-300">--worktree</code> in <code className="text-slate-300">tmux</code>) für unabhängige Aufgaben separate Worktree-Sessions. So blockiert ein langlaufender Umbau nicht deine schnelle Bugfix-Session.
              </p>
            </div>

            <div className="bg-slate-950 border border-slate-800 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-cyan-400">Schritt 4 • Review & /rc</span>
                <Zap size={15} className="text-cyan-400" />
              </div>
              <h3 className="text-sm font-semibold text-slate-100 mb-1.5">Diff-Abnahme & Mobil</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Prüfe die Änderungen in Claude Desktop, nutze <code className="text-slate-300">/clear</code> zwischen unzusammenhängenden Aufgaben für frischen Kontext und schalte <code className="text-slate-300">/rc</code> zu, wenn du den Schreibtisch verlässt.
              </p>
            </div>
          </div>
        </section>

      </div>
    </div>
  );
}