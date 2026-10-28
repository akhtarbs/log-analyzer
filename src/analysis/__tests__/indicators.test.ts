import { describe, it, expect } from 'vitest'
import {
  extractPath,
  statusClass,
  describeStatus,
  classifyUserAgent,
  isAutomatedClient,
  isSensitivePath,
  detectPayloadTags,
} from '../indicators'

describe('extractPath', () => {
  it('drops the query string and fragment', () => {
    expect(extractPath('/a/b?x=1&y=2')).toBe('/a/b')
    expect(extractPath('/a/b#top')).toBe('/a/b')
    expect(extractPath('/a/b?x=1#top')).toBe('/a/b')
    expect(extractPath('/public/blueimp/jquery-file-upload//bower.json')).toBe('/public/blueimp/jquery-file-upload//bower.json')
    expect(extractPath('')).toBe('')
  })
})

describe('statusClass', () => {
  it('maps HTTP status codes to their class and rejects anything else', () => {
    expect(statusClass('200')).toBe(2)
    expect(statusClass('301')).toBe(3)
    expect(statusClass('404')).toBe(4)
    expect(statusClass('503')).toBe(5)
    expect(statusClass('FAILED')).toBeNull()
    expect(statusClass('99')).toBeNull()
    expect(statusClass('1xx')).toBeNull()
    expect(statusClass('600')).toBeNull()
    expect(statusClass(null)).toBeNull()
  })
  it('describes common statuses', () => {
    expect(describeStatus('404')).toBe('Not Found')
    expect(describeStatus('999')).toBe('')
  })
})

describe('automated client detection', () => {
  it('names scanners, libraries and command-line tools', () => {
    expect(classifyUserAgent('sqlmap/1.7#stable (https://sqlmap.org)')).toBe('sqlmap')
    expect(classifyUserAgent('curl/8.4.0')).toBe('curl')
    expect(classifyUserAgent('python-requests/2.31.0')).toBe('python-requests')
    expect(classifyUserAgent('Go-http-client/1.1')).toBe('go-http-client')
    expect(classifyUserAgent('Mozilla/5.0 zgrab/0.x')).toBe('zgrab')
  })
  it('does not flag ordinary browsers, missing or empty user agents', () => {
    const chrome = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36'
    const firefox = 'Mozilla/5.0 (X11; Ubuntu; Linux i686; rv:28.0) Gecko/20100101 Firefox/28.0'
    expect(isAutomatedClient(chrome)).toBe(false)
    expect(isAutomatedClient(firefox)).toBe(false)
    expect(isAutomatedClient(null)).toBe(false)
    expect(isAutomatedClient('')).toBe(false)
  })
  it('gives the same answer on repeated calls (memoised)', () => {
    expect(classifyUserAgent('curl/7.1')).toBe(classifyUserAgent('curl/7.1'))
  })
})

describe('isSensitivePath', () => {
  it('flags files and endpoints that scanners probe for', () => {
    for (const p of ['/.env', '/.git/config', '/wp-login.php', '/wp-admin/admin-ajax.php', '/phpmyadmin/', '/xmlrpc.php',
      '/etc/passwd', '/.aws/credentials', '/backup.zip', '/config.php.bak', '/actuator/health', '/vendor/phpunit/src/Util/PHP/eval-stdin.php']) {
      expect(isSensitivePath(p), p).toBe(true)
    }
  })
  it('leaves ordinary paths alone (including archives that are normal downloads)', () => {
    for (const p of ['/', '/index.html', '/belawa/penduduk/statistik/2/2', '/download/laporan-2026.zip', '/public/blueimp/jquery-file-upload//bower.json', '/api/users', '/assets/app.js']) {
      expect(isSensitivePath(p), p).toBe(false)
    }
  })
})

describe('detectPayloadTags', () => {
  it('finds SQL injection, including URL-encoded forms with "+" for spaces', () => {
    expect(detectPayloadTags("/item?id=1' OR 1=1--", null)).toContain('SQL_INJECTION')
    expect(detectPayloadTags('/item?id=1%27%20OR%201=1--', null)).toContain('SQL_INJECTION')
    expect(detectPayloadTags('/item?id=1%27+OR+1=1--', null)).toContain('SQL_INJECTION')
    expect(detectPayloadTags('/item?id=1+UNION+SELECT+username,password+FROM+users', null)).toContain('SQL_INJECTION')
    expect(detectPayloadTags('/item?id=1+or+1=1', null)).toContain('SQL_INJECTION')
  })
  it('finds command injection and XSS in the URL or the request body', () => {
    expect(detectPayloadTags('/cgi-bin/x?cmd=cat%20/etc/passwd', null)).toContain('COMMAND_INJECTION')
    expect(detectPayloadTags('/search?q=%3Cscript%3Ealert(1)%3C/script%3E', null)).toContain('XSS')
    expect(detectPayloadTags('/login', '{"user":"a","note":"<script>alert(1)</script>"}')).toContain('XSS')
  })
  it('reports several categories when a request carries several', () => {
    const tags = detectPayloadTags("/x?a=<script>alert(1)</script>&b=' or 1=1 --", null)
    expect(tags).toContain('XSS')
    expect(tags).toContain('SQL_INJECTION')
  })
  it('stays quiet for ordinary requests, malformed encodings and empty input', () => {
    expect(detectPayloadTags('/index.html', null)).toEqual([])
    expect(detectPayloadTags('/search?q=halo+dunia&page=2', null)).toEqual([])
    expect(detectPayloadTags('/x?q=%E0%A4%A', null)).toEqual([]) // invalid percent-encoding must not throw
    expect(detectPayloadTags(null, null)).toEqual([])
  })
})
