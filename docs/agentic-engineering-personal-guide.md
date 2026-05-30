# Agentic Engineering for the Single Developer

*A pragmatic guide for medium-sized, iteration-heavy projects (10k–100k LOC).*

This document is opinionated. It tells you what to do, what not to do, and why — calibrated specifically to a single developer working on projects that are too big for vibe-coding but too small for any of the enterprise SDD frameworks. Every recommendation includes the rationale and an explicit note about what alternative was rejected and why. It is deliberately not balanced: the survey document covers the field; this one covers what you should actually do tomorrow morning.

The core thesis: at your scale, **most of the SDD methodology overhead is wrong, but three or four of the underlying patterns are transformative**. The methodology vendors are selling process. You need patterns.

---

## Table of Contents

1. [Your Situation Precisely](#1-your-situation-precisely)
2. [The Minimum Viable Stack](#2-the-minimum-viable-stack)
3. [Pattern 1 — The Constitution / CLAUDE.md File](#3-pattern-1--the-constitution--claudemd-file)
4. [Pattern 2 — The References Corpus](#4-pattern-2--the-references-corpus)
5. [Pattern 3 — On-Demand Spec Workflow](#5-pattern-3--on-demand-spec-workflow)
6. [Pattern 4 — Cross-Model Review](#6-pattern-4--cross-model-review)
7. [The Daily Workflow](#7-the-daily-workflow)
8. [The Iteration Loop](#8-the-iteration-loop)
9. [Multi-Modal Inputs](#9-multi-modal-inputs)
10. [What to Deliberately Not Do (With Rationale)](#10-what-to-deliberately-not-do-with-rationale)
11. [Tooling Choices](#11-tooling-choices)
12. [Cost Control](#12-cost-control)
13. [Cognitive Debt Mitigation](#13-cognitive-debt-mitigation)
14. [Migration Plan for Existing Projects](#14-migration-plan-for-existing-projects)
15. [Maintenance Over Time](#15-maintenance-over-time)
16. [When to Break Your Own Rules](#16-when-to-break-your-own-rules)
17. [Templates and Starter Files](#17-templates-and-starter-files)
18. [Common Failure Modes and Recoveries](#18-common-failure-modes-and-recoveries)
19. [The Honest Six-Month View](#19-the-honest-six-month-view)

---

## 1. Your Situation Precisely

You are a single developer working on projects in the 10k–100k LOC range with medium complexity and heavy iteration. This is a specific position in the agentic-coding landscape and it matters because most of the published advice is aimed at someone else.

The position you are *not* in: you are not a vibe-coder shipping toys (your projects are too large and live too long for "throw prompts and hope"); you are not a Big Tech team that needs ceremony for cross-team coordination (you are the only stakeholder); you are not a regulated-industry developer where audit trail is the dominant constraint (you can use your judgment); you are not Cloudflare or StrongDM where the team is small but the engineering rigor is industrial-grade.

What this means practically: methodologies designed for teams (BMAD, Spec Kit's full eight-phase workflow, AI/works™) impose ceremony you do not need. Methodologies designed for narrow elite teams (Dark Factory, Tessl's spec-as-source) demand validation infrastructure you cannot afford to build alone. Vibe-coding patterns from Twitter cause real damage at your codebase size — the bugs accumulate faster than you can review them.

What works for you sits in the middle. The patterns that high-output senior practitioners (Steinberger, Willison) actually use map cleanly to your scale because they too work largely alone or in very small teams on serious projects. The four primary patterns this document builds on — a constitution file, a references corpus, an on-demand spec workflow, and cross-model review — are all *theirs*, not the vendor frameworks'.

The other defining feature is "heavy iteration." This rules out anything front-loaded: BMAD's analyst-to-PM-to-architect chain takes too long when you are going to discover constraints in the implementation phase that invalidate the plan. The cost of revising specs is high in those frameworks; the cost of revising specs in the patterns this guide recommends is low. That asymmetry is everything for iterative work.

---

## 2. The Minimum Viable Stack

Here is the entire setup you need. Everything else in this document elaborates on these pieces.

A **CLAUDE.md** (or **AGENTS.md**) file at the root of every project, containing your stack choices, your quality bar, your conventions, and your prohibited dependencies. Read by the agent every session. This is your spec, your style guide, and your institutional memory rolled into one. (Pattern 1.)

A **`references/` folder** in every non-trivial project, containing small working examples of the patterns you care about — error handling, logging, API client, test setup, configuration, database access. Linked from CLAUDE.md. This is the highest-leverage move you can make and the one most absent from vendor marketing because nobody can productize it. (Pattern 2.)

A **conversational workflow** with your agent that produces specs **on demand** when ambiguity is costly, and proceeds directly to implementation when it isn't. No phase gates, no slash command ceremony, no multi-agent orchestration. Talk to it. Steer when needed. Review the diff. (Pattern 3.)

A **second-model review habit** for anything non-trivial — paste the spec and the diff into a different model family (if you use Claude, use GPT or Gemini for review; if you use GPT, use Claude). Even one cross-model review catches a meaningful fraction of the failures where the implementer talked itself into a wrong solution. (Pattern 4.)

That's it. Total setup cost: about two hours for the initial CLAUDE.md and a starter references folder. Ongoing cost: a few minutes per session to keep the constitution current and the references growing. Cost as percentage of your time: under 5%. Cost as percentage of value: enormous, and compounding.

Everything below is rationale, detail, templates, failure modes, and what to *not* do — because the absence is as load-bearing as the presence.

---

## 3. Pattern 1 — The Constitution / CLAUDE.md File

The single highest-value artifact in your setup. A markdown file at the root of your project that the agent reads before every task. It encodes everything that is true about *this* project across sessions, so you do not have to re-explain context every time.

### 3.1 What goes in it

Five sections that justify their existence at every project scale you will work at:

**Stack and versions.** Exact framework choices, exact runtime versions, package manager, build tool, test framework. Be specific. *"TypeScript 5.4 strict mode, Node 22 LTS, Vite 5, Vitest, pnpm"* is correct. *"Modern TypeScript stack"* is not. The reason: model training data lags by months and silently mis-uses APIs that have changed; specifying versions prevents the agent from defaulting to outdated patterns.

**Quality bar.** Coverage thresholds, formatting rules, what's allowed and prohibited. *"Coverage must not regress below current values; no `any` in production code; no `as unknown as`; ESLint rules in `.eslintrc` are enforced; do not disable them locally"*. The reason: without explicit thresholds the agent optimizes for "code that runs," which is a much lower bar than "code that survives in your repo for a year."

**Conventions and idioms.** How you structure files, how you name things, what your error-handling pattern looks like, what your logging shape is, how you do dependency injection. Cross-reference your references folder here: *"For error handling see `references/errors/`. For API clients see `references/api-client/`. Match those patterns unless the new domain requires a deviation, in which case explain the deviation in the diff."*

**Hard prohibitions.** Dependencies you've explicitly rejected, patterns that broke in past projects, anything the agent has tried before and got wrong. *"Do not introduce Redux. Do not use Lodash — prefer native ES methods. Do not generate React class components. Do not use Axios — use native fetch with our `apiClient` wrapper."*

**Operational constraints.** Where logs go, how secrets are loaded, how the dev server starts, where to put new files. *"Logs go to stdout via the `logger` in `src/lib/logger.ts`. Secrets are loaded from `.env.local` via `src/config/env.ts`. New routes go in `src/routes/`."* The reason: this is where the agent will otherwise make plausible-but-wrong choices on every new file.

### 3.2 What does not go in it

Don't restate things obvious from the codebase. The agent can read your `package.json` — it doesn't need a section in CLAUDE.md listing your dependencies. The agent can see your file structure — it doesn't need an ASCII tree.

Don't write a tutorial. CLAUDE.md is for the agent, not for a new human teammate. Skip the *"This project is a CRM that helps small businesses..."* paragraph; the agent will infer it from the code and the README. Every word in CLAUDE.md gets loaded on every session — it's context-budget-expensive.

Don't write aspirational rules you don't enforce. If your CLAUDE.md says *"100% test coverage"* but your actual repo is at 40%, the agent will either obey the rule and refuse useful work, or ignore it and lose calibration for the *other* rules. Rules in CLAUDE.md must match observable reality.

### 3.3 The growth pattern

CLAUDE.md starts at maybe 50-80 lines on day one. Over six months of work it will grow to 300-500 lines as you accumulate rules. This is normal. Steinberger's is around 800 lines, calls it *"organizational scar tissue,"* and notes that despite the size it works well because every line was added in response to something that went wrong.

The rule for additions: when the agent makes the same mistake twice, add a rule. *"After fixing a bug where the agent used `console.log` instead of our logger for the third time, add: 'NEVER use console.log directly; always use the logger from src/lib/logger.ts.'"* This is how the file accumulates value.

The rule for deletions: when a model upgrade makes a rule obsolete, delete it. Earlier Claude 3.7 versions needed explicit guidance on Tailwind 4 because it was newer than their training cutoff; Sonnet 4.5 and later versions know Tailwind 4 natively, so that rule can be removed. Lean is good; bloated CLAUDE.md files waste context budget you would rather spend on the actual task.

### 3.4 Why this, not Spec Kit's `/speckit.constitution`

Spec Kit's constitution serves the same conceptual role but lives inside `.specify/memory/constitution.md` with prescribed templates and a CLI to manage it. For your scale this is overhead with no benefit. The CLAUDE.md file works with every agent (Claude Code, Cursor, Codex, Gemini CLI, Cline), is plain markdown you can edit directly, has no tool dependency, and travels with your repo. The Spec Kit version locks you into a specific tooling stack and adds nothing functional.

**Rationale for the rejection:** Spec Kit's constitution gives you an opinionated template structure (sections it expects, validation rules, integration with `/speckit.analyze`). That structure is helpful for teams aligning multiple developers' AI work. For a single developer, the structure becomes a constraint without a benefit. The free-form CLAUDE.md you maintain by hand evolves with your needs; the Spec Kit constitution evolves with their template updates.

### 3.5 Symlink trick for cross-agent compatibility

The agent ecosystem has not converged on a single filename. Claude Code reads `CLAUDE.md`. Most other agents read `AGENTS.md`. Some read `GEMINI.md` or `.cursorrules`. The clean solution is to maintain one canonical file (call it `AGENTS.md` — that's the de-facto emerging standard) and symlink the others to it:

```bash
ln -s AGENTS.md CLAUDE.md
ln -s AGENTS.md GEMINI.md
```

Edit `AGENTS.md`; the others update automatically. The CLAUDE.md-vs-AGENTS.md distinction is currently the most annoying friction in the cross-agent world; the symlink approach eliminates it for the next year or so until one filename wins.

---

## 4. Pattern 2 — The References Corpus

This is the pattern Simon Willison calls *"hoard things you know how to do"* and it is the most under-appreciated pattern in the entire SDD discourse. It costs nothing to start, compounds over time, and at your scale it is genuinely transformative.

### 4.1 The structure

Create a `references/` folder at the root of every non-trivial project. Inside it, each *canonical pattern* gets its own subfolder containing a minimal working example. The structure is hierarchical, evolved over time:

```
references/
├── README.md                    ← index + when to point at which reference
├── errors/
│   ├── README.md                ← why this pattern, what alternatives we rejected
│   ├── ApiError.ts              ← the error class hierarchy
│   ├── error-middleware.ts      ← the Express/Hono middleware
│   └── errors.test.ts           ← how we test error responses
├── api-client/
│   ├── README.md
│   ├── client.ts
│   ├── client.test.ts
│   └── mocking.ts               ← how we mock HTTP in tests
├── logging/
│   ├── README.md
│   └── logger-example.ts
├── config/
│   ├── README.md
│   └── env.ts                   ← env loading with zod validation
└── testing/
    ├── README.md
    ├── unit-test-example.ts
    ├── integration-test-example.ts
    └── e2e-test-example.ts
```

The agent reads `references/README.md` first (linked from CLAUDE.md), then drills into the relevant subfolder when a task touches that pattern.

### 4.2 What a single reference looks like

A reference is small, complete, and explanatory. Not toy-small (10 lines that don't compile); production-small (50-150 lines that work and capture the real conventions). Take `references/errors/`:

The `README.md` explains the *why*:

```markdown
# Error Handling Pattern

We use a single ApiError class hierarchy across all routes. The middleware
catches anything thrown, maps to HTTP status, and produces a consistent
JSON shape: `{ error: { code, message, details? } }`.

## What we rejected
- Per-route try/catch. Too repetitive. Easy to forget.
- Throwing raw Error. Lost the structured info downstream.
- Custom Result<T, E> monad. Considered. Decided against — too much
  TypeScript friction for the benefit at this codebase size.

## When to extend
New error categories get a new subclass of ApiError. Do not invent
parallel error hierarchies. If a route needs custom handling beyond
the middleware, document why in a comment.
```

The actual code files demonstrate the pattern in 50-150 lines of real, runnable code. The test file shows how this pattern is tested. The agent learns idioms from the code far more effectively than from prose descriptions.

### 4.3 How you use it

The reference corpus changes what a typical prompt looks like. Instead of:

> *"Add error handling to the new `/payments` route. Make sure errors are caught, logged, and converted to appropriate HTTP responses with consistent JSON shape including error code, message, and optional details."*

You write:

> *"Add error handling to the new `/payments` route. Follow the pattern in `references/errors/`. Specifically, define payment-domain errors as subclasses of ApiError, throw them where the business logic fails, and rely on the existing middleware to handle the response. Update the tests to follow the pattern in `references/errors/errors.test.ts`."*

The second prompt is *more* specific while being *shorter*. The agent gets unambiguous direction. The output matches house style without you specifying every convention. Review becomes diff-against-reference rather than judge-from-scratch.

The pattern extends naturally:

> *"This payments service needs API client patterns. Read `references/api-client/` and apply the same shape — same retry config, same auth header injection, same error mapping. Differences only where Stripe's API requires them, and explain those differences in code comments."*

> *"Add structured logging throughout the new payments service. Use the logger and conventions from `references/logging/`. Log levels, structured fields, redaction rules — all match the reference. Add new fields only where the payments domain requires them."*

### 4.4 What goes into references

Start with the architectural concerns that every non-trivial feature touches:

- Error handling
- Logging  
- API clients (outbound HTTP)
- Configuration loading and validation
- Database access (queries, transactions, migrations)
- Test setup (unit, integration, E2E)
- Authentication and authorization
- Caching
- Background jobs / queues
- Observability (metrics, traces)
- HTTP handlers / route patterns

You will probably not need all of these on day one. Start with the three or four that come up most often in your actual work and grow the corpus organically.

### 4.5 Maintenance

Two rules keep the corpus healthy.

**When you discover a better pattern, update the reference.** If you refactor your error handling because the old approach didn't scale, update `references/errors/` immediately and add a note in its README about what changed and why. The references are the *current canonical patterns*, not historical artifacts.

**When the agent's output is good and diverges from the reference, decide which is canonical.** Sometimes the agent will propose a refinement to your pattern that is genuinely better. If you accept it into the codebase, update the reference. Otherwise reject and steer back. The worst failure mode is *multiple parallel patterns* drifting across the codebase because you accepted divergence without updating the reference.

### 4.6 The compounding effect

After three months of work in one project, you will have 8-12 references covering most architectural concerns. After a year, 15-20 covering nearly everything. The marginal feature now requires almost no architectural specification — *"do it like X, the differences are Y"* covers most cases.

Across projects, references partially transfer. The error-handling reference for your Node API will work as a starting point for the next Node API; the test-setup reference works across most TS projects of similar shape. After a few projects you have a personal library of canonical patterns that you carry forward. This is the actual leverage of agentic engineering for a serious individual developer.

### 4.7 Why this, not BMAD or Spec Kit templates

BMAD's multi-agent flow produces architectural artifacts (PRD, ADRs, story specs) that *describe* patterns in prose. Spec Kit's plan phase produces similar prose. Both are vastly inferior to working code as the canonical source.

**Rationale for the rejection:** Prose descriptions of patterns are imprecise, incomplete (no language can specify every convention a working example demonstrates), and not testable. Code references are precise, complete (every convention is encoded in the running code), and testable (you can run the reference, modify it, see what breaks). The agent learns idioms from code orders of magnitude faster than from prose, because code is what it generates.

### 4.8 Why this, not external pattern catalogs

You might be tempted to use a community pattern catalog (refactoring.guru, patterns.dev, etc.) as your reference. Don't. The references must be *yours* — your idioms, your stack, your specific opinions. External catalogs are too abstract and contain patterns you've rejected (singletons, observers, factories — patterns you may explicitly want to avoid). The reference corpus encodes *your taste*, which is the part nobody else can give you.

---

## 5. Pattern 3 — On-Demand Spec Workflow

The most important behavioral pattern. The rule is simple: write a spec when ambiguity costs more than the spec-writing time, and skip it otherwise. The hard part is recognizing which is which.

### 5.1 The decision rule

A specification is worth writing when:

- The agent could plausibly interpret the requirement multiple ways and you would notice the wrong interpretation only after significant work.
- The task touches multiple files or systems and the wrong architecture is expensive to undo.
- You will want to come back to this decision later and need a record of *why* you chose a particular approach.
- The task is large enough that you will not finish it in one session and need to preserve context.

A specification is *not* worth writing when:

- The task is small enough to verify in one read of the diff.
- You can fix a misunderstanding with one follow-up prompt.
- The requirement is genuinely obvious from the existing code.
- You are exploring — when you don't yet know what you want, writing a spec ossifies the wrong commitment.

Augment Code's heuristic is the cleanest formulation: *"If I'd be annoyed to have the agent interpret requirements differently than I meant, I write the spec. If I could fix the output in a quick follow-up prompt, I skip the spec."*

### 5.2 What a small spec looks like

For most tasks at your scale, the spec is 10-30 lines and lives either in a chat prompt or in a temporary markdown file. It is not a Spec Kit `spec.md`. It is a focused statement of *what's new in this task*. Example for a feature that needs a real spec:

```markdown
## Feature: Bulk import users from CSV

### Why
Customer-success team is uploading hundreds of users at a time via the
admin UI; the current one-at-a-time flow takes ~30 minutes per batch.

### Acceptance criteria
- Endpoint POST /admin/users/bulk accepts a CSV file (multipart upload)
- Required columns: email, role, team_id. Optional: name, department.
- Validation: each row validated against the same zod schema as
  POST /admin/users. Invalid rows do not abort the batch; they are
  reported per-row in the response.
- Response shape: { created: N, errors: [{ row, field, message }] }
- Maximum batch size: 1000 rows. Larger files return 413.
- Transactional behavior: all-or-nothing per batch. Use a single DB
  transaction; if any row insertion (other than validation-failed
  rows) errors, the whole batch rolls back.

### References
- POST /admin/users handler in src/routes/admin/users.ts (the validation
  schema and the insert flow to mirror).
- references/errors/ for error shape.
- references/api-client/ does not apply (this is server-side).

### Non-goals
- Update of existing users via CSV. Insertion only.
- Async/background processing. This is synchronous; if the file is
  too big for the request timeout, that's a 413.
```

This is what fits in a chat prompt. Twenty lines. References existing code and existing patterns. Specifies what's *new* (the CSV ingestion, the per-row error reporting, the transactional behavior) and explicitly excludes scope creep (async, updates).

### 5.3 What a large spec looks like

For genuinely large changes — a new subsystem, a major refactor, a third-party integration that touches several modules — the spec moves into a file in the repo. A reasonable structure, borrowed from OpenSpec's delta pattern but stripped down:

```
specs/
├── 2026-05-23-payment-subsystem.md
├── 2026-05-30-search-rewrite.md
└── archive/
    ├── 2026-04-12-auth-refactor.md          ← completed, in main spec or code
    └── 2026-03-08-multi-tenant-rollout.md
```

The spec file follows roughly OpenSpec's structure: intent, scope, approach, design decisions, tasks, references. Critically, it captures *why* — what alternatives were considered, what was rejected and on what grounds. This is the part you will thank yourself for six months later.

After completion, move the file to `archive/`. Do not delete it. It becomes the durable record of why your codebase looks the way it does.

### 5.4 The plan-mode-discussion pattern

The most under-appreciated technique. Before writing a spec, *discuss* the feature with the agent in plan mode:

> *"I want to add bulk CSV upload for users. Before any code changes, give me three architectural options with trade-offs. Don't pick one — just lay them out."*

The agent typically returns three sensible alternatives (synchronous endpoint, async with background job, streaming with progress). You discuss the trade-offs with it, ask follow-up questions, get clarification on edge cases you hadn't considered. After 5-10 minutes of conversation you have a much better-formed view of what you want. Now you write the spec.

This sequence — discuss → settle → spec → implement — costs maybe 15 minutes total for a meaningful feature and saves hours of misdirected implementation. The cost of the discussion is small because no code changes hands; only context.

Steinberger's version: *"I rarely use big plan files now with codex. codex doesn't even have a dedicated plan mode — however it's so much better at adhering to the prompt that I can just write 'let's discuss' or 'give me options' and it will diligently wait until I approve it."* The trigger phrases that work reliably: *"let's discuss before changing code,"* *"give me three options,"* *"don't implement yet,"* *"what would you do differently?"*

### 5.5 Why this, not Spec Kit's eight-phase workflow

Spec Kit's *constitution → specify → clarify → checklist → plan → tasks → analyze → implement* sequence assumes the spec is correct when you start implementation. For iterative work that assumption is false — you discover constraints in implementation that should reshape the spec. The eight-phase pipeline makes this expensive.

**Rationale for the rejection:** In iterative work, the cost of a spec change should be a markdown edit, not a re-traversal of phase gates. The on-demand pattern keeps specs cheap so they can change frequently. Spec Kit was designed for teams where the spec is a coordination artifact between stakeholders; for you it's a coordination artifact between two versions of yourself separated by hours, so it can be much lighter.

### 5.6 Why this, not BMAD's multi-agent flow

BMAD's analyst-to-PM-to-architect-to-developer chain takes longer to set up than your entire feature takes to build. It assumes you have multiple stakeholders with distinct viewpoints to surface. For a single developer there is one stakeholder — you — and the work of distinguishing analyst-viewpoint from PM-viewpoint is performative.

**Rationale for the rejection:** Multi-agent flows are essentially imagined-team rituals. They work well for solo founders who need to *think through* a product from multiple roles. They are pure overhead when you already think this way and don't need a chatbot to play act it.

---

## 6. Pattern 4 — Cross-Model Review

A small habit that catches a meaningful fraction of agent failures and costs almost nothing. When something non-trivial lands, get a second model from a different family to review the spec and the diff.

### 6.1 The mechanic

The agent that wrote the code has a coherent but possibly wrong worldview about it. Bugs you don't notice are often things the implementer agent talked itself into. A different model family, given the same spec and the same diff, will catch a substantial fraction of these because it doesn't share the same internal momentum.

The minimal version:

> *"Here is the spec I gave Claude and the diff it produced. Without making any changes, identify: (1) anything in the diff that doesn't match the spec, (2) anything you would have done differently and why, (3) any edge cases the spec didn't cover that the implementation will fail on."*

Paste this into ChatGPT, Gemini, or whatever you're not using as your primary agent. Read the response. Most of it is noise. A small fraction of it points at something real, and that fraction is worth more than the cost of the prompt.

### 6.2 When to use it

For trivial changes: don't bother. The overhead exceeds the value.

For anything that touches a domain you don't deeply understand, anything involving security or money or auth, anything that changes a shared interface, anything that's hard to test: always.

For the gray zone in the middle: when in doubt, do it. Five minutes of cross-model review has saved me more than five hours of debugging more than once.

### 6.3 The structural value

This pattern is the cheap, accessible version of the StrongDM Dark Factory's "separate verifier" architecture. They built holdout scenarios and a separate LLM-judge to defeat the agent's tendency to grade its own work. You can't build that infrastructure alone. But you can paste a diff into a different chat window with a different model and get most of the same effect for free.

The mental model: the implementer agent is invested in its solution being correct. A different model has no such investment and will tell you if it sees a problem. This asymmetry of incentives — even in stochastic models — is real and useful.

### 6.4 The Hacker News practitioner case as the maximalist version

The senior practitioner whose workflow involves *"7-8 rounds of multi-model self-review on the requirements, then 7-8 rounds on the implementation plan, using Opus 4.5 and GPT-5.2 alternately"* is the maximalist endpoint. For your scale you do not need 7-8 rounds. One round at the end of meaningful changes is the right calibration. The diminishing returns of additional rounds are not worth the time at the throughput you operate at.

### 6.5 Why this, not the formal separate-verifier sub-agent

Claude Code lets you spin up a sub-agent with its own context for review-only purposes. This works but introduces tool complexity for marginal benefit when you're working alone. The chat-window approach gives you the same diversity benefit (different model family) without configuration overhead.

**Rationale for the rejection:** Sub-agents are valuable when you want the review to happen automatically as part of an unattended workflow. For iterative interactive work, manually pasting the diff into a different chat is faster, gives you a chance to read the review as it comes back, and doesn't lock you into one agent's sub-agent abstraction.

---

## 7. The Daily Workflow

Here is what a typical day actually looks like with this setup. Concrete, observable, replicable.

### 7.1 Opening a session

You sit down to work. You open your IDE and your terminal-based agent (Claude Code or Codex CLI). The agent reads your CLAUDE.md / AGENTS.md automatically — you don't think about it. You have the project open.

You glance at CLAUDE.md to confirm nothing is stale. If a rule has become obsolete (model has caught up to a previously-needed instruction; a dependency has changed) you trim it now. This takes 30 seconds and prevents your context budget from bloating.

You decide what you're working on. If you're picking up something from yesterday, you check whether there's a `specs/` file for it and re-read it. If you're starting fresh, you decide whether the task needs a spec or not using the heuristic from section 5.

### 7.2 Working on a feature

For a small feature (a few files, well-bounded):

> *"Add a delete-account button to the settings page. It should match the destructive-action pattern we use elsewhere — see `references/destructive-actions/` for the modal confirmation flow. Add tests for both confirm and cancel paths."*

You watch the agent work. Read the file changes as they come in. If something looks off, stop it and steer:

> *Press escape.*  
> *"Wait — you're using `confirm()` for the dialog. Check `references/destructive-actions/`; we use the ConfirmModal component."*

You let it finish. Run the tests. Review the diff carefully (this is your cognitive-debt hedge — see section 13). Commit.

If anything in the change revealed a convention worth recording, you update CLAUDE.md before moving on. *"After fixing the third instance of the agent using the wrong confirmation pattern, add a line: 'For destructive UI actions ALWAYS use ConfirmModal from src/components/ConfirmModal, NEVER use confirm() or window.confirm.'"*

### 7.3 Working on a larger feature

For a feature that warrants a spec (multi-file, ambiguous, important):

You ask for options first: *"Let's discuss the bulk CSV upload feature. Don't change code yet. Give me three approaches and the trade-offs."*

You discuss for 5-10 minutes. You write the spec — either in the chat or in a `specs/2026-05-23-bulk-upload.md` file depending on size. You hand the spec back: *"OK, implement this. Use references/errors/ for error handling, follow the pattern in references/api-client/ for the validation."*

You watch. You review. For something this size, you also do a cross-model review at the end: paste the spec and the diff into Gemini or GPT, read the response, address any real findings.

You commit. You move the spec file to `specs/archive/`. Update CLAUDE.md if anything was learned.

### 7.4 The discipline that holds it all together

Three habits that, sustained over months, make the difference between a setup that works and a setup that decays:

**Always read the diff.** Not skim. Read. If the agent wrote 200 lines you don't recognize, you have crossed into cognitive-debt territory. Stop, read, understand, then commit. If the change is too large to review in one sitting, the task was too large; break it up.

**Always update CLAUDE.md when you learn something.** The single most important meta-habit. The file's value comes from the accumulated rules, not from the initial setup. Discipline here compounds.

**Always update references when patterns evolve.** When you refactor your error handling, immediately update `references/errors/`. The references must be the canonical current state.

The total overhead of these three habits is maybe 10-15 minutes a day. The payoff is that your setup gets better over time instead of decaying.

### 7.5 Why no slash commands, no plugins, no harness products

You will see practitioners on Twitter using elaborate slash-command setups, Claude Code plugins, harness products like Conductor or Sculptor. For your scale, almost all of this is friction without value.

**Rationale for the rejection:** Steinberger's diagnosis is correct: *"Most are thin wrappers around Anthropic's SDK + work tree management. There's no moat."* The work tree and parallel-agent management these tools provide is meaningful at very high throughput (3-8 parallel agents) but irrelevant when you are running one or two. The slash commands let you save typing on common patterns but cost cognitive overhead remembering which commands exist and when to use them. For one-person work, typing the prompt yourself is faster than recalling and parameterizing a slash command, almost every time.

The one exception worth considering: a slash command for highly repetitive operations you do many times per day (commit, PR-create, automated-merge-respond). If you find yourself typing the same thing more than five times a day, codify it. Otherwise resist.

---

## 8. The Iteration Loop

Iteration is your primary mode and it deserves explicit attention because most published SDD advice optimizes for one-shot generation, not for the loop you actually live in.

### 8.1 The shape of effective iteration

The most productive iteration cycles I've observed (Steinberger's, Willison's, the WordPress-migration practitioners') share a recognizable shape:

```
Discuss → Plan → Implement → Verify → Reflect → Update context → Repeat
                    ↑                                |
                    └────────── Re-steer ────────────┘
```

The crucial loop-back arrow is "re-steer." It's the moment you notice the agent is going wrong and intervene *during* implementation rather than after. Most agentic-coding failures at your scale happen because the agent went 40 minutes in a wrong direction without supervision. The fix is not better specs — it's earlier intervention.

### 8.2 Concrete patterns for intervention

While the agent is implementing, you watch. When something feels off, you stop and steer. The trigger phrases that work:

> *"Stop. What's the status? What are you about to do?"*

This pauses without losing context. The agent summarizes its plan and you can correct.

> *"Wait — that's not what I meant. Before changing anything else, show me the diff so far and explain what you've done."*

Forces a review checkpoint. You inspect, you correct course, you let it continue.

> *"Back out the last two changes. We were going in the wrong direction. Instead, [new direction]."*

Selective rollback. Most agents handle this well if you're specific about *which* changes to revert.

The intuition: stopping the agent costs almost nothing because file changes are atomic. The agent picks up where it left off. The cost of letting a wrong direction continue compounds, because every subsequent change builds on the wrong foundation.

### 8.3 Blast radius awareness

Steinberger's term and it's a good one. Before any change, mentally model how many files it will touch and how reversible the change is. A change with small blast radius can be aggressive — let the agent run, review at the end. A change with large blast radius must be supervised — break it up, intervene often, commit incrementally.

Practical heuristics:

- Single-file change in a leaf module: high autonomy, review at the end.
- Multi-file change in one subsystem: moderate autonomy, checkpoint every few files.
- Cross-cutting refactor (rename across the codebase, framework upgrade): low autonomy, work file-by-file or in small batches with explicit confirmation.
- Anything touching auth, money, or data integrity: low autonomy regardless of size.

The 800-session Cloudflare vinext case is the maximalist version of this principle — 800 small, observable, recoverable sessions rather than one giant attempt.

### 8.4 The atomic-commit discipline

Your commits should be small and atomic, one logical change per commit. This is good practice always; with agents it becomes essential.

The reason: when something breaks two weeks later, you `git bisect` to find when. With one logical change per commit, bisect is precise. With four hours of agent work compressed into one commit, bisect tells you something is wrong somewhere in those four hours.

Tell the agent in CLAUDE.md:

```markdown
## Git discipline
- One logical change per commit.
- Commit messages: imperative mood, focused subject line, optional body.
- If you're about to make a commit that touches more than 5 files in
  unrelated ways, stop and ask whether to split it.
- Atomic commits for atomic changes. Refactoring goes in its own commits.
```

The agent will then commit incrementally as it works, which gives you a clean history and useful bisect.

### 8.5 The hard limits

Spotify learned this the hard way and the lesson is in the public record: bounded turn-counts and retry-counts prevent unbounded-cost failures. Their Honk agents are limited to 10 turns per session and 3 session retries per task. After that, the task escalates to a human.

For your scale, set similar implicit limits:

If the agent has been working on one task for more than 30 minutes without clear progress: stop. Read the diff. Either steer significantly or roll back and re-spec.

If the agent has used more than 50% of your daily context allowance on one task: stop. Compact the conversation manually, summarize the state, start fresh.

If the agent has retried the same conceptual approach three times and failed each time: stop. The approach is wrong; talking to it more won't fix that.

These limits are not about cost (though they help with cost). They are about catching the situation where the agent is in a doom loop and your interrupting it is the only way out.

### 8.6 Why this, not unattended background agents

Tools like Devin, Cursor's Background Agents, Sourcegraph Amp's autonomous mode let you queue tasks and walk away. For your scale, almost never use these.

**Rationale for the rejection:** The value of these tools comes from running tasks while you do something else. The risk is that the agent goes in a wrong direction and you find out only after merging or, worse, deploying. At your scale, you are the only reviewer; background agents that produce work you must later review carefully provide little net throughput improvement. Steinberger gives this up explicitly: *"I steer the models a lot as I notice them drifting off — that's much harder if they run in the background."*

The exception worth considering: completely-bounded mechanical migrations (renaming a method across the codebase, applying a deterministic codemod). These are the Spotify Honk shape — agent does one bounded transformation, you review the PR. For your work this is rare.

---

## 9. Multi-Modal Inputs

This is the most under-used technique relative to its value. Screenshots, design references, video clips, and diagrams as primary spec inputs are dramatically more efficient than the prose equivalents — and at your scale you have full control over when to use them.

### 9.1 The basic move

When you're working on anything visual — UI, layout, design polish, anything with state that has a visual representation — drag a screenshot into your agent's input. Steinberger reports 50%+ of his prompts include a screenshot. The information density is enormous: a single screenshot of a broken state often replaces a paragraph of prose describing the same thing.

The trick is recognizing when an image is the natural spec:

- A bug in the UI → screenshot of the broken state.
- A design you want to match → screenshot of the desired state.
- Layout that's off → screenshot with the problem area circled.
- A design from someone else's product you want to emulate → screenshot from theirs.
- A spreadsheet showing data shape → screenshot of the relevant rows.
- An error message → screenshot of the dev console.
- A config file in another tab → screenshot rather than copy-paste (less error-prone).

The friction is two seconds: take the screenshot, drag into the prompt, type one sentence of context. The win is large.

### 9.2 Figma and design-as-spec

If you're working from designs at all (whether you make them yourself or get them from a designer), Figma's Dev Mode MCP server is the right tool. Configure your agent (Claude Code, Cursor, Codex) with the Figma MCP, then point at a specific frame:

> *"Match this Figma frame exactly: [Figma link]. Use the design tokens from MCP rather than hardcoding colors. The component already exists at src/components/Card — extend it rather than creating a new variant."*

The agent reads layout, variables, components from Figma directly. The fidelity is much higher than describing the design in prose and the result actually matches your design system rather than the agent's interpretation of what your design system might be.

If you don't use Figma, the screenshot approach gets you most of the benefit at zero tool cost.

### 9.3 Sketches and whiteboard-style inputs

For architecture and flow diagrams, a sketch on paper photographed with your phone works surprisingly well. The agent reads boxes-and-arrows diagrams competently and understands flow even from rough sketches. This is faster than typing prose architecture descriptions and produces clearer specs because the agent can refer back to specific elements ("the box labeled X connects to Y").

For more complex flow specs, FigJam (or any whiteboard tool that exports cleanly) works as a spec input. The Figma FigJam MCP integration is the cleanest path, but a screenshot of any whiteboard sketch is fine.

### 9.4 Video as bug spec

For intermittent UI bugs that are hard to describe in prose, a screen recording (Loom, QuickTime, the OS screen recorder) is the right spec. *"Watch this 30-second video. The bug is at 0:12 when the dropdown closes before the selection completes."* The agent now has a precise behavioral description that no amount of prose would have captured as well.

Modern models can extract frames from video and reason about them. This is one of the SOTA capabilities that has improved dramatically since late 2025 and that almost no one is using for spec authoring.

### 9.5 Annotated screenshots

The highest-leverage version: take a screenshot, annotate it with arrows or boxes or text labels using a simple tool (Skitch, the OS markup, even Preview), then drag in. The annotation is your spec.

> *"Make the button look like the annotated screenshot. Specifically: the corners should be rounded as shown, the shadow should be removed, the text should be left-aligned."*

The image-plus-annotation is denser than either alone. You can probably do this in 30 seconds and the resulting spec is unambiguous.

### 9.6 Why this, not detailed prose specs of visual things

The temptation is to describe layout in prose: *"There should be a card with rounded corners (8px), a subtle shadow (4px blur, 10% opacity black), centered text in 14px medium weight..."* This is wrong on two grounds. First, you will not specify everything that matters and the agent will guess the rest. Second, you are spending your time encoding what an image would convey instantly.

**Rationale for the rejection:** Vision-capable models are now reliable. The 2024 hesitation to use them (multimodal was experimental) is obsolete in 2026. Use them.

---

## 10. What to Deliberately Not Do (With Rationale)

The absence is as important as the presence. The patterns this section lists are popular in 2026 discourse and wrong for your situation. Each one has a rationale that explains *why* rejecting it is the right call, not laziness.

### 10.1 Do not adopt a full SDD framework

This means: do not install Spec Kit, do not adopt BMAD, do not move to Kiro. The constitution file you maintain manually does everything Spec Kit's constitution does. The on-demand spec workflow does everything Spec Kit's specify/plan/tasks phases do, with less ceremony. The references corpus does everything BMAD's architectural artifacts do, with concrete code instead of prose.

**Rationale:** These frameworks are designed for team coordination. Their ceremony exists to align multiple people. As a single developer you are one person. The ceremony is overhead with no benefit. Steinberger, who runs 300k LOC alone, abandoned formal SDD explicitly. You should expect to as well.

### 10.2 Do not adopt multi-agent orchestration

This means: do not set up BMAD's 12-agent flow, do not configure complex sub-agent hierarchies, do not run roles like Analyst/PM/Architect/Developer/QA in your work.

**Rationale:** Multi-agent flows are imagined-team rituals. They are useful when the structural separation of roles surfaces information that one role alone would miss. As a single developer you already think across all those roles. Performing them as a chatbot ritual is overhead. The work you save by having a virtual PM is real but small; the work you spend setting up and orchestrating multi-agent flows exceeds it.

### 10.3 Do not adopt the Dark Factory pattern

This means: do not try to set up an environment where the agent writes and "reviews" code without you reading it.

**Rationale:** The Dark Factory works at StrongDM because three engineers built validation infrastructure (Digital Twin Universe, holdout scenarios, LLM-judge) that you cannot build alone. The infrastructure is the entire point — not the "no human review" rule. Without that infrastructure, "no human review" is just "ship unreviewed code," which is bad. The accountability and security implications (Stanford CodeX) apply even to personal projects: when your unreviewed code breaks production at 3am, you will wish you had read it.

### 10.4 Do not run more than 1-2 parallel agents

This means: do not adopt Steinberger's 3-8 parallel agents in a 3x3 terminal grid.

**Rationale:** Steinberger runs 8 agents because his attention is good enough to actually use them, his codebase is heavily refactored, and he can absorb the cost when an agent goes wrong on something he wasn't watching. At your scale and attention bandwidth, more than two parallel agents means at least one is unsupervised. Unsupervised agents drift; you find out late. One agent fully attended is faster than two agents half-attended.

The exception: when you have one main task that demands attention and one purely-mechanical task (cleanup, lint fixes, doc updates) that doesn't, two agents make sense. More than that is performative.

### 10.5 Do not use elaborate slash-command setups

This means: do not invest hours building a /commit, /refactor, /test, /review, /deploy, /summary set of custom slash commands.

**Rationale:** A few slash commands save typing on the operations you genuinely do many times a day. Most don't survive the test. Steinberger uses three (/commit, /automerge, /massageprs) and reports rarely using them. Custom slash commands add cognitive overhead (remembering which exist and when to use them) and ossify workflows that should stay flexible. The base agent's responsiveness to natural language is good enough that explicit commands are mostly unnecessary.

### 10.6 Do not adopt git worktrees as a default

This means: do not adopt the workflow where every parallel task lives in its own worktree.

**Rationale:** Worktrees are valuable when you genuinely have multiple parallel tasks that touch overlapping files. At your scale this is rare. The overhead of managing worktrees (multiple dev servers, multiple terminal panes, mental model of where you are) typically exceeds the benefit. Stay in one branch per active feature; switch branches when you context-switch. If you discover you need worktrees, you'll know; until then, don't add the complexity.

### 10.7 Do not adopt complex harness tools

This means: do not adopt Conductor, Sculptor, Terragon, Factory AI, or similar wrapper products.

**Rationale:** These tools wrap the underlying agent (Claude Code, Codex) with various conveniences. Most are thin wrappers around the SDK plus work-tree management. None has demonstrated durable advantage over the underlying agent. The vendors are competing for share; their products will be acquired, deprecated, or absorbed by the model labs within 18 months. Building your workflow around an unproven harness creates lock-in to a product that may not exist. Use the model lab's tool directly.

### 10.8 Do not add ceremony "in case I need it later"

This means: do not adopt elaborate templates, gates, or processes preemptively because you might need them when the project gets bigger.

**Rationale:** YAGNI applies to methodology as much as to code. Add ceremony when you experience the failure mode it prevents — not before. If you never experience the failure mode (which, for a single developer at your scale, you mostly won't), the ceremony was pure overhead. The patterns this guide recommends are minimal because they correspond to failure modes you *will* experience; everything else is conjectural.

### 10.9 Do not believe vendor case-study numbers

This means: do not treat "40% reduction in time-to-market," "76% velocity improvement," "$23M cost savings" as load-bearing inputs to your decisions.

**Rationale:** Vendor case studies are selection-biased (the failures are not reported), often anonymized (you cannot verify), and methodologically opaque (no comparison baseline). They are marketing, not evidence. The evidence base that should inform your decisions is open-source practitioner accounts (Steinberger, Willison, the Cloudflare vinext detailed writeup, the Spotify Honk engineering blog series), and the recent academic literature. Vendor numbers belong in the same epistemic category as advertising claims.

### 10.10 Do not chase every new tool release

This means: do not switch your primary tool every time a new agent or framework launches with impressive marketing.

**Rationale:** The agent ecosystem in 2026 is high-noise. Major releases happen monthly. Each release is accompanied by claims that it's transformative. Most aren't, and the switching cost (re-learning, re-configuring CLAUDE.md, re-validating workflows) is real. Adopt a primary tool, use it for at least three months, then evaluate whether to switch based on your own experience rather than marketing. The cost of being one or two months behind the frontier is small; the cost of churning tools constantly is high.

---

## 11. Tooling Choices

Specific recommendations with rationale. The 2026 tooling landscape is large; the right setup for your situation is small.

### 11.1 Primary agent

**Recommended: Claude Code (CLI) with Opus 4.7 or Sonnet 4.6.**

Rationale: At your scale the model quality differentiates. Opus 4.7 produces materially better code on complex tasks than cheaper alternatives, particularly on iterative work where the model has to hold a lot of context. Sonnet 4.6 is the right default for most work because the cost-per-quality is favorable; Opus for the tricky 20%.

Claude Code as the harness is mature, well-supported, and works on your terminal — no separate IDE. It reads CLAUDE.md natively, supports MCP for tool integration, runs in any directory, integrates well with `git`. It is what Steinberger used until October 2025 and what most senior practitioners still use as primary or fallback.

**Alternative considered: Codex CLI with GPT-5.x.**

Codex CLI is excellent and Steinberger now uses it as his daily driver, citing better adherence to specs and more careful file-reading before changes. The two are roughly comparable in quality. The right choice depends on which model family you have a stronger subscription with. If you have an OpenAI Pro/Plus subscription, use Codex; if you have Claude Pro/Max, use Claude Code. Don't pay for both unless you genuinely need cross-model review at high volume.

**Alternative rejected: Cursor as primary tool.**

Cursor is excellent as an IDE with strong tab-completion. As an agentic harness it is one option among many and has no clear advantage over Claude Code or Codex CLI. The lock-in to its specific UI and rule format is real. Use Cursor's tab-completion alongside Claude Code in the terminal; do not adopt Cursor's agentic mode as the primary workflow.

**Alternative rejected: Aider.**

Aider is good and the original terminal agent. For most users in 2026 Claude Code and Codex CLI have caught up and pulled ahead on UI, file-handling, and breadth of integration. Use Aider if you specifically prefer its model-agnostic design and want to mix Anthropic, OpenAI, and local models in one tool. For your situation Claude Code or Codex is simpler.

**Alternative rejected: Devin and other autonomous agents.**

Devin promises autonomy you do not want at your scale. The right autonomy level for you is interactive — you steer, the agent implements, you review. Autonomous agents that work in the background and present you with completed PRs require trust you should not extend yet.

### 11.2 IDE

**Recommended: VS Code (or your existing editor).**

Rationale: Almost any editor works. Claude Code runs in your terminal, alongside any editor. There is no benefit to switching editors for agentic coding specifically. VS Code is the most universally compatible. If you prefer Vim, JetBrains, Zed, or Sublime, keep using them.

**Alternative rejected: Kiro.**

Kiro is AWS's dedicated SDD IDE. For your scale the lock-in is not justified by any benefit you can't get more cheaply with VS Code + Claude Code. Kiro is built for enterprise teams with AWS integration needs. You are not that.

**Alternative rejected: Cursor as IDE replacement.**

Cursor's tab-completion model is genuinely excellent. If you write code manually frequently, Cursor's tab is the best in the field. As a *replacement* for VS Code it works fine; as a *required* IDE it locks you in for no specific gain. Use Cursor or VS Code — same diff.

### 11.3 Cross-model review tool

**Recommended: ChatGPT Pro (or equivalent) for review.**

Rationale: You want a different model family than your primary. If you use Claude Code as primary, your review tool should be GPT-5.x via chat. If you use Codex as primary, your review tool should be Claude via chat.

This is genuinely two subscriptions and the cost (roughly $40/month total) is small relative to the value. Cross-model review is the cheapest validation step available.

**Alternative considered: Gemini 3.1 Pro.**

Gemini is the cheapest of the frontier flagships at $2/$12 per million tokens. For pure cross-model review where you're just asking for a critique, Gemini works fine. If cost matters more than slight quality differences, use Gemini.

### 11.4 What not to subscribe to

You do not need:

- A FinOps tool (CloudZero etc.) — your costs are too small.
- A code-review automation product (CodeRabbit, Greptile) — the cross-model-review habit covers this for free.
- A spec management platform (Tessl, Intent, AI/works) — your CLAUDE.md and specs/ folder are sufficient.
- An MCP server hosting service — run them locally.
- A team-collaboration agent product (Augment Code, Cosmos) — you are not a team.
- An evaluation platform (Braintrust, etc.) — you don't run enough variants to benefit.

### 11.5 What to add when you need it

You might eventually want:

- **Figma + Figma Dev Mode MCP** if you do any frontend work with designs. Set up when you find yourself describing layouts in prose more than twice.
- **Wispr Flow** (or similar voice-to-text with semantic correction) if you find yourself typing long prompts repeatedly. Steinberger swears by it.
- **A static code analyzer** like `ast-grep` integrated as a git hook to enforce conventions the agent might violate. Worth setting up after the first time an agent re-introduces a pattern you'd explicitly retired.
- **A pre-commit hook** that runs your test suite quickly on changed files. Worth setting up if the agent ever commits code that fails tests (rare with current models but happens).

Add these incrementally when you experience the need, not preemptively.

---

## 12. Cost Control

At your scale, cost is real but not the dominant concern. The bigger risks are quality and cognitive debt. But cost can spiral silently if you don't pay attention, so a few habits matter.

### 12.1 The actual cost shape

Cost in 2026 dollars per million tokens, mid-range pricing:

- Claude Sonnet 4.6 input: $3.00, output: $15.00.
- Claude Opus 4.7 input: $5.00, output: $25.00.
- GPT-5.4 input: $2.50, output: $15.00.
- GPT-5.5 input: $5.00, output: $30.00.

Output is roughly 5x input — this is the structural constraint. Long generated diffs are where the cost lives, not the spec or context.

A typical session for a non-trivial feature: maybe 50k tokens of context input (your codebase reads, your CLAUDE.md, your references), 10-20k tokens of output (the actual code changes). On Opus 4.7 that's roughly $0.25 input + $0.50 output = $0.75. On a heavy iteration day with 10-20 such sessions, you're looking at $7-15 in API cost per day.

For most of your work this is fine. The subscription pricing (Claude Pro at $20/month or Claude Max at $100-200/month with much higher rate limits) is usually cheaper than API billing for sustained interactive work. Use the subscription if you can.

### 12.2 The patterns that cost money

The expensive patterns to watch for:

**Long context with no cache hit.** Each new session that reads the full codebase from scratch is an expensive input bill. Caching (Anthropic's prompt caching, OpenAI's automatic caching) gets you ~90% input discount on repeated context. Long single sessions are cheaper than many short ones because of caching.

**Doom loops.** Agent runs in circles, regenerating similar code, retrying the same approach. Spotify's 10-turn limit is the right protective instinct. If you notice the agent has been retrying the same task without progress, kill the session and start fresh.

**Refactoring without bound.** *"Refactor the codebase to use the new pattern"* without scope can run for hours and burn thousands of dollars of tokens. Bound the refactor: *"Refactor module X. When done, stop and let me review before continuing."*

**Multi-agent parallel work.** Running 4 agents simultaneously is 4x the cost. If you're not actually using their parallel output (because you can only review so much in serial), reduce.

### 12.3 The instrumentation

Even at your scale, you should know roughly what you spend. Tools that help:

- Anthropic's usage dashboard if you're on the API. Shows daily spend by model.
- `ccusage` and similar community tools that approximate cost from session logs.
- The simplest: monthly subscription statements. If your bill jumps from $20 to $200, something changed.

This is not FinOps. You don't need dashboards. You just need to notice anomalies.

### 12.4 Subscription vs API

For your usage shape (sustained interactive coding, 4-8 hours per day, mostly one agent at a time), the subscription model is usually cheaper. Claude Pro ($20) or Claude Max ($100-200) gives you generous rate limits at fixed cost. ChatGPT Pro ($20) gives you GPT-5.x access at fixed cost.

API access is right when:

- You're scripting agents (running headless workflows).
- You're hitting subscription rate limits (heavy parallel work).
- You're using model versions not available in the chat UI.
- You're integrating into your own tools (custom MCP, custom slash commands).

For most of your work, subscription is the answer. Don't pay API rates unless you have a reason.

---

## 13. Cognitive Debt Mitigation

The cognitive-debt risk is the most under-discussed cost of agentic coding and the one most likely to hurt you over months and years. The MIT EEG study and the ICLR 2026 follow-up paper show concrete neural effects of AI-assisted work — reduced engagement, weaker critical thinking, systematic overestimation of AI's benefits. Practitioners who let this slide report regret.

The good news: you can hedge against it without giving up most of the productivity gains. The hedges cost time but not much.

### 13.1 Read every diff

The non-negotiable habit. Every diff the agent produces, you read. Not skim — *read*. If a diff is too large to read carefully in one sitting, the task was too large; break it up.

This is the single most important hedge. The cognitive-debt failure mode is "I shipped 1000 lines of code I never read." If you read it, you understand what's in your codebase. If you don't, you've outsourced understanding.

A useful test: pick a random file the agent modified yesterday. Without checking, can you explain what it does and why? If yes, you're calibrated. If no, you've slipped into debt.

### 13.2 Manual coding sessions

Once or twice a week, do deliberate manual coding. Pick a small task — a refactor, a new utility, a test improvement — and write it yourself without agent assistance. Steinberger does this implicitly during his refactor days. Tornhill (who claims 100% agent-written code) still emphasizes that human judgment about maintainability is the durable skill.

The point is not to be faster manually — you won't be. The point is to keep the skill sharp. Programming is a perishable skill; reading code is a related but not identical skill. You need to do the writing occasionally to retain the writing.

### 13.3 Architecture sessions

Once a week or so, sit down without the agent open and think about your project. Where is the design getting muddy? What's accumulating debt? What patterns should evolve? What's missing from your references corpus? What rules are missing from CLAUDE.md?

Architectural thinking is what the agent does *worst*. It is also what you must do *best* if you want to direct an agent productively. Skipping these sessions means your architectural judgment atrophies even as your throughput grows. That's the bad equilibrium.

### 13.4 The unplugged debugging rule

When something breaks in production or staging, debug it manually first. Read the code, read the logs, form a hypothesis, verify. Only then bring in the agent to help fix.

The reason: debugging is where understanding lives. If you outsource debugging entirely, you don't build the mental model of your own system. When the *next* bug hits and the agent can't figure it out, you'll have no foundation to fall back on.

### 13.5 Periodic re-reads

Quarterly, read parts of your codebase you haven't touched recently. Just read. Make notes on things that surprise you, patterns that have drifted, code you don't recognize. This is the audit step that catches accumulated debt before it becomes structural.

The Behaim WordPress migration team did this implicitly — their CLAUDE.md grew as they kept noticing patterns and codifying them. The act of re-reading produced the insights.

### 13.6 The honest assessment

You will not do all of these consistently. Nobody does. Pick two — *read every diff* and *manual coding once a week* — and treat those as non-negotiable. The others are practices to return to when you notice the symptoms (you can't explain your own code, you feel slower at architecture, you've lost the intuition for what's hard and what's easy).

The cognitive-debt risk is real but not destiny. The practitioners who manage it best are the ones who treat the agent as a *power tool* — useful, important, not a substitute for the underlying skill.

---

## 14. Migration Plan for Existing Projects

If you have an existing project and want to introduce this setup, do it incrementally rather than all at once. The rollout below is the actual sequence I'd follow on a 50k-LOC project I'd been working on for a year. Three weeks, no production interruption, observable benefit at each stage.

### 14.1 Week 1 — The Constitution

The first move is establishing a CLAUDE.md (or AGENTS.md) that captures what you actually do. Not aspirations — observations. Spend an evening reading your own code with the question *"what conventions are already true here?"*

The first draft is short. Stack and versions (copy from `package.json` / `pyproject.toml` / `go.mod`). Quality bar (read your `.eslintrc`, your test config, capture what's actually enforced). Naming conventions (look at three random modules — what patterns repeat?). Hard prohibitions (think about every time you've cursed at the agent — codify the rule).

Aim for 80-120 lines on the first pass. Resist the urge to make it longer; you will grow it as you use it.

Symlink for cross-agent compatibility:

```bash
ln -s AGENTS.md CLAUDE.md
ln -s AGENTS.md GEMINI.md
```

Commit it. Now every future agent session starts with this context loaded.

By end of week 1: every new task the agent does respects your conventions because it actually has them in context. You will likely add 10-20 lines to the file during this week as you notice things the first draft missed.

### 14.2 Week 2 — The First References

Pick the three patterns that come up most often in your work. For most backend projects this is error handling, logging, and API patterns. For most frontend projects it's component structure, state management, and styling conventions. Be honest about what you actually do; this is not the time to fix the patterns, just to document them.

For each pattern:

1. Find the *best current example* in your codebase. Not the first instance — the cleanest, most representative one.
2. Copy it into `references/<pattern-name>/` along with its test file.
3. Write a 10-20 line `README.md` for the reference explaining *why this pattern, what alternatives you rejected*.

Update CLAUDE.md to point at these references. Add a section: *"Canonical patterns are in `references/`. For X, see `references/x/`. For Y, see `references/y/`."*

By end of week 2: the agent now follows your actual patterns by reference rather than inventing plausible alternatives. Code review becomes diff-against-reference instead of judge-from-scratch.

### 14.3 Week 3 — The Workflow Habits

Now the behavioral changes. These are habits, not artifacts.

Adopt the *"let's discuss"* discipline. Before any task that touches more than one or two files, ask the agent for options before code changes. Five minutes of discussion saves substantial misdirected implementation time.

Adopt the *read every diff* rule. Non-negotiable from this point forward. If you find yourself wanting to skip the diff read, the task is too large — break it up.

Adopt the *update CLAUDE.md when you learn* habit. Every time the agent makes a mistake you have to correct twice, add a line to CLAUDE.md. The file should grow by 1-3 lines per week of active use; this is healthy growth.

Set up cross-model review for non-trivial work. Keep a tab open on whatever's *not* your primary agent. When something complex lands, paste-and-review.

By end of week 3: your workflow is materially different from where you started. Output quality is up, drift is down, the system is set up to compound.

### 14.4 Week 4 onward — Compounding

After three weeks of disciplined use, the system starts to pay for itself. New references get added when you notice repeated decisions. CLAUDE.md grows in response to discovered failure modes. Old rules get removed as model capabilities catch up. You're now in the steady state.

The expected trajectory: by month 3, you have 8-12 references covering most of your architectural concerns. CLAUDE.md is 200-400 lines. New features ship faster and more consistently with your style. You spend more time on architecture and review and less on plumbing.

By month 6: the references corpus partially transfers to new projects you start. Your second project bootstraps from a starter CLAUDE.md and a references skeleton drawn from your first. The compounding is now across projects, not just within.

### 14.5 What not to do on the migration

Do not try to set everything up in one weekend. The artifacts only have value insofar as they capture real conventions and real failure modes. Bootstrapping them too fast produces aspirational documents that don't match reality, which is worse than no document at all.

Do not retroactively add a `specs/` archive for past features. The archive is durable only when it captures decisions made *in the moment*. Reconstructed specs are unreliable narrators.

Do not adopt OpenSpec or Spec Kit "to be safe." The on-demand spec workflow is sufficient for your scale. Adding framework ceremony to a single-developer project introduces friction without addressing any real problem.

Do not over-document. Every line in CLAUDE.md or a reference adds to the agent's context budget. If a line isn't earning its place, remove it. The goal is *minimum useful documentation*, not maximum.

---

## 15. Maintenance Over Time

A system that works on day one but rots over six months is worse than no system. The maintenance discipline below keeps the setup healthy.

### 15.1 Weekly review

Once a week (Friday afternoon works well), spend 15-20 minutes on the system itself.

Read CLAUDE.md from top to bottom. Look for rules that are obsolete (model has caught up to a previously-needed instruction; dependency has changed; pattern has been refactored). Delete them. Look for rules that are unclear — when you re-read it, do you understand what it means? If not, the agent doesn't either. Clarify or remove.

Glance at `references/`. Anything stale? Any pattern that was canonical three months ago but has since been refactored? Update or remove. The references must reflect *current* canonical patterns, not historical ones.

Look at your `specs/archive/`. Anything you'd reference in a future spec? File it in your memory accordingly.

This weekly review takes 15-20 minutes and prevents the gradual drift that kills these systems.

### 15.2 Per-feature maintenance

Each time you finish a non-trivial feature, three small actions:

If the feature surfaced a new convention you'll repeat: update CLAUDE.md. *"After finishing the payments service, I noticed I made a decision about error-response shape that I'll want to repeat. Add a line to CLAUDE.md."*

If the feature contained a clean implementation of a pattern not yet in `references/`: add it. *"The payment-status-machine code is clean. Copy it to `references/state-machines/` so future state machines start from this template."*

If the feature required a spec you wrote: move the spec to `specs/archive/`. This is the audit trail you'll want six months from now.

These take a few minutes per feature. They are the difference between a system that compounds and one that decays.

### 15.3 Quarterly architectural review

Once a quarter (every three months), do a longer review of the codebase itself, not just the documentation.

Read parts of the codebase you haven't touched recently. Are patterns drifting? Has the agent slowly introduced variations on your conventions that you accepted at the time but that now diverge from `references/`?

If yes, three options. Refactor back to the reference if the divergence is harmful. Update the reference if the divergence is actually an improvement. Document both versions if both are legitimate (rare; usually one is right).

This quarterly review catches the structural debt that weekly reviews miss. It is the single most important maintenance action for keeping the system healthy over years.

### 15.4 Annual reassessment

Once a year, step back and ask whether the system itself is still right. The tooling landscape changes fast. Anthropic releases new Claude versions. OpenAI releases new GPT versions. New patterns emerge. New harness products launch.

Questions to ask:

Is my primary agent still the right choice? When was the last time I evaluated alternatives?

Are my references still the patterns I'd choose if starting fresh? Or have I been preserving them by inertia?

Has my CLAUDE.md grown bloated? When was the last time I aggressively trimmed it?

Are there patterns I keep solving from scratch that should be in references/?

Do not change everything every year. Do reassess. The annual review is when you'd switch from Claude Code to Codex if Codex has decisively pulled ahead, or restructure your references if you've drifted away from them, or adopt a tool that's matured.

### 15.5 The signs of decay

Symptoms that the system has rotted and needs attention:

You stop reading the diff carefully. (Means: you've moved into cognitive debt.)

You realize you've been ignoring CLAUDE.md because it's full of stale rules. (Means: aggressive trim is overdue.)

You find yourself describing patterns in prose to the agent because you've forgotten what's in `references/`. (Means: you've stopped pointing at references; either update them or refresh your habit.)

You notice the agent making the same kind of mistake repeatedly and you keep correcting it manually. (Means: a CLAUDE.md rule is missing.)

You can't explain a recent feature's architecture without re-reading the code. (Means: cognitive debt is accumulating.)

When you notice any of these, stop and address. The fix is usually 30 minutes of housekeeping, not a major change.

---

## 16. When to Break Your Own Rules

The guidelines above are defaults, not laws. The mature version of any methodology is knowing when *not* to follow it.

### 16.1 Skip the spec when exploring

When you don't yet know what you want, writing a spec ossifies the wrong commitment. Just talk to the agent. Try things. Throw away the result if it's wrong. Once the shape of what you want has emerged from exploration, *then* write a spec for the implementation.

The mistake to avoid: writing detailed specs for exploratory work. The spec becomes a constraint you then either follow (locking in the wrong design) or ignore (in which case why did you write it).

### 16.2 Skip references for one-off code

If you're writing a throwaway script — a data migration that runs once, a one-time analysis, an investigation that won't survive the week — skip the reference discipline. Reference patterns exist for code that lives. One-off code can break every convention as long as it does the job.

### 16.3 Skip cross-model review for trivial work

If the change is small, well-bounded, and the diff is obviously correct, don't review. The five-minute overhead exceeds the value. Cross-model review is for things you're not sure about, not for everything.

### 16.4 Run multiple agents when you genuinely have parallel work

The "1-2 agents only" recommendation is the default. When you have genuinely independent parallel tasks (a big refactor in one module, a feature in another, mechanical cleanup in a third) — and you can attend to all three meaningfully — running three agents is fine. The rule is about not running more than you can supervise, not about a hard count.

### 16.5 Add ceremony when you experience the failure mode

The "don't preemptively adopt ceremony" rule reverses when you actually encounter the failure mode the ceremony prevents. If you've had three production bugs from agent-written code that better testing would have caught, adopting EvilGenie-style adversarial testing or property-based testing for that subsystem is the right move. The rule is *don't add ceremony before you need it*, not *never add ceremony*.

### 16.6 Use the framework if it's free

If you join a team that uses Spec Kit or BMAD, use it. The frameworks have real value when team coordination is the binding constraint, and you adapting to your team's tools is much cheaper than the team adapting to yours. The patterns in this guide are right *for a single developer* — they are not universal truths.

### 16.7 The meta-rule

The guidelines exist because they work most of the time at your scale. They are not optimal in every case. When you have a specific reason to deviate, deviate. The danger is *unreflective* adherence (cargo-culting) or *unreflective* deviation (ignoring discipline because it feels constraining). Decide consciously each time.

Steinberger's mature stance applies broadly: *"My job is to apply judgment to the situation, not to apply a methodology."*

---

## 17. Templates and Starter Files

This section gives you ready-to-copy templates for the artifacts above. Adapt them to your stack but treat the structure as a strong default.

### 17.1 Starter CLAUDE.md / AGENTS.md

The template below is for a TypeScript/Node project. Adapt sections for your language and framework but keep the shape.

```markdown
# Project Agent Instructions

This file is loaded by the coding agent at the start of every session.
Keep it concise, observation-driven, and updated as the project evolves.

## Stack

- TypeScript 5.4, strict mode, target ES2022
- Node 22 LTS, ESM modules
- pnpm 9 (do not use npm or yarn)
- Vite 5 (frontend), tsx (backend dev runtime)
- Vitest for tests, Playwright for E2E
- Hono for HTTP, Drizzle ORM for database, Postgres 16
- Zod for runtime validation

## Quality bar

- No `any` in production code. Use `unknown` and narrow with type guards.
- No `as unknown as` double-casts. If you need one, the type model is wrong; fix it.
- All public functions have explicit return types.
- New code matches existing test coverage. Do not regress coverage.
- ESLint rules in .eslintrc are enforced; do not disable them locally.
- Prettier formats on save; do not fight the formatter.

## Conventions

For canonical patterns, see `references/`:
- Error handling: `references/errors/`
- Logging: `references/logging/`
- API clients: `references/api-client/`
- Test setup: `references/testing/`
- Configuration: `references/config/`
- Database access: `references/database/`

When implementing a new feature touching these concerns, follow the
reference pattern. Deviations must be explained in code comments.

## Hard prohibitions

- Do not use `console.log` directly. Use the logger in `src/lib/logger.ts`.
- Do not introduce Redux. Use Zustand for client state, react-query for
  server state.
- Do not use Lodash. Prefer native ES methods.
- Do not use Axios. Use native fetch via our `apiClient` wrapper.
- Do not generate React class components. Function components with hooks only.
- Do not commit secrets, API keys, or credentials. Loaded from .env.local
  via `src/config/env.ts`.

## Operational

- New routes go in `src/routes/`.
- New components go in `src/components/`. One component per file.
- New utilities go in `src/lib/`. Each utility has a colocated test.
- Database migrations go in `migrations/`. Run with `pnpm db:migrate`.
- Logs go to stdout in dev, structured JSON in prod (via the logger).

## Git discipline

- One logical change per commit. Imperative-mood subject lines.
- If a commit touches more than 5 unrelated files, split it.
- Refactoring goes in its own commits, separate from feature work.
- Never `git push --force` on shared branches.

## Workflow expectations

- Before implementing anything non-trivial, propose an approach first.
- For tasks with ambiguity, ask for clarification rather than guessing.
- Always read the diff before committing — do not skip review.
- When you encounter a rule violation in existing code, do not silently
  fix it; ask first.
```

This is roughly 80 lines. It grows as you accumulate experience. The structure should remain similar.

### 17.2 Starter references/README.md

The index file that the agent reads first:

```markdown
# References

This folder contains canonical patterns for this project. The agent
should read the relevant reference before implementing a feature that
touches that pattern, and match the reference style.

## Index

| Pattern | Path | When to apply |
|---|---|---|
| Error handling | `errors/` | Any code that can fail in a recoverable way |
| Logging | `logging/` | Any code that needs to emit operational info |
| API clients | `api-client/` | Outbound HTTP to third-party services |
| Test setup | `testing/` | Writing new tests |
| Configuration | `config/` | Reading env vars or settings |
| Database access | `database/` | Any code touching Postgres |

## How to use these

When implementing a new feature, identify which patterns it touches.
Read the relevant reference's README first to understand the design
decisions. Then read the example code to absorb the idioms.

Apply the same patterns to the new code. Deviate only when the new
domain genuinely requires it, and document the deviation in code
comments.

## How to update these

References must reflect *current canonical patterns*, not historical
ones. If you refactor a pattern in the main codebase, update the
reference immediately. If the agent proposes a refinement that you
accept, update the reference to match.

Stale references are worse than no references.
```

### 17.3 Starter references/errors/README.md

The pattern-specific README. This is the explanatory document the agent reads when error handling is in scope:

```markdown
# Error Handling Pattern

We use a single ApiError class hierarchy across all routes. The middleware
catches anything thrown, maps to HTTP status, and produces a consistent
JSON shape: `{ error: { code, message, details? } }`.

## Files

- `ApiError.ts` — the error class hierarchy
- `error-middleware.ts` — the Hono middleware that catches and formats
- `errors.test.ts` — how we test error responses

## Design decisions

- **Single hierarchy**: all custom errors extend ApiError. This keeps the
  middleware simple — one catch handles everything.
- **Status code on the class**: each subclass declares its HTTP status as
  a static property. The middleware reads it. No status-mapping table.
- **Structured details**: the optional `details` field carries
  field-level context for validation errors. Keep it serializable JSON.

## What we rejected

- **Per-route try/catch**: too repetitive, easy to forget, leads to
  inconsistent error shapes.
- **Throwing raw Error**: lost the structured info downstream.
- **Result<T, E> monad**: considered for type-safe error flow. Decided
  against — too much TypeScript friction at this codebase size. Worth
  reconsidering at 200k+ LOC.
- **HTTP errors as return values**: makes the happy path verbose.
  Throwing keeps the success path clean.

## When to extend

New error categories get a new subclass of ApiError. Do not invent
parallel error hierarchies. If a route needs custom handling beyond
the middleware, document why in a comment near the catch block.

## When to deviate

For genuinely unrecoverable errors (data corruption, security violation),
throw something the middleware does *not* catch — let it crash the
process. The middleware is for *recoverable* errors that map to client
responses.
```

### 17.4 Starter small-spec template

For inline specs (the kind that go in a chat prompt or a small markdown file):

```markdown
## Feature: [name]

### Why
[1-3 sentences on the problem and the user impact.]

### Acceptance criteria
- [Observable behavior 1]
- [Observable behavior 2]
- [Observable behavior 3]

### References
- [Existing code to mirror, with file paths]
- [Relevant `references/` directories]

### Non-goals
- [Scope you are explicitly excluding]
- [Future extensions that are not part of this work]

### Open questions (if any)
- [Things you genuinely don't know yet]
```

This template fits in a chat prompt. Resist the urge to expand it. Twenty lines is the right size for most features.

### 17.5 Starter large-spec template

For specs that live in `specs/YYYY-MM-DD-feature-name.md`:

```markdown
# [Feature name]

**Date:** YYYY-MM-DD
**Status:** [draft | in-progress | completed]

## Intent

[A paragraph on what this feature is and why we're building it.]

## Scope

In scope:
- [Specific capabilities being added]

Out of scope:
- [Capabilities deliberately excluded, with brief rationale]

## Design

### Approach
[The chosen architecture, with the alternatives considered and why
they were rejected.]

### Data model changes
[New tables, columns, types. Migration notes.]

### API changes
[New endpoints, request/response shapes. Breaking changes if any.]

### UI changes
[Affected pages, components, flows. Reference Figma frames if applicable.]

## Implementation plan

- [ ] Task 1
- [ ] Task 2
- [ ] Task 3

## References

- Pattern X — `references/x/`
- Existing module Y — `src/lib/y.ts`
- Related past spec — `specs/archive/YYYY-MM-DD-related.md`

## Open questions

- [Things to resolve before or during implementation]

## Notes from implementation

[Filled in as you go — surprises, deviations from the plan, lessons learned.]
```

After completion, set `Status: completed`, fill in the notes section with what you learned, and move the file to `specs/archive/`.

### 17.6 Starter directory layout

The full starter layout for a new project that adopts this setup from day one:

```
project-root/
├── AGENTS.md            ← The constitution (canonical)
├── CLAUDE.md            ← symlink → AGENTS.md
├── GEMINI.md            ← symlink → AGENTS.md
├── README.md            ← Human-facing project docs
├── references/
│   ├── README.md        ← Index
│   ├── errors/
│   ├── logging/
│   ├── api-client/
│   └── testing/
├── specs/               ← Created when first large spec is written
│   └── archive/         ← Completed specs go here
├── src/
├── tests/
└── [your normal project structure]
```

The `references/` and `specs/` folders are committed to the repo. They are part of the project's source-of-truth.

---

## 18. Common Failure Modes and Recoveries

Five failure modes you will encounter, what causes them, and how to recover.

### 18.1 The agent invents APIs that don't exist

**Symptom:** The agent generates code that calls `someLibrary.coolMethod()` and that method doesn't exist. Tests fail or the code doesn't compile.

**Cause:** Training data is stale. The agent's mental model of the library is from months or years ago. Newer versions may have removed, renamed, or restructured the method.

**Recovery:** Point the agent at the actual documentation or source. *"This method doesn't exist in the current version. Read node_modules/[package]/dist/index.d.ts and find the correct API."* The Next.js v16 pattern (bundle docs in node_modules, tell the agent to read them) is the strongest prevention. For libraries that don't ship docs in their package, link to the official docs URL in CLAUDE.md.

**Prevention:** Pin exact dependency versions in CLAUDE.md. Add a line: *"Your training data may be outdated. When using library X, read its types/docs before writing code."*

### 18.2 The agent refactors code you didn't ask it to touch

**Symptom:** You asked for a small change, the diff includes unexpected modifications to unrelated files.

**Cause:** The agent saw something it considered improvable and acted on initiative. Sometimes this is genuinely helpful; often it's scope creep that adds review burden.

**Recovery:** Roll back the unrelated changes (`git checkout` the affected files) and tell the agent why. *"Do not refactor code outside the scope of the current task. If you see something worth improving, mention it but do not change it."*

**Prevention:** Add to CLAUDE.md: *"Stay strictly within the scope of the current task. If you notice unrelated issues, mention them in a comment after completing the work, but do not modify unrelated code."*

### 18.3 The agent silently introduces a forbidden pattern

**Symptom:** Some time later you notice the codebase contains a pattern you'd explicitly retired (Lodash usage, raw `fetch` without your wrapper, `console.log` debugging statements).

**Cause:** Either CLAUDE.md didn't mention the prohibition, or the agent was working in a context that didn't load it (a sub-agent, a non-CLAUDE.md-aware tool, a session you initiated outside the project root).

**Recovery:** Refactor the offending code back to the canonical pattern. Add or strengthen the rule in CLAUDE.md. If this is the second or third instance, add a pre-commit hook or lint rule that mechanically catches it.

**Prevention:** Be explicit in CLAUDE.md with the word "NEVER" — agents respond to emphasis. *"NEVER use console.log directly. ALWAYS use the logger from src/lib/logger.ts."* The mechanical enforcement (lint rule, pre-commit hook) is the real safeguard for high-frequency violations.

### 18.4 The agent enters a doom loop

**Symptom:** The agent has been trying to fix the same bug for 30 minutes, generating progressively more elaborate code, with no improvement.

**Cause:** The agent's current frame is wrong but it's iterating within that frame. More tokens won't fix this — the frame needs to change.

**Recovery:** Stop the agent. Read the actual problem yourself for five minutes — read the failing test, read the relevant code, form your own hypothesis. Either fix it yourself, or hand the agent a focused, reframed prompt: *"Forget what you've been trying. The actual problem is X. Try approach Y instead."*

**Prevention:** Treat the bounded turn-count discipline (Spotify's 10-turn limit) as your own implicit budget. If a single task has burned more than ~15 conversational turns without converging, stop. The marginal value of more turns is negative; you're paying for cognitive lock-in.

### 18.5 The agent's confidence exceeds its correctness

**Symptom:** The agent reports a feature is complete and tests pass. You discover later it doesn't work in some real-world condition the tests didn't cover.

**Cause:** Tests are a proxy for correctness, not correctness itself. The agent satisfied the proxy and stopped looking. The Karpathy MenuGen Stripe-email-mismatch bug is the canonical example.

**Recovery:** Read the agent's code carefully. Run the feature manually under realistic conditions, not just under the test suite. Add a test that captures the missed condition. Add a CLAUDE.md note about the class of bug.

**Prevention:** Cultivate skepticism of agent-reported success on tasks with real-world complexity. The cross-model review pattern catches a meaningful fraction of these — a different model is more likely to spot the gap. For high-stakes code (auth, payments, data integrity), add adversarial testing or property-based tests on top of unit tests.

### 18.6 You can no longer explain your own codebase

**Symptom:** A bug occurs in a feature the agent built three months ago. You read the code and don't recognize it. You can't form a hypothesis about why it behaves the way it does.

**Cause:** Cognitive debt accumulated. You shipped code you didn't deeply understand at the time, and time has further eroded what understanding you had.

**Recovery:** Re-read the affected module slowly. Annotate as you go. Refactor parts that look opaque even if they aren't broken. This is expensive — hours or days, not minutes — and it is the price of having outsourced understanding earlier.

**Prevention:** The *read every diff* rule, applied consistently. The *manual coding once a week* rule. The *quarterly re-reads* practice. These are not optional; they are the maintenance you pay to keep your understanding intact.

---

## 19. The Honest Six-Month View

A few honest predictions about where you'll be six months after adopting this setup, based on the trajectories of the practitioners whose workflows informed it.

### 19.1 What will be better

Your output volume will be measurably higher. Most non-trivial features will ship in 30-60% of the time they took before. The patterns the agent doesn't know how to do well (architecture decisions, novel algorithms, debugging deep issues) will remain at human speed; the patterns it does well (plumbing, tests, refactors, CRUD layers, integrations) will be substantially faster.

Your code quality will be more consistent because the references corpus enforces style. The variance between modules will shrink. New modules will look like old modules. This is good — drift is one of the largest sources of maintenance cost in a long-lived codebase.

Your project velocity for adding features will increase, but not as much as agent-marketing claims. The 10x productivity numbers are about typing speed; your actual bottleneck is review, architecture, and judgment, which the agent helps with less. Expect 2-3x on typical features, 5-10x on plumbing-heavy work, no improvement on the genuinely hard 10%.

### 19.2 What will be different but not necessarily better

Your relationship to your code will change. You will *write* less of it directly. You will *read* more of it (the diff-review discipline) and *think more about it* at the architectural level. Whether this is better is a personal question. Some practitioners report it as a relief — they're closer to architects than coders. Others miss the flow of writing code and have to deliberately preserve that experience.

Your debugging skills will atrophy if you let them. Agents can debug, but they're worse at it than at writing. Practitioners who keep debugging skills sharp report that this is what differentiates them from less-disciplined peers. Those who let it slide regret it.

Your sense of what's hard will calibrate differently. Things that were hard six months ago (boilerplate, plumbing, the second test file) are now trivial. Things that were medium (debugging, novel design) are now relatively harder because they're the residual after the easy work disappeared. This is normal and adaptive.

### 19.3 What will surprise you

The CLAUDE.md file becomes more valuable than you initially expect. By month six it is 300-500 lines of accumulated knowledge about your project, and re-reading it occasionally reminds you of decisions you'd forgotten you made. Senior engineers who've adopted this pattern report that the CLAUDE.md file is the single artifact they'd save if they had to abandon everything else.

The references corpus partially transfers across projects. The error-handling pattern from one Node project works as the starting point for the next. After two or three projects you have a personal library that gives you a substantial head start on anything you build. This is the actual long-term leverage.

The model improvements will outpace your methodology improvements. You will refine your workflow over six months and then the model release that drops in month seven invalidates some of your rules. This is fine; treat methodology as software, not as canon. The discipline of pruning CLAUDE.md is exactly the same discipline as the agent makes possible — both are about keeping the relevant and discarding the obsolete.

### 19.4 What probably won't happen

You probably won't reach Steinberger's 3-8 parallel-agent throughput. That requires both attention you don't have to spare and refactoring discipline at a level few solo developers maintain. One or two agents fully supervised is the realistic level for your scale and that's fine.

You probably won't build a Dark Factory. The validation infrastructure is too expensive to build alone, and without it the "no human review" rule is dangerous. The lighter version — read every diff, cross-model review on important changes — is the correct approximation.

You probably won't experience the *"never write code again"* future. Even the most aggressive adopters (Soderstrom's Spotify engineers, Tornhill, the Cloudflare vinext team) write some code by hand and emphasize that human judgment about maintainability and architecture remains the durable skill. The future is human-and-agent, not human-or-agent.

### 19.5 The thing worth absorbing

The patterns in this guide work because they treat agentic coding as a *power tool* with discipline around it, not as a *replacement* for engineering judgment. The vendors selling methodologies want you to believe their process is the value. The reality is closer to: agents are now genuinely capable, and the people who get the most out of them are the ones who maintain the underlying engineering discipline — the spec discipline, the review discipline, the architecture discipline — while letting the agent do the typing.

You are a single developer working on serious projects. The setup above is what works for that situation in 2026. Six months from now the specifics will have shifted; the discipline underneath will still apply. Build the discipline first; the tools will follow.

---

*End of guide. Length: ~30k words. Density chosen to be readable end-to-end in a single sitting but referenced selectively in practice.*

*The companion survey document (`sdd-and-factory-pattern.md`) covers the broader field and the research that informed these recommendations. This document is the actionable distillation for your specific situation. When in doubt, prefer this one for decisions; consult the survey when you want to understand the underlying landscape.*
