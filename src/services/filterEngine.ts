import type { FilterCondition, FilterGroup, FilterRule, LogEvent } from '../types'

function getFieldValue(log: LogEvent, field: string): string | number | null {
  const v = (log as any)[field]
  return v === undefined ? null : v
}

function evalCondition(log: LogEvent, cond: FilterCondition): boolean {
  const raw = getFieldValue(log, cond.field)
  const strVal = raw === null ? '' : String(raw).toLowerCase()
  const target = cond.value.toLowerCase()

  switch (cond.operator) {
    case 'is_empty':
      return raw === null || raw === undefined || String(raw).trim() === ''
    case 'is_not_empty':
      return raw !== null && raw !== undefined && String(raw).trim() !== ''
    case 'equals':
      return strVal === target
    case 'not_equals':
      return strVal !== target
    case 'contains':
      return strVal.includes(target)
    case 'not_contains':
      return !strVal.includes(target)
    case 'starts_with':
      return strVal.startsWith(target)
    case 'ends_with':
      return strVal.endsWith(target)
    case 'gt': {
      const a = typeof raw === 'number' ? raw : Number(raw)
      return !isNaN(a) && a > Number(cond.value)
    }
    case 'lt': {
      const a = typeof raw === 'number' ? raw : Number(raw)
      return !isNaN(a) && a < Number(cond.value)
    }
    case 'between': {
      const a = typeof raw === 'number' ? raw : Number(raw)
      const lo = Number(cond.value)
      const hi = Number(cond.value2 ?? cond.value)
      return !isNaN(a) && a >= lo && a <= hi
    }
    case 'in': {
      const options = cond.value.split(',').map((s) => s.trim().toLowerCase())
      return options.includes(strVal)
    }
    default:
      return true
  }
}

/** Evaluates a single rule — either a leaf condition or a nested group — against a log event. */
export function evalRule(log: LogEvent, rule: FilterRule): boolean {
  return rule.kind === 'condition' ? evalCondition(log, rule) : evalGroup(log, rule)
}

/**
 * Recursively evaluates a filter group. Each group applies its own AND/OR
 * combinator across its direct rules, and nested groups are evaluated the
 * same way — so combinators can differ at every level of nesting.
 */
export function evalGroup(log: LogEvent, group: FilterGroup): boolean {
  if (group.rules.length === 0) return true
  if (group.combinator === 'AND') {
    return group.rules.every((r) => evalRule(log, r))
  }
  return group.rules.some((r) => evalRule(log, r))
}

/** Counts leaf conditions anywhere in the tree, for "N active filters" style UI. */
export function countConditions(group: FilterGroup): number {
  return group.rules.reduce((sum, r) => sum + (r.kind === 'condition' ? 1 : countConditions(r)), 0)
}

/** Builds a short human-readable summary of a filter tree, e.g. "(severity equals HIGH AND srcIp equals 1.2.3.4) OR username contains admin". */
export function describeGroup(group: FilterGroup): string {
  if (group.rules.length === 0) return '(empty)'
  const parts = group.rules.map((r) => {
    if (r.kind !== 'condition') return `(${describeGroup(r)})`
    if (r.operator === 'is_empty' || r.operator === 'is_not_empty') {
      return `${r.field} ${r.operator.replace('_', ' ')}`
    }
    return `${r.field} ${r.operator.replace('_', ' ')} ${r.value}`
  })
  return parts.join(` ${group.combinator} `)
}

/**
 * Normalizes filter data that may have been saved under the old flat schema
 * ({ combinator, conditions: FilterCondition[] } with no `kind`) so older
 * saved filters keep working after upgrading to nested groups.
 */
export function normalizeFilterGroup(input: any): FilterGroup {
  if (!input) return { id: crypto.randomUUID(), kind: 'group', combinator: 'AND', rules: [] }
  if (input.kind === 'group' && Array.isArray(input.rules)) {
    return {
      id: input.id ?? crypto.randomUUID(),
      kind: 'group',
      combinator: input.combinator === 'OR' ? 'OR' : 'AND',
      rules: input.rules.map((r: any) => (r.kind === 'group' ? normalizeFilterGroup(r) : normalizeCondition(r))),
    }
  }
  // legacy shape: { combinator, conditions: [...] }
  if (Array.isArray(input.conditions)) {
    return {
      id: input.id ?? crypto.randomUUID(),
      kind: 'group',
      combinator: input.combinator === 'OR' ? 'OR' : 'AND',
      rules: input.conditions.map(normalizeCondition),
    }
  }
  return { id: crypto.randomUUID(), kind: 'group', combinator: 'AND', rules: [] }
}

function normalizeCondition(c: any): FilterCondition {
  return {
    id: c.id ?? crypto.randomUUID(),
    kind: 'condition',
    field: c.field ?? 'severity',
    operator: c.operator ?? 'equals',
    value: c.value ?? '',
    value2: c.value2,
  }
}

export const FILTERABLE_FIELDS = [
  { value: 'timestamp', label: 'Timestamp', type: 'number' },
  { value: 'severity', label: 'Severity', type: 'string' },
  { value: 'eventType', label: 'Event Type', type: 'string' },
  { value: 'srcIp', label: 'Source IP', type: 'string' },
  { value: 'dstIp', label: 'Destination IP', type: 'string' },
  { value: 'srcPort', label: 'Source Port', type: 'number' },
  { value: 'dstPort', label: 'Destination Port', type: 'number' },
  { value: 'username', label: 'Username', type: 'string' },
  { value: 'hostname', label: 'Hostname', type: 'string' },
  { value: 'protocol', label: 'Protocol', type: 'string' },
  { value: 'action', label: 'Action', type: 'string' },
  { value: 'status', label: 'Status', type: 'string' },
  { value: 'url', label: 'URL / Path', type: 'string' },
  { value: 'httpVersion', label: 'HTTP Version', type: 'string' },
  { value: 'userAgent', label: 'User Agent / Browser', type: 'string' },
  { value: 'referer', label: 'Referer', type: 'string' },
  { value: 'requestBody', label: 'Request Body / Data Sent', type: 'string' },
  { value: 'mark', label: 'Mark', type: 'string' },
] as const

export const OPERATORS: { value: FilterCondition['operator']; label: string }[] = [
  { value: 'equals', label: 'equals' },
  { value: 'not_equals', label: 'not equals' },
  { value: 'contains', label: 'contains' },
  { value: 'not_contains', label: 'not contains' },
  { value: 'starts_with', label: 'starts with' },
  { value: 'ends_with', label: 'ends with' },
  { value: 'gt', label: 'greater than' },
  { value: 'lt', label: 'less than' },
  { value: 'between', label: 'between' },
  { value: 'in', label: 'in (comma separated)' },
  { value: 'is_empty', label: 'is empty' },
  { value: 'is_not_empty', label: 'is not empty' },
]

/** Operators that don't need a value input in the UI. */
export const VALUELESS_OPERATORS: FilterCondition['operator'][] = ['is_empty', 'is_not_empty']
