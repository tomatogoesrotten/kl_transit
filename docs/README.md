# docs/

Writing that has to version alongside the code lives here. If the text would go stale the moment
someone changes a file in `src/`, it belongs in this folder, in the same commit as that change.
Everything else has a better home.

| Where | What goes there |
|---|---|
| `docs/` | Explanation tied to the code as it is today: decision records, notes on how a module works, anything that must change in the same commit as the code. |
| GitHub wiki | Long-lived explanation that isn't pinned to a commit: the architecture tour, the quirks of the GTFS feed, background on why the Klang Valley network looks the way it does. Editable without a pull request. |
| `openspec/` | Work in flight. `/opsx:propose` writes a proposal, spec, design and task list per change; `/opsx:archive` moves it to `openspec/changes/archive/` when it ships. Not a place to write essays. |
| `GUIDE.md` | The plan. Seven milestones, in order, and the pitfalls expected along the way. It describes what we're going to do. |
| `CLAUDE.md` | The rules. Stack, architecture, conventions, what we've learned about the feed, and the current status. It describes how we do things. |

Deciding where a new piece of writing goes:

- It records a choice between real options, and why the loser lost. That's an ADR: `docs/decisions/`.
- It explains the code and would be wrong after a refactor. `docs/`.
- It explains the domain, the city or the data, and stays true whatever the code does. The wiki.
- It's a plan for work not yet done. `openspec/` if it's the next change, GUIDE.md if it's a milestone.
- It's a rule Claude Code should follow every session. One line in CLAUDE.md, not a document.
