import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { db } from '../../db/database'
import { StatsAccumulator } from '../../analysis/aggregate'
import { TimezoneProvider } from '../../hooks/useTimezone'
import { peekExplorerTarget, clearExplorerTarget } from '../../services/explorerTarget'
import { Analysis } from '../Analysis'

type Ev = Parameters<StatsAccumulator['add']>[0]
const T0 = Date.UTC(2026, 7, 4, 0, 0, 0)

function ev(o: Partial<Ev>): Ev {
  return {
    timestamp: T0, severity: 'INFO', srcIp: '10.0.0.1', dstIp: null, username: null, eventType: 'HTTP_200',
    userAgent: 'Mozilla/5.0 (X11; Ubuntu) Firefox/28.0', url: '/index.html', status: '200', action: 'GET', ...o,
  }
}

async function seed() {
  const acc = new StatsAccumulator()
  // a scanner: 600 requests over two days, all errors, sensitive path, sqlmap
  for (let i = 0; i < 600; i++) acc.add(ev({ srcIp: '185.191.171.18', status: '404', userAgent: 'sqlmap/1.7', url: '/.env', timestamp: T0 + i * 280_000 }))
  // ordinary visitors
  for (let i = 0; i < 400; i++) acc.add(ev({ srcIp: `10.0.${i % 20}.1`, timestamp: T0 + i * 420_000 }))
  const fileId = await db.logFiles.add({
    name: 'access.log', size: 1, importedAt: Date.now(), eventCount: 1000, parser: 'apache_access',
    processingTimeMs: 0, storeOriginal: false, active: true,
  })
  await db.fileStats.put(acc.finish(fileId))
}

function renderPage() {
  render(
    <TimezoneProvider>
      <MemoryRouter initialEntries={['/analysis']}>
        <Routes>
          <Route path="/analysis" element={<Analysis />} />
          <Route path="/logs" element={<div>EXPLORER PAGE</div>} />
        </Routes>
      </MemoryRouter>
    </TimezoneProvider>,
  )
}

beforeEach(async () => {
  vi.spyOn(console, 'info').mockImplementation(() => {})
  localStorage.clear()
  sessionStorage.clear()
  clearExplorerTarget()
  await Promise.all([db.logs.clear(), db.logFiles.clear(), db.fileStats.clear()])
})

describe('Analysis page', () => {
  it('shows the summary, key findings and a timeline from the stored statistics', async () => {
    await seed()
    renderPage()

    expect(await screen.findByText('1,000')).toBeTruthy() // requests
    expect(screen.getAllByText('60%').length).toBeGreaterThanOrEqual(2) // errors and automated both 600/1000
    expect(await screen.findByText(/185\.191\.171\.18 — 600 requests/)).toBeTruthy()
    expect(screen.getByText(/automated client \(sqlmap\)/)).toBeTruthy()
    expect(screen.getByText(/requests to sensitive paths/)).toBeTruthy()
    expect(screen.getByRole('img', { name: /bar chart of events/i })).toBeTruthy()
  })

  it('opens the Log Explorer filtered to an address when its finding is clicked', async () => {
    await seed()
    renderPage()

    fireEvent.click((await screen.findAllByTitle('Open the matching events in the Log Explorer'))[0])
    expect(await screen.findByText('EXPLORER PAGE')).toBeTruthy()
    const t = peekExplorerTarget()
    expect(t?.filter?.rules[0]).toMatchObject({ field: 'srcIp', operator: 'equals', value: '185.191.171.18' })
  })

  it('lists indicators by tab, and a row opens a detail view that can open the explorer', async () => {
    await seed()
    renderPage()

    const tabs = await screen.findByRole('tablist', { name: /indicator type/i })
    expect(within(tabs).getAllByRole('tab').map((t) => t.textContent)).toEqual(['Source IP', 'User Agent', 'URL / Path', 'Status'])

    fireEvent.click(within(tabs).getByRole('tab', { name: 'User Agent' }))
    const row = (await screen.findByText('sqlmap/1.7')).closest('button')!
    expect(within(row).getByText('Automated (sqlmap)')).toBeTruthy()

    fireEvent.click(row)
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('User agent')).toBeTruthy()
    fireEvent.click(within(dialog).getByRole('button', { name: /open in log explorer/i }))

    expect(await screen.findByText('EXPLORER PAGE')).toBeTruthy()
    expect(peekExplorerTarget()?.filter?.rules[0]).toMatchObject({ field: 'userAgent', value: 'sqlmap/1.7' })
  })

  it('closes the detail view with Escape', async () => {
    await seed()
    renderPage()
    const row = (await screen.findAllByTitle('Show details'))[0]
    fireEvent.click(row)
    expect(await screen.findByRole('dialog')).toBeTruthy()
    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('shows an empty state when no events are included', async () => {
    renderPage()
    expect(await screen.findByText(/No events in the included files/)).toBeTruthy()
  })

  it('builds missing statistics itself for files imported before they were stored', async () => {
    // a file with rows but no stored statistics: the page must backfill, then show them
    const fileId = await db.logFiles.add({
      name: 'old.log', size: 1, importedAt: 1, eventCount: 3, parser: 'apache_access',
      processingTimeMs: 0, storeOriginal: false, active: true,
    })
    const mk = (i: number) => ({
      fileId, timestamp: T0 + i * 1000, timestampRaw: null, hostname: null, logSource: null, eventType: 'HTTP_200',
      severity: 'INFO' as const, srcIp: '3.3.3.3', srcPort: null, dstIp: null, dstPort: null, protocol: null, username: null,
      process: null, action: 'GET', status: '200', message: null, rawLog: `r${i}`, mark: null, lineNumber: i,
      url: '/a', httpVersion: null, userAgent: null, referer: null, requestBody: null,
    })
    await db.logs.bulkAdd([mk(1), mk(2), mk(3)])
    renderPage()
    await waitFor(async () => expect((await db.fileStats.get(fileId))?.totalEvents).toBe(3))
    // the Requests card shows the rebuilt total
    await waitFor(() => expect(screen.getByText('Requests').nextElementSibling?.textContent).toBe('3'))
  })
})
