# Decision records

An ADR (Architecture Decision Record) is a short note saying that we chose one thing over another,
what the situation was at the time, and what we now have to live with as a result. It exists because
six months later the choice looks arbitrary and nobody remembers the alternative that was rejected,
or why. An ADR is never edited to change the decision: if we later decide differently, that is a new
record, and the old one is marked superseded.

To add one, copy the shape of an existing file. Name it `NNNN-short-title.md`, where `NNNN` is the
next number in sequence, zero-padded, and the title is lower-case and hyphenated. Give it a status
(Proposed, Accepted, Superseded) and a date, then three headings: **Context** (what was true that
forced a choice), **Decision** (what we did, in the present tense), and **Consequences** (what this
buys us, and what it costs us later). Keep it to a page. If it needs more than that, it's probably a
design document, and that belongs in `openspec/changes/`.

| Number | Title | Status |
|---|---|---|
| [0001](0001-maplibre-v6-and-direct-json-import.md) | MapLibre v6, and importing network.json directly | Accepted |
| [0002](0002-sim-port-conventions.md) | Conventions fixed by the simulation port | Accepted |
| [0003](0003-maplibre-overlay.md) | MapLibreOverlay, not MapboxOverlay | Accepted |
