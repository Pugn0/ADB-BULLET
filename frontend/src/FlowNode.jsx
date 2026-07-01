import { memo, useCallback } from 'react'
import { Handle, Position, useReactFlow } from '@xyflow/react'
import { BLOCK_DEF_MAP } from './blockDefs.js'

/**
 * Nó customizado universal — renderiza o formulário de qualquer bloco
 * com base em blockDefs.js.
 *
 * data shape esperado:
 *   blockType : string          — chave em BLOCK_DEF_MAP
 *   fields    : Record<string, any> — valores atuais dos campos
 */
const FlowNode = memo(({ id, data, selected }) => {
  const { updateNodeData } = useReactFlow()
  const def = BLOCK_DEF_MAP[data.blockType]

  const handleChange = useCallback((key, value) => {
    updateNodeData(id, prev => ({
      ...prev,
      fields: { ...prev.fields, [key]: value },
    }))
  }, [id, updateNodeData])

  if (!def) {
    return (
      <div className="flow-node" style={{ padding: 12, color: 'var(--danger)' }}>
        Bloco desconhecido: {data.blockType}
      </div>
    )
  }

  return (
    <div className={`flow-node${selected ? ' selected' : ''}`}>

      {/* Connector de entrada — topo */}
      <Handle
        type="target"
        position={Position.Top}
        id="in"
        style={{ top: -6 }}
      />

      {/* Cabeçalho */}
      <div className="node-header">
        <span className="node-header-icon">{def.icon}</span>
        <span className="node-title">{def.label}</span>
        <span
          className="node-badge"
          style={{
            background: def.color + '22',
            color: def.color,
            border: `1px solid ${def.color}55`,
          }}
        >
          {def.type.replace('BLOCK_', '')}
        </span>
      </div>

      {/* Campos do formulário */}
      <div className="node-body">
        {def.fields.map(field => (
          <div className="field" key={field.key}>
            <label className="field-label">{field.label}</label>

            {field.type === 'select' ? (
              <select
                value={data.fields[field.key] ?? field.default}
                onChange={e => handleChange(field.key, e.target.value)}
              >
                {field.options.map(opt => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>

            ) : field.type === 'textarea' ? (
              <textarea
                rows={3}
                value={data.fields[field.key] ?? field.default}
                placeholder={field.placeholder ?? ''}
                onChange={e => handleChange(field.key, e.target.value)}
              />

            ) : (
              <input
                type={field.type === 'number' ? 'number' : 'text'}
                value={data.fields[field.key] ?? field.default}
                placeholder={field.placeholder ?? ''}
                step={field.type === 'number' ? 'any' : undefined}
                onChange={e => handleChange(field.key, e.target.value)}
              />
            )}
          </div>
        ))}
      </div>

      {/* Connector de saída — base */}
      <Handle
        type="source"
        position={Position.Bottom}
        id="out"
        style={{ bottom: -6 }}
      />

    </div>
  )
})

FlowNode.displayName = 'FlowNode'
export default FlowNode
