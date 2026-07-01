import { useCallback, useEffect, useRef, useState, useMemo } from 'react'
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  BackgroundVariant,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'

import { BLOCK_DEFS, BLOCK_DEF_MAP } from './blockDefs.js'
import { exportFlow } from './flowExport.js'
import FlowNode from './FlowNode.jsx'

const NODE_TYPES = { flowNode: FlowNode }
const API        = 'http://127.0.0.1:8000'
const SAVE_KEY   = 'adb_bullet_canvas'

let _nodeCounter = 0
const makeNodeId = () => `node_${Date.now()}_${++_nodeCounter}`

function createNode(blockType, position) {
  const def    = BLOCK_DEF_MAP[blockType]
  const fields = Object.fromEntries(def.fields.map(f => [f.key, f.default]))
  return { id: makeNodeId(), type: 'flowNode', position, data: { blockType, fields } }
}

function loadSaved() {
  try {
    const raw = localStorage.getItem(SAVE_KEY)
    return raw ? JSON.parse(raw) : { nodes: [], edges: [] }
  } catch { return { nodes: [], edges: [] } }
}

// ── Sidebar ─────────────────────────────────────────────────────────────────
function Sidebar() {
  const onDragStart = (e, blockType) => {
    e.dataTransfer.setData('application/adb-bullet-block', blockType)
    e.dataTransfer.effectAllowed = 'move'
  }
  return (
    <aside className="sidebar">
      <div className="sidebar-title">Blocos disponíveis</div>
      {BLOCK_DEFS.map(def => (
        <div
          key={def.type}
          className="sidebar-block"
          draggable
          onDragStart={e => onDragStart(e, def.type)}
          title={def.desc}
        >
          <span className="block-icon">{def.icon}</span>
          <div className="block-info">
            <span className="block-label">{def.label}</span>
            <span className="block-desc">{def.desc}</span>
          </div>
        </div>
      ))}
    </aside>
  )
}

// ── Modal de exportação JSON ─────────────────────────────────────────────────
function ExportModal({ json, onClose }) {
  const [copied, setCopied] = useState(false)

  const copy = () =>
    navigator.clipboard.writeText(json).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })

  const download = () => {
    const a = Object.assign(document.createElement('a'), {
      href: URL.createObjectURL(new Blob([json], { type: 'application/json' })),
      download: 'flow.json',
    })
    a.click()
  }

  return (
    <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <span className="modal-title">📤 Exportar Fluxo JSON</span>
          <button className="btn btn-ghost" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body"><pre>{json}</pre></div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={download}>⬇ Download flow.json</button>
          <button className="btn btn-primary" onClick={copy}>
            {copied ? '✓ Copiado!' : '📋 Copiar JSON'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Modal de execução de fluxo ───────────────────────────────────────────────
function RunModal({ flow, onClose }) {
  const [devices, setDevices]   = useState([])
  const [deviceId, setDeviceId] = useState('')
  const [running, setRunning]   = useState(false)
  const [result, setResult]     = useState(null)
  const [error, setError]       = useState(null)

  useEffect(() => {
    fetch(`${API}/api/devices`)
      .then(r => r.json())
      .then(d => {
        setDevices(d.devices || [])
        if (d.devices?.length > 0) setDeviceId(d.devices[0].id)
      })
      .catch(() => setError('API offline. Inicie python api.py primeiro.'))
  }, [])

  const handleRun = async () => {
    if (!deviceId) return
    setRunning(true); setResult(null); setError(null)
    try {
      const r    = await fetch(`${API}/api/flow/run`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ device_id: deviceId, flow, stop_on_error: true }),
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data.detail || JSON.stringify(data))
      setResult(data)
    } catch (e) {
      setError(e.message)
    } finally {
      setRunning(false)
    }
  }

  const btnGreen = { padding: '7px 16px', borderRadius: 6, fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer', background: running ? '#6b7280' : '#22c55e', color: '#fff' }

  return (
    <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ width: 480, maxWidth: '96vw' }}>
        <div className="modal-header">
          <span className="modal-title">▶ Executar Fluxo</span>
          <button className="btn btn-ghost" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 600, color: '#6b7898', marginBottom: 6, textTransform: 'uppercase' }}>Dispositivo</div>
            <select
              value={deviceId}
              onChange={e => setDeviceId(e.target.value)}
              style={{ width: '100%', background: '#141824', border: '1px solid #2e3650', borderRadius: 5, color: '#e8ecf4', fontSize: 12, padding: '6px 10px' }}
            >
              {devices.length === 0
                ? <option>Nenhum dispositivo detectado</option>
                : devices.map(d => <option key={d.id} value={d.id}>{d.id}{d.model ? ` — ${d.model}` : ''} ({d.state})</option>)
              }
            </select>
          </div>

          <div style={{ background: '#141824', borderRadius: 6, padding: '10px 14px', fontSize: 12, color: '#6b7898' }}>
            <span style={{ color: '#e8ecf4', fontWeight: 600 }}>{flow.length}</span> bloco{flow.length !== 1 ? 's' : ''} no fluxo
            {flow.length > 0 && <span style={{ marginLeft: 10 }}>→ {flow.map(b => b.type?.replace('BLOCK_', '')).join(' → ')}</span>}
          </div>

          {result && (
            <div style={{ background: result.success ? '#22c55e15' : '#ef444415', border: `1px solid ${result.success ? '#22c55e40' : '#ef444440'}`, borderRadius: 6, padding: '12px 14px', fontSize: 12 }}>
              <div style={{ fontWeight: 700, marginBottom: 8, color: result.success ? '#22c55e' : '#ef4444' }}>
                {result.success ? '✓ Fluxo concluído com sucesso' : '✗ Fluxo encerrado com erro'}
              </div>
              <div style={{ color: '#6b7898', display: 'flex', gap: 16 }}>
                <span>✓ Executados: <b style={{ color: '#e8ecf4' }}>{result.executed}</b></span>
                <span>✗ Falhas: <b style={{ color: result.failed > 0 ? '#ef4444' : '#e8ecf4' }}>{result.failed}</b></span>
              </div>
              {result.variables && Object.keys(result.variables).length > 0 && (
                <div style={{ marginTop: 10 }}>
                  <div style={{ fontSize: 10, fontWeight: 600, color: '#6b7898', marginBottom: 4, textTransform: 'uppercase' }}>Variáveis</div>
                  {Object.entries(result.variables).map(([k, v]) => (
                    <div key={k} style={{ fontSize: 11 }}>
                      <span style={{ color: '#4e6af0' }}>{k}</span>
                      <span style={{ color: '#6b7898' }}> = </span>
                      <span style={{ color: '#e8ecf4' }}>{String(v)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {error && (
            <div style={{ background: '#ef444415', border: '1px solid #ef444440', borderRadius: 6, padding: '10px 14px', fontSize: 12, color: '#ef4444' }}>{error}</div>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>Fechar</button>
          <button style={btnGreen} disabled={running || !deviceId || devices.length === 0} onClick={handleRun}>
            {running ? '⏳ Executando…' : '▶ Executar agora'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Canvas ───────────────────────────────────────────────────────────────────
function Canvas() {
  const saved = useMemo(() => loadSaved(), [])
  const [nodes, setNodes, onNodesChange] = useNodesState(saved.nodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(saved.edges)
  const [exportJson, setExportJson]      = useState(null)
  const [showRunModal, setShowRunModal]  = useState(false)
  const [toast, setToast]               = useState(null)
  const reactFlowWrapper = useRef(null)

  const showToast = useCallback(msg => {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }, [])

  const onConnect   = useCallback(params => setEdges(eds => addEdge({ ...params, animated: true }, eds)), [setEdges])
  const onDragOver  = useCallback(e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move' }, [])
  const onDrop      = useCallback(e => {
    e.preventDefault()
    const blockType = e.dataTransfer.getData('application/adb-bullet-block')
    if (!blockType) return
    const b = reactFlowWrapper.current.getBoundingClientRect()
    setNodes(nds => [...nds, createNode(blockType, { x: e.clientX - b.left - 120, y: e.clientY - b.top - 40 })])
  }, [setNodes])

  const handleSave = () => {
    if (nodes.length === 0) { showToast('Canvas vazio — nada para salvar.'); return }
    localStorage.setItem(SAVE_KEY, JSON.stringify({ nodes, edges }))
    showToast('✓ Canvas salvo!')
  }

  const handleClear = () => {
    if (nodes.length === 0) return
    if (window.confirm('Limpar todo o canvas?')) { setNodes([]); setEdges([]) }
  }

  const handleExport = () => {
    if (nodes.length === 0) { showToast('Canvas vazio — adicione blocos primeiro.'); return }
    setExportJson(JSON.stringify(exportFlow(nodes, edges), null, 2))
  }

  const handleRun = () => {
    if (nodes.length === 0) { showToast('Canvas vazio — adicione blocos primeiro.'); return }
    setShowRunModal(true)
  }

  const minimapNodeColor = useCallback(node => BLOCK_DEF_MAP[node.data?.blockType]?.color ?? '#4e6af0', [])

  return (
    <div className="app-layout">
      <header className="toolbar">
        <span className="toolbar-brand">⚡ ADB Bullet</span>
        <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>
          {nodes.length} bloco{nodes.length !== 1 ? 's' : ''}
          {edges.length > 0 ? ` · ${edges.length} conexã${edges.length !== 1 ? 'ões' : 'o'}` : ''}
        </span>
        <button className="btn btn-ghost" onClick={handleSave}>💾 Salvar</button>
        <button className="btn btn-ghost" onClick={handleClear}>🗑 Limpar</button>
        <button className="btn btn-ghost" onClick={handleExport}>📤 Exportar JSON</button>
        <button className="btn btn-primary" onClick={handleRun} style={{ background: '#22c55e', borderColor: '#22c55e' }}>
          ▶ Executar Fluxo
        </button>
      </header>

      <div className="main-body">
        <Sidebar />

        <div className="canvas-wrap" ref={reactFlowWrapper} style={{ flex: 1 }}>
          {nodes.length === 0 && (
            <div className="canvas-hint">
              <span className="canvas-hint-icon">🧩</span>
              <span className="canvas-hint-text">Arraste blocos do painel esquerdo para começar</span>
            </div>
          )}
          <ReactFlow
            nodes={nodes} edges={edges}
            onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
            onConnect={onConnect} onDrop={onDrop} onDragOver={onDragOver}
            nodeTypes={NODE_TYPES}
            fitView deleteKeyCode="Delete" snapToGrid snapGrid={[12, 12]}
            defaultEdgeOptions={{ animated: true, style: { stroke: 'var(--accent)', strokeWidth: 2 } }}
          >
            <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#2e3650" />
            <Controls showInteractive={false} />
            <MiniMap nodeColor={minimapNodeColor} maskColor="rgba(15,17,23,0.7)" zoomable pannable />
          </ReactFlow>
        </div>
      </div>

      {exportJson    && <ExportModal json={exportJson} onClose={() => setExportJson(null)} />}
      {showRunModal  && <RunModal flow={exportFlow(nodes, edges)} onClose={() => setShowRunModal(false)} />}
      {toast         && <div className="toast">{toast}</div>}
    </div>
  )
}

export default function App() {
  return <ReactFlowProvider><Canvas /></ReactFlowProvider>
}
