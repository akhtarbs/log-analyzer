import { describe, it, expect } from 'vitest'
import { evalGroup, countConditions, describeGroup, normalizeFilterGroup } from '../filterEngine'
import type { FilterCondition, FilterGroup, LogEvent } from '../../types'

function makeEvent(overrides: Partial<LogEvent>): LogEvent {
  return {
    fileId: 1,
    timestamp: Date.now(),
    timestampRaw: null,
    hostname: null,
    logSource: null,
    eventType: 'SSH_LOGIN_FAILED',
    severity: 'MEDIUM',
    srcIp: '192.168.1.20',
    srcPort: null,
    dstIp: null,
    dstPort: null,
    protocol: null,
    username: 'root',
    process: null,
    action: null,
    status: null,
    message: null,
    rawLog: 'raw',
    mark: null,
    lineNumber: 0,
    url: null,
    httpVersion: null,
    userAgent: null,
    referer: null,
    requestBody: null,
    ...overrides,
  }
}

function cond(field: string, operator: FilterCondition['operator'], value: string): FilterCondition {
  return { id: crypto.randomUUID(), kind: 'condition', field, operator, value }
}

function group(combinator: 'AND' | 'OR', rules: FilterGroup['rules']): FilterGroup {
  return { id: crypto.randomUUID(), kind: 'group', combinator, rules }
}

describe('evalGroup — flat groups', () => {
  it('AND requires every condition to match', () => {
    const g = group('AND', [cond('severity', 'equals', 'MEDIUM'), cond('username', 'equals', 'root')])
    expect(evalGroup(makeEvent({}), g)).toBe(true)
    expect(evalGroup(makeEvent({ username: 'admin' }), g)).toBe(false)
  })

  it('OR requires at least one condition to match', () => {
    const g = group('OR', [cond('severity', 'equals', 'CRITICAL'), cond('username', 'equals', 'root')])
    expect(evalGroup(makeEvent({}), g)).toBe(true)
    expect(evalGroup(makeEvent({ username: 'admin', severity: 'LOW' }), g)).toBe(false)
  })

  it('an empty group matches everything', () => {
    expect(evalGroup(makeEvent({}), group('AND', []))).toBe(true)
  })
})

describe('evalGroup — nested groups with independent combinators', () => {
  it('applies a different combinator inside a nested group than the parent', () => {
    // top-level AND: srcIp must match AND (severity=CRITICAL OR severity=HIGH)
    const inner = group('OR', [cond('severity', 'equals', 'CRITICAL'), cond('severity', 'equals', 'HIGH')])
    const outer = group('AND', [cond('srcIp', 'equals', '192.168.1.20'), inner])

    expect(evalGroup(makeEvent({ severity: 'HIGH' }), outer)).toBe(true)
    expect(evalGroup(makeEvent({ severity: 'CRITICAL' }), outer)).toBe(true)
    expect(evalGroup(makeEvent({ severity: 'LOW' }), outer)).toBe(false)
    expect(evalGroup(makeEvent({ severity: 'HIGH', srcIp: '10.0.0.1' }), outer)).toBe(false)
  })

  it('supports multiple levels of nesting', () => {
    // (A AND B) OR (C AND D)
    const left = group('AND', [cond('username', 'equals', 'root'), cond('severity', 'equals', 'MEDIUM')])
    const right = group('AND', [cond('username', 'equals', 'admin'), cond('severity', 'equals', 'HIGH')])
    const top = group('OR', [left, right])

    expect(evalGroup(makeEvent({ username: 'root', severity: 'MEDIUM' }), top)).toBe(true)
    expect(evalGroup(makeEvent({ username: 'admin', severity: 'HIGH' }), top)).toBe(true)
    expect(evalGroup(makeEvent({ username: 'admin', severity: 'MEDIUM' }), top)).toBe(false)
    expect(evalGroup(makeEvent({ username: 'guest', severity: 'LOW' }), top)).toBe(false)
  })
})

describe('evalGroup — is_empty / is_not_empty operators', () => {
  it('is_empty matches null, undefined-ish, and blank string fields', () => {
    const g = group('AND', [cond('username', 'is_empty', '')])
    expect(evalGroup(makeEvent({ username: null }), g)).toBe(true)
    expect(evalGroup(makeEvent({ username: '' }), g)).toBe(true)
    expect(evalGroup(makeEvent({ username: 'root' }), g)).toBe(false)
  })

  it('is_not_empty matches only fields with a non-blank value', () => {
    const g = group('AND', [cond('url', 'is_not_empty', '')])
    expect(evalGroup(makeEvent({ url: '/login' }), g)).toBe(true)
    expect(evalGroup(makeEvent({ url: null }), g)).toBe(false)
  })

  it('combines with other conditions inside a nested group', () => {
    // srcIp equals X AND userAgent is not empty
    const g = group('AND', [cond('srcIp', 'equals', '192.168.1.20'), cond('userAgent', 'is_not_empty', '')])
    expect(evalGroup(makeEvent({ userAgent: 'curl/8.0' }), g)).toBe(true)
    expect(evalGroup(makeEvent({ userAgent: null }), g)).toBe(false)
  })
})

describe('countConditions', () => {
  it('counts leaf conditions across nested groups', () => {
    const inner = group('OR', [cond('severity', 'equals', 'CRITICAL'), cond('severity', 'equals', 'HIGH')])
    const outer = group('AND', [cond('srcIp', 'equals', '1.2.3.4'), inner])
    expect(countConditions(outer)).toBe(3)
  })
})

describe('describeGroup', () => {
  it('renders nested groups with parentheses', () => {
    const inner = group('OR', [cond('severity', 'equals', 'CRITICAL'), cond('severity', 'equals', 'HIGH')])
    const outer = group('AND', [cond('srcIp', 'equals', '1.2.3.4'), inner])
    expect(describeGroup(outer)).toBe('srcIp equals 1.2.3.4 AND (severity equals CRITICAL OR severity equals HIGH)')
  })
})

describe('normalizeFilterGroup', () => {
  it('converts legacy { combinator, conditions } shape into the nested { kind, rules } shape', () => {
    const legacy = {
      id: 'x',
      combinator: 'OR',
      conditions: [{ id: 'a', field: 'severity', operator: 'equals', value: 'HIGH' }],
    }
    const normalized = normalizeFilterGroup(legacy)
    expect(normalized.kind).toBe('group')
    expect(normalized.combinator).toBe('OR')
    expect(normalized.rules).toHaveLength(1)
    expect(normalized.rules[0].kind).toBe('condition')
  })

  it('passes through an already-nested shape unchanged in structure', () => {
    const modern = group('AND', [cond('severity', 'equals', 'HIGH')])
    const normalized = normalizeFilterGroup(modern)
    expect(normalized.rules).toHaveLength(1)
    expect(normalized.combinator).toBe('AND')
  })
})
