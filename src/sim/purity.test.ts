import { describe, expect, it } from 'vitest'

// CLAUDE.md: src/sim is pure TypeScript. No DOM, no clock, and no mutable state
// held between calls, so every function can be tested at any moment in time.
// This test guards that as the module grows.
//
// The sources are read with Vite's ?raw glob rather than node:fs because the
// project has no @types/node, so `import 'node:fs'` would not type-check. The
// glob is resolved on every run, so a file added to src/sim later is scanned too.
// Test files are excluded: they may legitimately touch the clock and the host.
//
// src/live/feed.ts is held to the same rules: it decides what a live vehicle is
// and how old it is, so it takes time as an argument too. So is
// src/live/estimate.ts, which decides where an estimated bus is drawn. Their
// neighbours poll.ts and busdata.ts fetch, and are deliberately NOT scanned.
const sources = import.meta.glob(['./*.ts', '../live/feed.ts', '../live/estimate.ts', '!./*.test.ts'], {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

const banned = [
  // `new Date(ms)` is fine - clock.ts converts a timestamp the caller supplied.
  // Reading the clock itself is not.
  { what: 'reads the clock with Date.now', pattern: /\bDate\.now\b/ },
  { what: 'touches the DOM via document', pattern: /\bdocument\b/ },
  // \b and the lower-case d/w keep `windows` and `HeadwayWindow` out of this.
  { what: 'touches the browser via window', pattern: /\bwindow\b/ },
  { what: 'declares top-level mutable state', pattern: /^(?:let|var)\b/ },
]

/** Every banned thing in one file, as "line 12: what: the offending line". */
function violations(source: string): string[] {
  const found: string[] = []
  source.split('\n').forEach((line, i) => {
    for (const rule of banned) {
      if (rule.pattern.test(line)) found.push(`line ${i + 1}: ${rule.what}: ${line.trim()}`)
    }
  })
  return found
}

describe('src/sim, src/live/feed.ts and src/live/estimate.ts stay pure', () => {
  const files = Object.keys(sources)

  it('scans the modules in src/sim and the live feed core, and only those', () => {
    // If the glob silently matched nothing, every test below would pass on air.
    expect(files).toContain('./sim.ts')
    expect(files).toContain('../live/feed.ts')
    expect(files).toContain('../live/estimate.ts')
    expect(files).not.toContain('../live/poll.ts')
    expect(files).not.toContain('../live/busdata.ts')
    expect(files.filter((f) => f.endsWith('.test.ts'))).toEqual([])
  })

  for (const file of files) {
    it(`${file} has no clock, no DOM and no top-level let or var`, () => {
      const found = violations(sources[file])
      expect(found, `${file}:\n  ${found.join('\n  ')}`).toEqual([])
    })
  }
})
