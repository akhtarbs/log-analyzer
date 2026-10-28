import { Plus, FolderPlus, Trash2, X } from 'lucide-react'
import type { FilterCondition, FilterGroup, FilterRule } from '../../types'
import { FILTERABLE_FIELDS, OPERATORS, VALUELESS_OPERATORS } from '../../services/filterEngine'
import { Button } from '../ui/Button'

export function newCondition(): FilterCondition {
  return { id: crypto.randomUUID(), kind: 'condition', field: 'severity', operator: 'equals', value: '' }
}

export function emptyFilterGroup(): FilterGroup {
  return { id: crypto.randomUUID(), kind: 'group', combinator: 'AND', rules: [] }
}

function newNestedGroup(): FilterGroup {
  return { id: crypto.randomUUID(), kind: 'group', combinator: 'AND', rules: [newCondition()] }
}

// Left-border accent color rotates with nesting depth so nested groups stay
// visually distinguishable without relying on color meaning alone.
const DEPTH_BORDER = ['var(--color-accent)', 'var(--color-medium)', 'var(--color-low)', 'var(--color-text-faint)']

interface FilterBuilderProps {
  group: FilterGroup
  onChange: (g: FilterGroup) => void
  onClose: () => void
  onApply: () => void
  onSave: () => void
}

export function FilterBuilder({ group, onChange, onClose, onApply, onSave }: FilterBuilderProps) {
  return (
    <div className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg-raised)] p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Filter Builder</h3>
        <button onClick={onClose} className="text-[color:var(--color-text-muted)] hover:text-[color:var(--color-text)]">
          <X size={16} />
        </button>
      </div>

      <p className="text-[11px] text-[color:var(--color-text-faint)]">
        Combine with (AND/OR) applies per group — add a nested group to change the combinator for just that part of the filter.
      </p>

      <GroupEditor group={group} onChange={onChange} depth={0} />

      <div className="flex items-center justify-end gap-2 pt-1 border-t border-[color:var(--color-border)]">
        <Button variant="secondary" size="sm" onClick={onSave}>Save Filter</Button>
        <Button variant="primary" size="sm" onClick={onApply}>Apply</Button>
      </div>
    </div>
  )
}

function GroupEditor({
  group,
  onChange,
  onRemove,
  depth,
}: {
  group: FilterGroup
  onChange: (g: FilterGroup) => void
  onRemove?: () => void
  depth: number
}) {
  const updateRule = (id: string, updated: FilterRule) => {
    onChange({ ...group, rules: group.rules.map((r) => (r.id === id ? updated : r)) })
  }

  const removeRule = (id: string) => {
    onChange({ ...group, rules: group.rules.filter((r) => r.id !== id) })
  }

  const addCondition = () => {
    onChange({ ...group, rules: [...group.rules, newCondition()] })
  }

  const addGroup = () => {
    onChange({ ...group, rules: [...group.rules, newNestedGroup()] })
  }

  const borderColor = DEPTH_BORDER[Math.min(depth, DEPTH_BORDER.length - 1)]

  return (
    <div
      className={depth > 0 ? 'pl-3 space-y-2.5' : 'space-y-2.5'}
      style={depth > 0 ? { borderLeft: `2px solid ${borderColor}` } : undefined}
    >
      {depth > 0 && (
        <div className="flex items-center justify-between">
          <span className="text-[9px] uppercase tracking-wide font-semibold" style={{ color: borderColor }}>
            Nested group
          </span>
          {onRemove && (
            <button onClick={onRemove} className="text-[color:var(--color-text-faint)] hover:text-[color:var(--color-critical)]">
              <Trash2 size={13} />
            </button>
          )}
        </div>
      )}

      {group.rules.length > 1 && (
        <div className="flex items-center gap-2 text-xs">
          <span className="text-[color:var(--color-text-muted)]">Combine with</span>
          <div className="flex rounded-md border border-[color:var(--color-border-strong)] overflow-hidden">
            {(['AND', 'OR'] as const).map((c) => (
              <button
                key={c}
                onClick={() => onChange({ ...group, combinator: c })}
                className={`px-2.5 py-1 font-medium ${
                  group.combinator === c
                    ? 'bg-[color:var(--color-accent)]/15 text-[color:var(--color-accent-strong)]'
                    : 'text-[color:var(--color-text-muted)]'
                }`}
              >
                {c}
              </button>
            ))}
          </div>
          <span className="text-[10px] text-[color:var(--color-text-faint)]">applies to this group's {group.rules.length} rules</span>
        </div>
      )}

      <div className="space-y-2">
        {group.rules.map((rule) =>
          rule.kind === 'condition' ? (
            <ConditionRow
              key={rule.id}
              condition={rule}
              onChange={(updated) => updateRule(rule.id, updated)}
              onRemove={() => removeRule(rule.id)}
            />
          ) : (
            <GroupEditor
              key={rule.id}
              group={rule}
              onChange={(updated) => updateRule(rule.id, updated)}
              onRemove={() => removeRule(rule.id)}
              depth={depth + 1}
            />
          ),
        )}
      </div>

      {group.rules.length === 0 && (
        <p className="text-xs text-[color:var(--color-text-faint)]">No conditions yet — add one below.</p>
      )}

      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={addCondition}>
          <Plus size={14} /> Add condition
        </Button>
        <Button variant="ghost" size="sm" onClick={addGroup}>
          <FolderPlus size={14} /> Add nested group
        </Button>
      </div>
    </div>
  )
}

function ConditionRow({
  condition,
  onChange,
  onRemove,
}: {
  condition: FilterCondition
  onChange: (c: FilterCondition) => void
  onRemove: () => void
}) {
  const isValueless = VALUELESS_OPERATORS.includes(condition.operator)

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        value={condition.field}
        onChange={(e) => onChange({ ...condition, field: e.target.value })}
        className="rounded-md border border-[color:var(--color-border-strong)] bg-[color:var(--color-surface)] px-2 py-1.5 text-xs"
      >
        {FILTERABLE_FIELDS.map((f) => (
          <option key={f.value} value={f.value}>{f.label}</option>
        ))}
      </select>
      <select
        value={condition.operator}
        onChange={(e) => onChange({ ...condition, operator: e.target.value as any })}
        className="rounded-md border border-[color:var(--color-border-strong)] bg-[color:var(--color-surface)] px-2 py-1.5 text-xs"
      >
        {OPERATORS.map((op) => (
          <option key={op.value} value={op.value}>{op.label}</option>
        ))}
      </select>
      {!isValueless && (
        <input
          value={condition.value}
          onChange={(e) => onChange({ ...condition, value: e.target.value })}
          placeholder="Value"
          className="flex-1 min-w-[120px] rounded-md border border-[color:var(--color-border-strong)] bg-[color:var(--color-surface)] px-2 py-1.5 text-xs"
        />
      )}
      {condition.operator === 'between' && (
        <input
          value={condition.value2 ?? ''}
          onChange={(e) => onChange({ ...condition, value2: e.target.value })}
          placeholder="to"
          className="w-24 rounded-md border border-[color:var(--color-border-strong)] bg-[color:var(--color-surface)] px-2 py-1.5 text-xs"
        />
      )}
      <button onClick={onRemove} className="text-[color:var(--color-text-faint)] hover:text-[color:var(--color-critical)]">
        <Trash2 size={14} />
      </button>
    </div>
  )
}
