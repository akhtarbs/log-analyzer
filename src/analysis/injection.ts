// Stateless, per-line detection for injection-style payloads.
// These are heuristics only — results are always framed as "potential suspicious
// activity", never as confirmed attacks.

const SQLI_PATTERNS = [/union\s+select/i, /or\s+1\s*=\s*1/i, /sleep\(/i, /information_schema/i, /select\s+\*/i]

const CMDI_PATTERNS = [/\/etc\/passwd/i, /\/bin\/sh/i, /cmd\.exe/i, /powershell/i, /\bwget\b/i, /\bcurl\b/i]

const XSS_PATTERNS = [/<script/i, /onerror\s*=/i, /javascript:/i, /<img[^>]+onload/i]

export type InjectionTag = 'SQL_INJECTION' | 'COMMAND_INJECTION' | 'XSS'

export interface InjectionMatch {
  tag: InjectionTag
  pattern: string
}

export function detectInjection(text: string): InjectionMatch[] {
  const matches: InjectionMatch[] = []
  for (const re of SQLI_PATTERNS) {
    if (re.test(text)) matches.push({ tag: 'SQL_INJECTION', pattern: re.source })
  }
  for (const re of CMDI_PATTERNS) {
    if (re.test(text)) matches.push({ tag: 'COMMAND_INJECTION', pattern: re.source })
  }
  for (const re of XSS_PATTERNS) {
    if (re.test(text)) matches.push({ tag: 'XSS', pattern: re.source })
  }
  return matches
}
