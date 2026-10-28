import type { Parser } from './types'
import { syslogParser } from './syslog'
import { authParser } from './auth'
import { apacheAccessParser, apacheErrorParser } from './apache'
import { nginxAccessParser, nginxErrorParser } from './nginx'
import { jsonParser, jsonlParser } from './json'
import { csvParser } from './csv'
import { genericParser } from './generic'

export const PARSERS: Parser[] = [
  authParser, // must run before syslog since auth lines also match generic syslog shape
  syslogParser,
  apacheAccessParser,
  apacheErrorParser,
  nginxAccessParser,
  nginxErrorParser,
  jsonlParser,
  csvParser,
  genericParser,
]

export function detectParser(sampleLines: string[], filename: string): Parser {
  const ext = filename.split('.').pop()?.toLowerCase()
  if (ext === 'json') return jsonParser
  if (ext === 'jsonl') return jsonlParser
  if (ext === 'csv') return csvParser

  let best = genericParser
  let bestScore = 0
  for (const p of PARSERS) {
    const score = p.detect(sampleLines)
    if (score > bestScore) {
      bestScore = score
      best = p
    }
  }
  return best
}

export { syslogParser, authParser, apacheAccessParser, apacheErrorParser, nginxAccessParser, nginxErrorParser, jsonParser, jsonlParser, csvParser, genericParser }
