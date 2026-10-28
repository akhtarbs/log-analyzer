import { describe, it, expect, beforeEach } from 'vitest'
import {
  ipTarget,
  pathTarget,
  pathsTarget,
  userAgentTarget,
  timeRangeTarget,
  stashExplorerTarget,
  peekExplorerTarget,
  clearExplorerTarget,
  openInExplorer,
} from '../explorerTarget'
import { evalGroup } from '../filterEngine'
import type { LogEvent } from '../../types'

const log = (o: Partial<LogEvent>): LogEvent => ({
  fileId: 1, timestamp: 1, timestampRaw: null, hostname: null, logSource: null, eventType: null, severity: 'INFO',
  srcIp: null, srcPort: null, dstIp: null, dstPort: null, protocol: null, username: null, process: null, action: null,
  status: null, message: null, rawLog: '', mark: null, lineNumber: 1, url: null, httpVersion: null, userAgent: null,
  referer: null, requestBody: null, ...o,
})

beforeEach(() => sessionStorage.clear())

describe('target builders', () => {
  it('an IP target matches exactly that address', () => {
    const g = ipTarget('1.2.3.4').filter!
    expect(evalGroup(log({ srcIp: '1.2.3.4' }), g)).toBe(true)
    expect(evalGroup(log({ srcIp: '1.2.3.45' }), g)).toBe(false)
  })

  it('a path target matches the bare path and the path with a query string — but not longer paths', () => {
    const g = pathTarget('/search').filter!
    expect(evalGroup(log({ url: '/search' }), g)).toBe(true)
    expect(evalGroup(log({ url: '/search?q=1' }), g)).toBe(true)
    expect(evalGroup(log({ url: '/search/advanced' }), g)).toBe(false)
    expect(evalGroup(log({ url: '/searching' }), g)).toBe(false)
  })

  it('several paths are OR-ed together', () => {
    const g = pathsTarget(['/.env', '/wp-login.php']).filter!
    expect(g.combinator).toBe('OR')
    expect(evalGroup(log({ url: '/wp-login.php?a=1' }), g)).toBe(true)
    expect(evalGroup(log({ url: '/.env' }), g)).toBe(true)
    expect(evalGroup(log({ url: '/index.html' }), g)).toBe(false)
  })

  it('values long enough to have been truncated when counted are matched by prefix, not equality', () => {
    const long = 'Mozilla/5.0 ' + 'x'.repeat(600)
    const stored = long.slice(0, 512) // what the statistics hold
    const g = userAgentTarget(stored).filter!
    expect(evalGroup(log({ userAgent: long }), g)).toBe(true)
    expect(g.rules[0]).toMatchObject({ operator: 'starts_with' })
  })

  it('a time-range target carries inclusive bounds', () => {
    expect(timeRangeTarget(10, 19).timeRange).toEqual({ start: 10, end: 19 })
  })
})

describe('hand-over through sessionStorage', () => {
  it('peek does not consume (safe under StrictMode); clear removes', () => {
    stashExplorerTarget(ipTarget('9.9.9.9'))
    expect(peekExplorerTarget()).not.toBeNull()
    expect(peekExplorerTarget()).not.toBeNull()
    clearExplorerTarget()
    expect(peekExplorerTarget()).toBeNull()
  })

  it('openInExplorer stores the target and navigates to the explorer', () => {
    const visited: string[] = []
    openInExplorer((to) => visited.push(to), timeRangeTarget(1, 2))
    expect(visited).toEqual(['/logs?applyTarget=1'])
    expect(peekExplorerTarget()?.timeRange).toEqual({ start: 1, end: 2 })
  })

  it('returns null for corrupt stored data', () => {
    sessionStorage.setItem('log-analyzer:explorer-target', '{not json')
    expect(peekExplorerTarget()).toBeNull()
  })
})
