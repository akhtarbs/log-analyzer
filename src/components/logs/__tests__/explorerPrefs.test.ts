import { describe, it, expect, beforeEach } from 'vitest'
import { ALL_COLUMNS, DEFAULT_VISIBLE_COLUMNS, loadVisibleColumns, saveVisibleColumns } from '../columns'
import { loadExplorerView, saveExplorerView } from '../viewState'
import { FILTERABLE_FIELDS } from '../../../services/filterEngine'
import { emptyFilterGroup } from '../../filters/FilterBuilder'

beforeEach(() => localStorage.clear())

describe('default columns', () => {
  it('are timestamp, source IP, URL and the full raw log', () => {
    expect(DEFAULT_VISIBLE_COLUMNS).toEqual(['timestamp', 'srcIp', 'url', 'rawLog'])
    expect(loadVisibleColumns()).toEqual(['timestamp', 'srcIp', 'url', 'rawLog'])
  })

  it('there is no parser column or parser filter field any more', () => {
    expect(ALL_COLUMNS.map((c) => c.key)).not.toContain('parser')
    expect(FILTERABLE_FIELDS.map((f) => f.value)).not.toContain('parser')
  })

  it("an older release's saved selection is not carried over, so everyone gets the new defaults once", () => {
    localStorage.setItem('log-analyzer:visible-columns', JSON.stringify(['timestamp', 'message', 'parser']))
    expect(loadVisibleColumns()).toEqual(DEFAULT_VISIBLE_COLUMNS)
  })

  it('a new selection is remembered, drops unknown keys, and always keeps timestamp', () => {
    saveVisibleColumns(['srcIp', 'status', 'parser', 'bogus'])
    expect(loadVisibleColumns()).toEqual(['timestamp', 'srcIp', 'status'])
  })
})

describe('Log Explorer view state', () => {
  it('round-trips search, filters, sort, page size, page and time range', () => {
    saveExplorerView({
      search: 'wp-admin',
      quickFilter: 'HIGH',
      filterGroup: emptyFilterGroup(),
      sortDir: 'asc',
      pageSize: 300,
      page: 7,
      timeRange: { start: 1000, end: 2000 },
    })
    const v = loadExplorerView()
    expect(v).toMatchObject({ search: 'wp-admin', quickFilter: 'HIGH', sortDir: 'asc', pageSize: 300, page: 7, timeRange: { start: 1000, end: 2000 } })
    expect(v.filterGroup?.kind).toBe('group')
  })

  it('ignores invalid or tampered values instead of breaking the page', () => {
    localStorage.setItem(
      'log-analyzer:explorer-view-v1',
      JSON.stringify({ search: 5, quickFilter: 'nope', sortDir: 'sideways', pageSize: 7, page: -3, timeRange: { start: 'x', end: null } }),
    )
    const v = loadExplorerView()
    expect(v.search).toBeUndefined()
    expect(v.quickFilter).toBeUndefined()
    expect(v.sortDir).toBeUndefined()
    expect(v.pageSize).toBeUndefined() // not one of 100/200/300/500
    expect(v.page).toBeUndefined()
    expect(v.timeRange).toEqual({ start: null, end: null })
  })

  it('returns nothing for empty or corrupt storage', () => {
    expect(loadExplorerView()).toEqual({})
    localStorage.setItem('log-analyzer:explorer-view-v1', '{not json')
    expect(loadExplorerView()).toEqual({})
  })
})
