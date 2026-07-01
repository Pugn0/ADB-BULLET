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
import Inspector from './Inspector.jsx'

const NODE_TYPES = { flowNode: FlowNode }
const API        = 'http://127.0.0.1:8000'
const BOTS_KEY   = 'adb_bullet_bots'

let _nodeCounter = 0
const makeNodeId = () => `node_${Date.now()}_${++_nodeCounter}`

function createNode(blockType, position) {
  const def    = BLOCK_DEF_MAP[blockType]
  const fields = Object.fromEntries(def.fields.map(f => [f.key, f.default]))
  return { id: makeNodeId(), type: 'flowNode', position, data: { blockType, fields } }
}

function loadBots() {
  try { return JSON.parse(localStorage.getItem(BOTS_KEY) || '[]') }
  catch { return [] }
}
function persistBots(bots) {
  localStorage.setItem(BOTS_KEY, JSON.stringify(bots))
}

// ── Sidebar ──────────────────────────────────────────────────────────────────
function Sidebar() {
  const onDragStart = (e, blockType) => {
    e.dataTransfer.setData('application/adb-bullet-block', blockType)
    e.dataTransfer.effectAllowed = 'move'
  }
  return (
    <aside className="sidebar">
      <div className="sidebar-title">Blocos disponíveis</div>
      {BLOCK_DEFS.map(def => (
        <div key={def.type} className="sidebar-block" draggable
          onDragStart={e => onDragStart(e, def.type)} title={def.desc}>
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

// ── Modal Salvar Bot ─────────────────────────────────────────────────────────
function SaveModal({ initialName, onSave, onClose }) {
  const [name, setName] = useState(initialName || '')
  const inputRef = useRef(null)

  useEffect(() => { setTimeout(() => inputRef.current?.focus(), 50) }, [])

  const handleSave = () => {
    const trimmed = name.trim()
    if (!trimmed) return
    onSave(trimmed)
    onClose()
  }

  return (
    <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ width: 380 }}>
        <div className="modal-header">
          <span className="modal-title">💾 Salvar Bot</span>
          <button className="btn btn-ghost" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div style={{ fontSize: 11, color: '#6b7898', marginBottom: 8 }}>Nome do bot</div>
          <input
            ref={inputRef}
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') onClose() }}
            placeholder="Ex: Login Automático, Scraper de Preços..."
            style={{
              width: '100%', boxSizing: 'border-box',
              background: '#141824', border: '1px solid #2e3650',
              borderRadius: 6, color: '#e8ecf4', fontSize: 13,
              padding: '9px 12px', outline: 'none',
            }}
          />
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button
            className="btn btn-primary"
            disabled={!name.trim()}
            onClick={handleSave}
            style={{ opacity: name.trim() ? 1 : 0.4 }}
          >
            💾 Salvar
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Modal Exportar JSON ──────────────────────────────────────────────────────
function ExportModal({ json, onClose }) {
  const [copied, setCopied] = useState(false)
  const copy = () =>
    navigator.clipboard.writeText(json).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000) })
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
          <button className="btn btn-primary" onClick={copy}>{copied ? '✓ Copiado!' : '📋 Copiar JSON'}</button>
        </div>
      </div>
    </div>
  )
}

// ── Modal Executar Fluxo ─────────────────────────────────────────────────────
function RunModal({ flow, botName, onClose }) {
  const [devices, setDevices]   = useState([])
  const [deviceId, setDeviceId] = useState('')
  const [running, setRunning]   = useState(false)
  const [result, setResult]     = useState(null)
  const [error, setError]       = useState(null)

  useEffect(() => {
    fetch(`${API}/api/devices`)
      .then(r => r.json())
      .then(d => { setDevices(d.devices || []); if (d.devices?.length) setDeviceId(d.devices[0].id) })
      .catch(() => setError('API offline. Inicie python api.py primeiro.'))
  }, [])

  const handleRun = async () => {
    if (!deviceId) return
    setRunning(true); setResult(null); setError(null)
    try {
      const r    = await fetch(`${API}/api/flow/run`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device_id: deviceId, flow, stop_on_error: true }),
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data.detail || JSON.stringify(data))
      setResult(data)
    } catch (e) { setError(e.message) }
    finally { setRunning(false) }
  }

  return (
    <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ width: 480, maxWidth: '96vw' }}>
        <div className="modal-header">
          <span className="modal-title">▶ Executar — {botName || 'Fluxo'}</span>
          <button className="btn btn-ghost" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 600, color: '#6b7898', marginBottom: 6, textTransform: 'uppercase' }}>Dispositivo</div>
            <select value={deviceId} onChange={e => setDeviceId(e.target.value)}
              style={{ width: '100%', background: '#141824', border: '1px solid #2e3650', borderRadius: 5, color: '#e8ecf4', fontSize: 12, padding: '6px 10px' }}>
              {devices.length === 0
                ? <option>Nenhum dispositivo detectado</option>
                : devices.map(d => <option key={d.id} value={d.id}>{d.id}{d.model ? ` — ${d.model}` : ''} ({d.state})</option>)}
            </select>
          </div>

          <div style={{ background: '#141824', borderRadius: 6, padding: '10px 14px', fontSize: 12, color: '#6b7898' }}>
            <span style={{ color: '#e8ecf4', fontWeight: 600 }}>{flow.length}</span> bloco{flow.length !== 1 ? 's' : ''}
            {flow.length > 0 && <span style={{ marginLeft: 10 }}>→ {flow.map(b => (b.type || b.block_type || '').replace('BLOCK_', '')).join(' → ')}</span>}
          </div>

          {result && (
            <div style={{ background: result.success ? '#22c55e15' : '#ef444415', border: `1px solid ${result.success ? '#22c55e40' : '#ef444440'}`, borderRadius: 6, padding: '12px 14px', fontSize: 12 }}>
              <div style={{ fontWeight: 700, marginBottom: 8, color: result.success ? '#22c55e' : '#ef4444' }}>
                {result.success ? '✓ Concluído com sucesso' : '✗ Encerrado com erro'}
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

          {error && <div style={{ background: '#ef444415', border: '1px solid #ef444440', borderRadius: 6, padding: '10px 14px', fontSize: 12, color: '#ef4444' }}>{error}</div>}
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>Fechar</button>
          <button
            disabled={running || !deviceId || !devices.length}
            onClick={handleRun}
            style={{ padding: '7px 16px', borderRadius: 6, fontSize: 12, fontWeight: 600, border: 'none', cursor: running ? 'default' : 'pointer', background: running ? '#6b7280' : '#22c55e', color: '#fff' }}
          >
            {running ? '⏳ Executando…' : '▶ Executar agora'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Página de Bots ───────────────────────────────────────────────────────────
function BotsPage({ bots, onEdit, onRun, onDelete, onBack }) {
  const [runTarget, setRunTarget] = useState(null)
  const [search, setSearch]       = useState('')

  const filtered = bots.filter(b => b.name.toLowerCase().includes(search.toLowerCase()))

  const fmt = iso => {
    const d = new Date(iso)
    return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#0f1117', color: '#e8ecf4' }}>

      <header style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '0 20px', height: 52, borderBottom: '1px solid #1e2536', background: '#141824', flexShrink: 0 }}>
        <button onClick={onBack}
          style={{ padding: '5px 12px', borderRadius: 5, background: 'transparent', border: '1px solid #2e3650', color: '#e8ecf4', cursor: 'pointer', fontSize: 12 }}>
          ← Editor
        </button>
        <span style={{ fontWeight: 700, fontSize: 15 }}>🤖 Bots</span>
        <span style={{ color: '#6b7898', fontSize: 12 }}>{bots.length} bot{bots.length !== 1 ? 's' : ''} salvos</span>
      </header>

      <div style={{ padding: '14px 20px', borderBottom: '1px solid #1e2536', background: '#141824', flexShrink: 0 }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar bot..."
          style={{ width: '100%', maxWidth: 320, background: '#0f1117', border: '1px solid #2e3650', borderRadius: 6, color: '#e8ecf4', fontSize: 12, padding: '7px 12px', outline: 'none', boxSizing: 'border-box' }}
        />
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: 20 }}>
        {filtered.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 260, color: '#6b7898', gap: 12 }}>
            <span style={{ fontSize: 40 }}>🤖</span>
            <span style={{ fontSize: 14, fontWeight: 600 }}>
              {bots.length === 0 ? 'Nenhum bot salvo ainda' : 'Nenhum bot encontrado'}
            </span>
            <span style={{ fontSize: 12 }}>
              {bots.length === 0 ? 'Crie um fluxo no editor e salve como bot.' : 'Tente outro termo de busca.'}
            </span>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {filtered.map(bot => (
              <div key={bot.id}
                style={{ background: '#141824', border: '1px solid #1e2536', borderRadius: 8, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14 }}
                onMouseEnter={e => e.currentTarget.style.borderColor = '#2e3650'}
                onMouseLeave={e => e.currentTarget.style.borderColor = '#1e2536'}
              >
                <div style={{ width: 42, height: 42, borderRadius: 8, background: '#4e6af018', border: '1px solid #4e6af030', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>🤖</div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 3 }}>{bot.name}</div>
                  <div style={{ fontSize: 11, color: '#6b7898', display: 'flex', gap: 14 }}>
                    <span><span style={{ color: '#4e6af0', fontWeight: 600 }}>{bot.nodes?.length ?? 0}</span> bloco{(bot.nodes?.length ?? 0) !== 1 ? 's' : ''}</span>
                    <span><span style={{ color: '#4e6af0', fontWeight: 600 }}>{bot.edges?.length ?? 0}</span> conexõe{(bot.edges?.length ?? 0) !== 1 ? 's' : ''}</span>
                    <span>Atualizado {fmt(bot.updatedAt)}</span>
                  </div>
                  {bot.nodes?.length > 0 && (
                    <div style={{ marginTop: 5, fontSize: 10, color: '#4b5563', fontFamily: 'monospace' }}>
                      {bot.nodes.slice(0, 6).map(n => (n.data?.blockType || '').replace('BLOCK_', '')).join(' → ')}
                      {bot.nodes.length > 6 ? ` +${bot.nodes.length - 6}` : ''}
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                  <button onClick={() => setRunTarget(bot)}
                    style={{ padding: '6px 14px', borderRadius: 5, background: '#22c55e', border: 'none', color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                    ▶ Executar
                  </button>
                  <button onClick={() => onEdit(bot)}
                    style={{ padding: '6px 12px', borderRadius: 5, background: 'transparent', border: '1px solid #2e3650', color: '#e8ecf4', cursor: 'pointer', fontSize: 12 }}>
                    ✏ Editar
                  </button>
                  <button onClick={() => { if (window.confirm(`Deletar o bot "${bot.name}"?`)) onDelete(bot.id) }}
                    style={{ padding: '6px 10px', borderRadius: 5, background: 'transparent', border: '1px solid #2e3650', color: '#ef4444', cursor: 'pointer', fontSize: 12 }}>
                    🗑
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {runTarget && (
        <RunModal
          flow={exportFlow(runTarget.nodes, runTarget.edges)}
          botName={runTarget.name}
          onClose={() => setRunTarget(null)}
        />
      )}
    </div>
  )
}

// ── Canvas / Editor ──────────────────────────────────────────────────────────
function Canvas() {
  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])
  const [exportJson, setExportJson]       = useState(null)
  const [showRunModal, setShowRunModal]   = useState(false)
  const [showSaveModal, setShowSaveModal] = useState(false)
  const [showInspector, setShowInspector] = useState(false)
  const [showBots, setShowBots]           = useState(false)
  const [toast, setToast]                 = useState(null)
  const [bots, setBots]                   = useState(() => loadBots())
  const [currentBotName, setCurrentBotName] = useState('')
  const reactFlowWrapper = useRef(null)

  const showToast = useCallback(msg => {
    setToast(msg); setTimeout(() => setToast(null), 3000)
  }, [])

  const onConnect  = useCallback(params => setEdges(eds => addEdge({ ...params, animated: true }, eds)), [setEdges])
  const onDragOver = useCallback(e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move' }, [])
  const onDrop     = useCallback(e => {
    e.preventDefault()
    const blockType = e.dataTransfer.getData('application/adb-bullet-block')
    if (!blockType) return
    const b = reactFlowWrapper.current.getBoundingClientRect()
    setNodes(nds => [...nds, createNode(blockType, { x: e.clientX - b.left - 120, y: e.clientY - b.top - 40 })])
  }, [setNodes])

  const handleAddBlockFromInspector = useCallback((blockType, properties) => {
    const def = BLOCK_DEF_MAP[blockType]
    if (!def) return
    const fields = Object.fromEntries(def.fields.map(f => [f.key, f.default]))
    for (const [k, v] of Object.entries(properties)) { if (k in fields) fields[k] = v }
    setNodes(nds => [...nds, {
      id: makeNodeId(), type: 'flowNode',
      position: { x: 350 + Math.random() * 120, y: 80 + nds.length * 200 },
      data: { blockType, fields },
    }])
    showToast(`Bloco ${blockType.replace('BLOCK_', '')} adicionado!`)
  }, [setNodes, showToast])

  const handleSave = () => {
    if (nodes.length === 0) { showToast('Canvas vazio — adicione blocos primeiro.'); return }
    setShowSaveModal(true)
  }

  const handleConfirmSave = useCallback((name) => {
    const now    = new Date().toISOString()
    const exists = bots.find(b => b.name === name)
    const updated = exists
      ? bots.map(b => b.name === name ? { ...b, nodes, edges, updatedAt: now } : b)
      : [...bots, { id: `bot_${Date.now()}`, name, nodes, edges, createdAt: now, updatedAt: now }]
    setBots(updated)
    persistBots(updated)
    setCurrentBotName(name)
    showToast(`✓ Bot "${name}" salvo!`)
  }, [bots, nodes, edges, showToast])

  const handleEditBot = useCallback((bot) => {
    setNodes(bot.nodes || [])
    setEdges(bot.edges || [])
    setCurrentBotName(bot.name)
    setShowBots(false)
    showToast(`Bot "${bot.name}" carregado no editor`)
  }, [setNodes, setEdges, showToast])

  const handleDeleteBot = useCallback((id) => {
    const updated = bots.filter(b => b.id !== id)
    setBots(updated); persistBots(updated)
  }, [bots])

  const handleExport = () => {
    if (nodes.length === 0) { showToast('Canvas vazio — adicione blocos primeiro.'); return }
    setExportJson(JSON.stringify(exportFlow(nodes, edges), null, 2))
  }

  const handleRun = () => {
    if (nodes.length === 0) { showToast('Canvas vazio — adicione blocos primeiro.'); return }
    setShowRunModal(true)
  }

  const handleClear = () => {
    if (nodes.length === 0) return
    if (window.confirm('Limpar todo o canvas?')) { setNodes([]); setEdges([]); setCurrentBotName('') }
  }

  const minimapNodeColor = useCallback(node => BLOCK_DEF_MAP[node.data?.blockType]?.color ?? '#4e6af0', [])

  if (showBots) {
    return (
      <BotsPage
        bots={bots}
        onEdit={handleEditBot}
        onDelete={handleDeleteBot}
        onBack={() => setShowBots(false)}
      />
    )
  }

  return (
    <div className="app-layout">
      <header className="toolbar">
        <span className="toolbar-brand">⚡ ADB Bullet</span>
        <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>
          {currentBotName
            ? <span style={{ color: '#4e6af0' }}>{currentBotName}</span>
            : `${nodes.length} bloco${nodes.length !== 1 ? 's' : ''}`}
        </span>

        <button className="btn btn-ghost" onClick={() => setShowBots(true)}>🤖 Bots</button>
        <button className="btn btn-ghost" onClick={handleSave}>💾 Salvar</button>
        <button className="btn btn-ghost" onClick={handleClear}>🗑 Limpar</button>
        <button
          className={`btn ${showInspector ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => setShowInspector(v => !v)}
        >📱 Inspector</button>
        <button className="btn btn-ghost" onClick={handleExport}>📤 Exportar JSON</button>
        <button className="btn btn-primary" onClick={handleRun}
          style={{ background: '#22c55e', borderColor: '#22c55e' }}>
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
            fitView deleteKeyCode={null} snapToGrid snapGrid={[12, 12]}
            defaultEdgeOptions={{ animated: true, style: { stroke: 'var(--accent)', strokeWidth: 2 } }}
          >
            <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#2e3650" />
            <Controls showInteractive={false} />
            <MiniMap nodeColor={minimapNodeColor} maskColor="rgba(15,17,23,0.7)" zoomable pannable />
          </ReactFlow>
        </div>

        {showInspector && (
          <div style={{ width: 320, flexShrink: 0, borderLeft: '1px solid var(--border)', background: 'var(--bg-sidebar)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <Inspector onAddBlock={handleAddBlockFromInspector} />
          </div>
        )}
      </div>

      {showSaveModal && <SaveModal initialName={currentBotName} onSave={handleConfirmSave} onClose={() => setShowSaveModal(false)} />}
      {exportJson    && <ExportModal json={exportJson} onClose={() => setExportJson(null)} />}
      {showRunModal  && <RunModal flow={exportFlow(nodes, edges)} botName={currentBotName} onClose={() => setShowRunModal(false)} />}
      {toast         && <div className="toast">{toast}</div>}
    </div>
  )
}

export default function App() {
  return <ReactFlowProvider><Canvas /></ReactFlowProvider>
}
