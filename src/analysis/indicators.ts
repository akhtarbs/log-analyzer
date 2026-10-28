// ---------------------------------------------------------------------------
// Heuristics that decide what is worth surfacing as an indicator of interest.
// Everything here only *flags* things for a human to look at — none of it is
// proof of an attack (plenty of "automated clients" are legitimate monitoring).
//
// These run once per event while a file is imported, so they are written to be
// cheap: single combined regexes, memoisation for values that repeat heavily
// (user agents), and a fast pre-check before the fuller payload patterns.
// ---------------------------------------------------------------------------
import { detectInjection, type InjectionTag } from './injection'

/** URL without its query string / fragment: "/a/b?x=1#top" → "/a/b". */
export function extractPath(url: string): string {
  const q = url.indexOf('?')
  const h = url.indexOf('#')
  const end = q === -1 ? (h === -1 ? url.length : h) : h === -1 ? q : Math.min(q, h)
  return url.slice(0, end)
}

/** "404" → 4, "200" → 2; anything that isn't a 3-digit HTTP status → null. */
export function statusClass(status: string | null): 2 | 3 | 4 | 5 | null {
  if (!status || status.length !== 3) return null
  const c = status.charCodeAt(0) - 48
  if (c < 2 || c > 5) return null
  const b = status.charCodeAt(1)
  const d = status.charCodeAt(2)
  if (b < 48 || b > 57 || d < 48 || d > 57) return null
  return c as 2 | 3 | 4 | 5
}

const STATUS_TEXT: Record<string, string> = {
  '200': 'OK', '201': 'Created', '204': 'No Content', '206': 'Partial Content',
  '301': 'Moved Permanently', '302': 'Found', '304': 'Not Modified', '307': 'Temporary Redirect', '308': 'Permanent Redirect',
  '400': 'Bad Request', '401': 'Unauthorized', '403': 'Forbidden', '404': 'Not Found', '405': 'Method Not Allowed',
  '408': 'Request Timeout', '413': 'Payload Too Large', '414': 'URI Too Long', '429': 'Too Many Requests',
  '500': 'Internal Server Error', '501': 'Not Implemented', '502': 'Bad Gateway', '503': 'Service Unavailable', '504': 'Gateway Timeout',
}

export function describeStatus(status: string): string {
  return STATUS_TEXT[status] ?? ''
}

// ---- Automated clients ------------------------------------------------------
// Security scanners, but also generic HTTP libraries and command-line tools.
const AUTOMATED_UA =
  /sqlmap|nikto|nmap|masscan|zgrab|nuclei|dirbuster|gobuster|wfuzz|ffuf|acunetix|nessus|openvas|burp|hydra|metasploit|wpscan|havij|arachni|w3af|zmap|censys|shodan|python-requests|python-urllib|python-httpx|aiohttp|go-http-client|libwww-perl|curl\/|wget\/|java\/|okhttp|scrapy|apache-httpclient|headlesschrome|phantomjs|powershell/i

const uaMemo = new Map<string, string | null>()

/** Name of the automated client a user agent matches ("sqlmap", "curl", ...), or null for anything else. */
export function classifyUserAgent(userAgent: string | null): string | null {
  if (!userAgent) return null
  const hit = uaMemo.get(userAgent)
  if (hit !== undefined) return hit
  const m = AUTOMATED_UA.exec(userAgent)
  const name = m ? m[0].toLowerCase().replace(/\/$/, '') : null
  if (uaMemo.size > 5000) uaMemo.clear() // user agents repeat heavily; the memo stays small
  uaMemo.set(userAgent, name)
  return name
}

export function isAutomatedClient(userAgent: string | null): boolean {
  return classifyUserAgent(userAgent) !== null
}

// ---- Sensitive paths --------------------------------------------------------
// Things almost nobody requests legitimately on a public site, but scanners ask for constantly.
const SENSITIVE_PATH =
  /\.env(\.|$|\/)|\.git(\/|$)|\.svn(\/|$)|\.hg(\/|$)|\.ds_store|\.htaccess|\.htpasswd|\.aws\/|\.ssh\/|id_rsa|wp-admin|wp-login|wp-config|xmlrpc\.php|phpmyadmin|\/pma(\/|$)|etc\/passwd|etc\/shadow|\/proc\/self|web\.config|config\.(php|json|yml|yaml|ini)(\.bak)?$|\.(bak|old|orig|swp)$|\/(backup|db|database|dump|site|www|wwwroot)\.(zip|tar|tgz|gz|rar|7z|sql)$|\/cgi-bin\/|\/actuator(\/|$)|server-status|\/manager\/html|\/boaform|\/vendor\/phpunit|\/solr\/|jndi:/i

// Real traffic hits the same few thousand paths over and over, so the (comparatively
// expensive) pattern is only evaluated once per distinct path.
const sensitiveMemo = new Map<string, boolean>()
const SENSITIVE_MEMO_MAX = 50_000

export function isSensitivePath(path: string): boolean {
  const hit = sensitiveMemo.get(path)
  if (hit !== undefined) return hit
  const result = SENSITIVE_PATH.test(path)
  if (sensitiveMemo.size >= SENSITIVE_MEMO_MAX) sensitiveMemo.clear()
  sensitiveMemo.set(path, result)
  return result
}

// ---- Injection-style payloads ----------------------------------------------
// A cheap first pass so the fuller pattern set only runs on the small share of requests that
// could plausibly carry a payload.
const PAYLOAD_HINT =
  /['"<>;|`$]|union|select|sleep|passwd|\/bin\/|cmd\.exe|powershell|wget|curl|information_schema|script|onerror|javascript|1\s*(=|%3d)\s*1|%27|%22|%3c|%3e|%3b|%7c|%60|%24/i

/** Query strings use "+" for a space, which decodeURIComponent leaves alone. */
function safeDecode(text: string): string {
  const spaced = text.includes('+') ? text.replace(/\+/g, ' ') : text
  if (!spaced.includes('%')) return spaced
  try {
    return decodeURIComponent(spaced.length > 4096 ? spaced.slice(0, 4096) : spaced)
  } catch {
    return spaced
  }
}

// A plain path ("/assets/app.js") has no room for a payload, so URLs without a query string or any
// special / percent-encoded character are skipped outright; for the rest only the query part is
// scanned. Path-based probes such as /etc/passwd are caught by isSensitivePath instead.
const QUICK_URL = /[?%'"<>;|`$]/

/** Distinct injection categories found in a request's URL and body (URL-decoded first). */
export function detectPayloadTags(url: string | null, body: string | null): InjectionTag[] {
  let text = ''
  if (url && QUICK_URL.test(url)) {
    const q = url.indexOf('?')
    text = q === -1 ? url : url.slice(q)
  }
  if (body) text = text ? `${text} ${body}` : body
  if (text.length <= 1 || !PAYLOAD_HINT.test(text)) return []
  const tags = new Set<InjectionTag>()
  for (const m of detectInjection(safeDecode(text))) tags.add(m.tag)
  return [...tags]
}
