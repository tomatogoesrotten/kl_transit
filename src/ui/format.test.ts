import { describe, expect, it } from 'vitest'
import { klNow } from '../sim'
import type { KlTime } from '../sim'
import { NO_REJECTS } from '../live/feed'
import {
  ago,
  dateLine,
  dur,
  hhmmss,
  ink,
  liveStatusLine,
  mapLabel,
  rejectLine,
  shortDateLine,
  stateLine,
  stopsLine,
  viewSentence,
} from './format'

describe('dur', () => {
  it('says "now" rather than counting the last few seconds down', () => {
    expect(dur(0)).toBe('now')
    expect(dur(19.9)).toBe('now')
  })

  it('rounds seconds to five, so a countdown does not flicker', () => {
    expect(dur(20)).toBe('20 s')
    expect(dur(32)).toBe('30 s')
    expect(dur(33)).toBe('35 s')
    expect(dur(89)).toBe('90 s')
  })

  it('switches to minutes at ninety seconds', () => {
    expect(dur(90)).toBe('2 min')
    expect(dur(240)).toBe('4 min')
    expect(dur(3600)).toBe('60 min')
  })
})

describe('hhmmss', () => {
  it('formats seconds after midnight', () => {
    expect(hhmmss(0)).toBe('00:00:00')
    expect(hhmmss(7 * 3600 + 45 * 60 + 9)).toBe('07:45:09')
    expect(hhmmss(86399.9)).toBe('23:59:59')
  })

  it('wraps, so a trip past midnight still reads as a time', () => {
    expect(hhmmss(-60)).toBe('23:59:00')
    expect(hhmmss(86400 + 90)).toBe('00:01:30')
  })
})

describe('dateLine', () => {
  // Saturday 20 September 2025, 22:00 in Kuala Lumpur.
  const sat = klNow(Date.UTC(2025, 8, 20, 14, 0, 0))

  it('names the day and month a Kuala Lumpur clock is on', () => {
    expect(dateLine(sat)).toBe('Saturday 20 Sep, Kuala Lumpur')
    expect(shortDateLine(sat)).toBe('Sat 20 Sep, KL time')
  })

  it('reads t.month as 1-based', () => {
    // The off-by-one that would shift every month by one and still look
    // plausible: `getUTCMonth()` was 0-based, `KlTime.month` is not.
    const jan: KlTime = { ...sat, month: 1, day: 1 }
    const dec: KlTime = { ...sat, month: 12, day: 31 }
    expect(dateLine(jan)).toContain('Jan')
    expect(dateLine(dec)).toContain('Dec')
  })
})

describe('stateLine', () => {
  it('names the timetable and what the clock is doing', () => {
    expect(stateLine('MonFri', 'live', 1)).toBe('Weekday timetable, live clock')
    expect(stateLine('Sat', 'paused', 10)).toBe('Saturday timetable, paused')
    expect(stateLine('Sun', 'running', 60)).toBe('Sunday timetable, 60× speed')
  })

  it('says nothing extra after a scrub at real speed, as the prototype did', () => {
    expect(stateLine('MonFri', 'running', 1)).toBe('Weekday timetable')
  })
})

describe('ink', () => {
  it('picks the text colour a line’s own colour can be read in', () => {
    expect(ink('#ffffff')).toBe('#15202b')
    expect(ink('#000000')).toBe('#ffffff')
    // The feed's own extremes: the Putrajaya line's yellow is the only one in
    // it light enough to need dark text.
    expect(ink('#FFCD00')).toBe('#15202b')
    expect(ink('#115740')).toBe('#ffffff')
  })
})

describe('ago', () => {
  it('counts seconds for two minutes, then whole minutes rounded down', () => {
    expect(ago(0)).toBe('0 s ago')
    expect(ago(45.6)).toBe('45 s ago')
    expect(ago(119)).toBe('119 s ago')
    expect(ago(120)).toBe('2 min ago')
    expect(ago(239)).toBe('3 min ago')
    // The moment a report turns stale, the label says four minutes.
    expect(ago(240)).toBe('4 min ago')
  })
})

describe('rejectLine', () => {
  it('says nothing when every position was usable', () => {
    expect(rejectLine(NO_REJECTS)).toBe('')
  })

  it('names the reason for one kind', () => {
    expect(rejectLine({ ...NO_REJECTS, nullIsland: 1 })).toBe(
      '1 position unusable: reported at 0,0.',
    )
  })

  it('counts each reason when there are several', () => {
    expect(rejectLine({ ...NO_REJECTS, nullIsland: 1, outside: 2 })).toBe(
      '3 positions unusable: 1 reported at 0,0, 2 outside Peninsular Malaysia.',
    )
  })
})

describe('liveStatusLine', () => {
  const NOW = 1_790_309_400_000
  const status = (state: Parameters<typeof liveStatusLine>[0]['state'], lastOkMs: number | null = NOW - 90_000) => ({
    state,
    lastOkMs,
    rejected: NO_REJECTS,
  })

  it('says how many are shown when the feed is healthy', () => {
    expect(liveStatusLine(status('ok'), 121, NOW)).toBe('121 shown, from live GPS.')
  })

  it('says an empty response was empty, and that earlier ones are still drawn', () => {
    expect(liveStatusLine(status('empty'), 8, NOW)).toBe(
      'The latest response was empty. 8 still shown from earlier reports.',
    )
  })

  it('says a failure is a failure, and when the feed last answered', () => {
    expect(liveStatusLine(status('unavailable'), 0, NOW)).toBe(
      'Feed unavailable. Last answered 90 s ago.',
    )
    expect(liveStatusLine(status('rate-limited', null), 0, NOW)).toMatch(
      /^Rate-limited by the API.*It has not answered yet\.$/,
    )
  })

  it('adds the unusable positions to the line', () => {
    const s = { ...status('ok'), rejected: { ...NO_REJECTS, nullIsland: 1 } }
    expect(liveStatusLine(s, 8, NOW)).toBe(
      '8 shown, from live GPS. 1 position unusable: reported at 0,0.',
    )
  })
})

describe('the view wording', () => {
  it.each(['rail', 'bus'] as const)('keeps both kinds of position plain in the %s view', (view) => {
    const label = mapLabel(view)
    expect(label).toMatch(/trains placed by the timetable/)
    expect(label).toMatch(/live GPS/)
    expect(label).toContain(viewSentence(view))
    // Nothing is estimated until stage 4 moves buses between reports.
    expect(label).not.toMatch(/estimat/i)
  })

  it('names what each view puts in front', () => {
    expect(viewSentence('rail')).toMatch(/^Rail view: the rail network in front/)
    expect(viewSentence('bus')).toMatch(/^Bus view: .*live GPS.*bus stops.*rail network dimmed/)
  })
})

describe('stopsLine', () => {
  it('says loading and unavailable, and nothing once ready or before asking', () => {
    expect(stopsLine('loading')).toBe('Loading bus stops…')
    expect(stopsLine('failed')).toMatch(/^Bus stops are unavailable/)
    expect(stopsLine('ready')).toBe('')
    expect(stopsLine('idle')).toBe('')
  })
})
