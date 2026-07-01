import { memo, useCallback, useState, useEffect } from 'react'
import { Handle, Position, useReactFlow } from '@xyflow/react'
import { BLOCK_DEF_MAP } from './blockDefs.js'

// Input com estado local para evitar "snapback" do React Flow
function FieldInput({ fieldKey, fieldDef, value, onCommit }) {
  const [local, setLocal] = useState(value ?? fieldDef.default ?? '')

  // Sincroniza apenas se o valor externo mudar por outra causa (ex: carregar bot)
  useEffect(() => {
    setLocal(value ?? fieldDef.default ?? '')
  }, [value])  // eslint-disable-line

  const stopKeys = e => {
    e.stopPropagation()
    e.nativeEvent?.stopImmediatePropagation()
  }

  if (fieldDef.type === 'select') {
    return (
      <select value={local}
        onChange={e => { setLocal(e.target.value); onCommit(fieldKey, e.target.value) }}
        onKeyDown={stopKeys}
      >
        {fieldDef.options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
      </select>
    )
  }

  if (fieldDef.type === 'textarea') {
    return (
      <textarea rows={3} value={local}
        placeholder={fieldDef.placeholder ?? ''}
        onChange={e => { setLocal(e.target.value); onCommit(fieldKey, e.target.value) }}
        onKeyDown={stopKeys}
      />
    )
  }

  return (
    <input
      type={fieldDef.type === 'number' ? 'number' : 'text'}
      value={local}
      placeholder={fieldDef.placeholder ?? ''}
      step={fieldDef.type === 'number' ? 'any' : undefined}
      onChange={e => { setLocal(e.target.value); onCommit(fieldKey, e.target.value) }}
      onKeyDown={stopKeys}
    />
  )
}

const FlowNode = memo(({ id, data, selected }) => {
  const { updateNodeData, deleteElements } = useReactFlow()
  const def = BLOCK_DEF_MAP[data.blockType]

  const handleCommit = useCallback((key, value) => {
    updateNodeData(id, { fields: { ...data.fields, [key]: value } })
  }, [id, updateNodeData, data.fields])

  const handleDelete = useCallback((e) => {
    e.stopPropagation()
    deleteElements({ nodes: [{ id }] })
  }, [id, deleteElements])

  if (!def) {
    return (
      <div className="flow-node" style={{ padding: 12, color: 'var(--danger)' }}>
        Bloco desconhecido: {data.blockType}
      </div>
    )
  }

  return (
    <div className={`flow-node${selected ? ' selected' : ''}`}>

      <Handle type="target" position={Position.Top} id="in" style={{ top: -6 }} />

      <div className="node-header">
        <span className="node-header-icon">{def.icon}</span>
        <span className="node-title">{def.label}</span>
        <span className="node-badge" style={{ background: def.color + '22', color: def.color, border: `1px solid ${def.color}55` }}>
          {def.type.replace('BLOCK_', '')}
        </span>
        <button
          onClick={handleDelete}
          title="Deletar bloco"
          style={{ marginLeft: 'auto', background: 'transparent', border: 'none', color: '#4b5563', cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: '0 2px', borderRadius: 3 }}
          onMouseEnter={e => e.currentTarget.style.color = '#ef4444'}
          onMouseLeave={e => e.currentTarget.style.color = '#4b5563'}
        >✕</button>
      </div>

      <div className="node-body">
        {def.fields.map(field => (
          <div className="field" key={field.key}>
            <label className="field-label">{field.label}</label>
            <FieldInput
              fieldKey={field.key}
              fieldDef={field}
              value={data.fields[field.key]}
              onCommit={handleCommit}
            />
          </div>
        ))}
      </div>

      <Handle type="source" position={Position.Bottom} id="out" style={{ bottom: -6 }} />

    </div>
  )
})

FlowNode.displayName = 'FlowNode'
export default FlowNode
