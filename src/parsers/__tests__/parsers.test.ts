import { describe, it, expect } from 'vitest'
import { syslogParser } from '../syslog'
import { authParser } from '../auth'
import { apacheAccessParser, apacheErrorParser } from '../apache'
import { nginxAccessParser, nginxErrorParser } from '../nginx'
import { jsonlParser } from '../json'
import { csvParser, setCsvHeader, splitCsvLine } from '../csv'
import { genericParser } from '../generic'
import { detectParser } from '../index'
import { parseApacheTimestamp } from '../types'

describe('parseApacheTimestamp', () => {
  it('parses a Combined Log Format timestamp preserving seconds', () => {
    expect(parseApacheTimestamp('04/Aug/2026:08:02:14 +0700')).toBe(Date.parse('2026-08-04T01:02:14.000Z'))
  })

  it('handles a positive-offset and negative-offset timezone correctly', () => {
    expect(parseApacheTimestamp('10/Oct/2023:13:55:36 -0700')).toBe(Date.parse('2023-10-10T20:55:36.000Z'))
    expect(parseApacheTimestamp('10/Oct/2023:13:55:36 +0000')).toBe(Date.parse('2023-10-10T13:55:36.000Z'))
  })

  it('returns null for an unrecognized format', () => {
    expect(parseApacheTimestamp('not a timestamp')).toBeNull()
  })
})

describe('syslogParser', () => {
  it('parses a standard syslog line', () => {
    const line = 'Aug 14 08:21:01 server01 kernel: eth0: link up'
    expect(syslogParser.detect([line])).toBeGreaterThan(0)
    const parsed = syslogParser.parseLine(line)
    expect(parsed).not.toBeNull()
    expect(parsed?.hostname).toBe('server01')
    expect(parsed?.process).toBe('kernel')
  })
})

describe('authParser', () => {
  it('extracts src IP, port, username, and event type for failed SSH login', () => {
    const line = 'Aug 14 08:21:01 server sshd[1234]: Failed password for root from 192.168.1.20 port 52122 ssh2'
    const parsed = authParser.parseLine(line)
    expect(parsed).not.toBeNull()
    expect(parsed?.srcIp).toBe('192.168.1.20')
    expect(parsed?.srcPort).toBe(52122)
    expect(parsed?.username).toBe('root')
    expect(parsed?.eventType).toBe('SSH_LOGIN_FAILED')
  })

  it('recognizes successful logins', () => {
    const line = 'Aug 14 08:22:00 server sshd[1235]: Accepted password for deploy from 10.0.0.5 port 40111 ssh2'
    const parsed = authParser.parseLine(line)
    expect(parsed?.eventType).toBe('SSH_LOGIN_SUCCESS')
    expect(parsed?.severity).toBe('INFO')
  })
})

describe('apacheAccessParser', () => {
  it('parses combined log format', () => {
    const line = '127.0.0.1 - frank [10/Oct/2023:13:55:36 -0700] "GET /apache_pb.gif HTTP/1.0" 200 2326 "-" "Mozilla/5.0"'
    const parsed = apacheAccessParser.parseLine(line)
    expect(parsed?.srcIp).toBe('127.0.0.1')
    expect(parsed?.status).toBe('200')
    expect(parsed?.eventType).toBe('HTTP_200')
  })

  it('preserves seconds precision in the timestamp (regression test)', () => {
    // Previously the seconds field was silently dropped by a string-mangling
    // Date() parse; this must now round-trip exactly via parseApacheTimestamp.
    const line = '172.81.132.189 - - [04/Aug/2026:08:02:14 +0700] "GET /a HTTP/1.1" 404 100 "-" "curl/8.0"'
    const parsed = apacheAccessParser.parseLine(line)
    expect(parsed?.timestamp).not.toBeNull()
    expect(new Date(parsed!.timestamp!).toISOString()).toBe('2026-08-04T01:02:14.000Z')
  })

  it('extracts the full URL/path including double slashes and query-less paths', () => {
    const line = '172.81.132.189 - - [04/Aug/2026:08:02:14 +0700] "GET /public/blueimp/jquery-file-upload//bower.json HTTP/1.1" 404 10426 "-" "Mozilla/5.0 (X11; Ubuntu; Linux i686; rv:28.0) Gecko/20100101 Firefox/28.0"'
    const parsed = apacheAccessParser.parseLine(line)
    expect(parsed?.url).toBe('/public/blueimp/jquery-file-upload//bower.json')
    expect(parsed?.userAgent).toBe('Mozilla/5.0 (X11; Ubuntu; Linux i686; rv:28.0) Gecko/20100101 Firefox/28.0')
  })

  it('extracts url, http version, referer, and user agent', () => {
    const line = '192.168.1.20 - - [10/Oct/2023:13:55:36 -0700] "POST /api/login HTTP/1.1" 403 512 "https://example.com/home" "curl/8.0"'
    const parsed = apacheAccessParser.parseLine(line)
    expect(parsed?.url).toBe('/api/login')
    expect(parsed?.httpVersion).toBe('HTTP/1.1')
    expect(parsed?.referer).toBe('https://example.com/home')
    expect(parsed?.userAgent).toBe('curl/8.0')
  })

  it('handles Common Log Format lines with no referer/user-agent', () => {
    const line = '127.0.0.1 - frank [10/Oct/2023:13:55:36 -0700] "GET /index.html HTTP/1.0" 200 2326'
    const parsed = apacheAccessParser.parseLine(line)
    expect(parsed?.url).toBe('/index.html')
    expect(parsed?.referer).toBeNull()
    expect(parsed?.userAgent).toBeNull()
  })
})

describe('apacheErrorParser', () => {
  it('parses error log with client IP', () => {
    const line = '[Wed Oct 11 14:32:52 2023] [error] [client 192.168.1.10] File does not exist: /var/www/favicon.ico'
    const parsed = apacheErrorParser.parseLine(line)
    expect(parsed?.srcIp).toBe('192.168.1.10')
    expect(parsed?.severity).toBe('HIGH')
  })
})

describe('nginxAccessParser', () => {
  it('parses nginx combined access log', () => {
    const line = '192.168.1.20 - - [14/Aug/2026:08:21:01 +0000] "GET /login HTTP/1.1" 403 162 "-" "curl/8.0"'
    const parsed = nginxAccessParser.parseLine(line)
    expect(parsed?.srcIp).toBe('192.168.1.20')
    expect(parsed?.eventType).toBe('HTTP_403')
    expect(parsed?.url).toBe('/login')
    expect(parsed?.userAgent).toBe('curl/8.0')
  })

  it('preserves seconds precision in the timestamp (regression test)', () => {
    const line = '192.168.1.20 - - [14/Aug/2026:08:21:47 +0000] "GET /login HTTP/1.1" 403 162 "-" "curl/8.0"'
    const parsed = nginxAccessParser.parseLine(line)
    expect(new Date(parsed!.timestamp!).toISOString()).toBe('2026-08-14T08:21:47.000Z')
  })
})

describe('nginxErrorParser', () => {
  it('parses nginx error log with client field', () => {
    const line = '2026/08/14 08:21:01 [error] 1234#0: *1 connect() failed while connecting to upstream, client: 192.168.1.20'
    const parsed = nginxErrorParser.parseLine(line)
    expect(parsed?.srcIp).toBe('192.168.1.20')
  })
})

describe('jsonlParser', () => {
  it('maps common field name variants', () => {
    const line = JSON.stringify({ timestamp: '2026-08-14T08:21:01Z', src_ip: '192.168.1.20', event_type: 'SSH_LOGIN_FAILED', severity: 'high' })
    const parsed = jsonlParser.parseLine(line)
    expect(parsed?.srcIp).toBe('192.168.1.20')
    expect(parsed?.eventType).toBe('SSH_LOGIN_FAILED')
    expect(parsed?.severity).toBe('HIGH')
  })

  it('extracts url, user agent, referer, and request body from JSON fields', () => {
    const line = JSON.stringify({
      url: '/api/orders',
      user_agent: 'sqlmap/1.7',
      referrer: 'https://example.com',
      body: { id: 1 },
    })
    const parsed = jsonlParser.parseLine(line)
    expect(parsed?.url).toBe('/api/orders')
    expect(parsed?.userAgent).toBe('sqlmap/1.7')
    expect(parsed?.referer).toBe('https://example.com')
    expect(parsed?.requestBody).toBe(JSON.stringify({ id: 1 }))
  })

  it('returns null for invalid JSON', () => {
    expect(jsonlParser.parseLine('not json')).toBeNull()
  })
})

describe('csvParser', () => {
  it('parses rows using a previously set header', () => {
    setCsvHeader(splitCsvLine('timestamp,src_ip,event_type,status'))
    const parsed = csvParser.parseLine('2026-08-14T08:21:01Z,192.168.1.20,SSH_LOGIN_FAILED,FAILED')
    expect(parsed?.srcIp).toBe('192.168.1.20')
    expect(parsed?.eventType).toBe('SSH_LOGIN_FAILED')
  })
})

describe('genericParser', () => {
  it('always matches with low confidence and extracts an IP if present', () => {
    const line = 'random unrecognized log line from 8.8.8.8'
    expect(genericParser.detect([])).toBeGreaterThan(0)
    const parsed = genericParser.parseLine(line)
    expect(parsed?.srcIp).toBe('8.8.8.8')
  })
})

describe('detectParser (auto-detection)', () => {
  it('picks the auth parser for sshd lines', () => {
    const sample = ['Aug 14 08:21:01 server sshd[1234]: Failed password for root from 192.168.1.20 port 52122 ssh2']
    const parser = detectParser(sample, 'auth.log')
    expect(parser.name).toBe('linux_auth')
  })

  it('falls back to generic for unrecognized content', () => {
    const sample = ['totally unstructured free text with no known format']
    const parser = detectParser(sample, 'weird.txt')
    expect(parser.name).toBe('generic')
  })
})
