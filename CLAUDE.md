## Behavioral Rules

- **Tasks:** Use `TaskCreate`/`TaskUpdate` tools — never manually edit `ai/todo.md`. The hook handles formatting and timestamps.
- **Task IDs:** Session-local IDs (#1, #2) from TaskCreate are NOT the same as `ai/todo.md` T### IDs. Read `ai/todo.md` for real IDs when saving checkpoints.
- **Checkpoints:** Append to current checkpoint — don't create new ones each save.
- **TTS:** When Ryan says "speak", "use TTS", or any voice request — use `k_tts(action="speak", text="...")`. No other method.
- **PTY reads:** Use `max_lines=5-10` for `k_pty term_read`. Start small.
- **Null redirection:** This is Windows with bash shell. Use `>/dev/null` not `>nul` (creates literal file).
- **MCP search priority:** When Kuroryuu MCP is connected: k_rag → k_repo_intel → git → Glob/Grep fallback.
- **Deprecated files:** Never use `ai/progress.md` or `ai/feature_list.json`.

## Polymathic Agents — When to Use

29 thinking agents in `.claude/agents/polymathic-*.md`. Each applies a historical figure's cognitive architecture as structural constraints on reasoning. They are **read-only consultants** (Read, Glob, Grep, Bash) — they analyze and advise, they don't edit files.

### By Use Case

**Code & Architecture**
| Agent | When to spawn |
|-------|--------------|
| **carmack** | Performance bottlenecks, systems architecture, code review, technical feasibility — finds the real constraint before optimizing |
| **linus** | Code review, taste assessment, BS detection, maintainability — demands working code and structural elegance |
| **tesla** | Systems architecture, infrastructure design, API design, diagnosing complex failures — complete mental model before any implementation |
| **shannon** | API design, architecture simplification, finding hidden structure, compression — strips to the invariant skeleton |

**Design Patterns (Gang of Four)**
| Agent | When to spawn |
|-------|--------------|
| **gamma** | Code architecture, API design, framework evaluation — refactor TO patterns after feeling pain, composition over inheritance, Rule of Three, pattern removal |
| **helm** | Architectural evaluation, enterprise design, pattern tradeoffs — engineering handbook lookup, behavioral contracts, explicit tradeoff analysis |
| **johnson** | Framework design, library architecture, refactoring strategy — three concrete examples before abstracting, frameworks = components + patterns |
| **vlissides** | Complex domain architecture, multi-pattern design, pattern evolution — discover pattern constellations the domain demands, bridge knowing-applying gap |

**Product & UX**
| Agent | When to spawn |
|-------|--------------|
| **jobs** | Product vision, UX simplification, feature pruning, "is this insanely great?" — taste-first, kill 70% of features |
| **rams** | Product design, UI simplification, design audits — less but better, 10 Principles scoring |
| **vangogh** | UI/UX, color systems, emotional design, dashboards — feeling before function, color as engineered language |
| **disney** | Experience design, creative strategy, storyboarding — Dreamer/Realist/Critic triad, then Plus it |

**Strategy & Decisions**
| Agent | When to spawn |
|-------|--------------|
| **bezos** | Customer-obsessed design, decision speed, product strategy — write the press release first, two-way vs one-way doors |
| **thiel** | Contrarian analysis, monopoly strategy, category creation — find secrets others miss, zero-to-one thinking |
| **gates** | Platform strategy, ecosystem design, deep analysis, competitive moats — decompose into atoms, model before betting |
| **andreessen** | Market timing, technology adoption, platform shifts, contrarian bets — spot discontinuities, not incremental improvements |
| **suntzu** | Competitive strategy, positioning, resource allocation — win before fighting, terrain analysis, intelligence first |
| **musk** | Moonshot feasibility, requirement questioning, aggressive simplification — question every requirement, delete before optimize |

**Thinking & Analysis**
| Agent | When to spawn |
|-------|--------------|
| **feynman** | Debugging, learning new domains, explaining complex concepts, detecting cargo cult thinking — first principles, freshman test |
| **tao** | Complex problem decomposition, cross-domain connections, research strategy — 3+ strategies before committing, toy models |
| **munger** | Decision frameworks, risk analysis, bias detection — invert every problem, latticework of mental models, Lollapalooza detection |
| **socrates** | Assumption testing, requirement validation, exposing hidden ignorance — elenctic questioning until contradictions emerge |
| **lovelace** | Technology visioning, system abstraction, cross-domain synthesis — "what else has this structure?" operational patterns |
| **davinci** | Cross-disciplinary synthesis, bio-inspired design, innovation audits — observe mechanism, find the cross-domain analog |
| **aurelius** | Decision-making under pressure, resilience, perspective — dichotomy of control, obstacle is the way |

**Marketing & Content**
| Agent | When to spawn |
|-------|--------------|
| **ogilvy** | Copywriting, ad strategy, persuasive writing — research first, headline is 80% of the work, promise a specific benefit |
| **godin** | Marketing strategy, audience building, positioning — smallest viable audience, worldview-first, permission over interruption |
| **graham** | Startup strategy, product-market fit, writing to think — observe real behavior, do things that don't scale |
| **mrbeast** | Content strategy, attention engineering, retention optimization — hook evaluation, 50+ thumbnail variants, retention curves |

### How to Invoke

Spawn via the Agent tool with `subagent_type` matching the agent name (e.g., `polymathic-feynman`). They run on Sonnet for speed. Stack multiple agents in parallel for richer analysis — e.g., spawn `carmack` + `feynman` + `linus` simultaneously on the same code question for three different lenses.
