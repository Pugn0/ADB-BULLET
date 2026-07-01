/**
 * Inspector.jsx — Painel de inspeção de elementos Android
 *
 * Exibe o screenshot do dispositivo com overlay dos elementos UIAutomator.
 * Ao clicar num elemento, oferece ao usuário criar um BLOCK_CLICK_TEXT
 * ou BLOCK_INPUT_TEXT pré-preenchido com os dados do elemento.
 *
 * Props:
 *   onAddBlock(blockType, properties) — callback para inserir bloco no canvas
 */

import { useState, useRef, useCallback, useEffect } from 'react'

const API = 'http://127.0.0.1:8000'

// ── Paleta de cores por tipo de widget ──────────────────────────────────────
const CLASS_COLORS = {
  'android.widget.Button':      '#4e6af0cc',
  'android.widget.EditText':    '#f59e0bcc',
  'android.widget.TextView':    '#22c55ecc',
  'android.widget.ImageButton': '#a855f7cc',
  'android.widget.ImageView':   '#06b6d4cc',
}
function classColor(className) {
  for (const [key, color] of Object.entries(CLASS_COLORS)) {
    if (className?.includes(key)) return color
  }
  return '#6b7280cc'
}

// ── Hit-testing ─────────────────────────────────────────────────────────────
/**
 * Converte coordenadas do mouse sobre a imagem renderizada
 * para coordenadas no espaço real do dispositivo.
 *
 * Matemática:
 *   ratio_x = device_width  / img_rendered_width
 *   ratio_y = device_height / img_rendered_height
 *   device_x = mouse_offset_x * ratio_x
 *   device_y = mouse_offset_y * ratio_y
 *
 * Depois verifica se (device_x, device_y) está dentro do bounding-box
 * de cada elemento (start_x ≤ x ≤ end_x  e  start_y ≤ y ≤ end_y).
 * Retorna o elemento com menor área (mais específico = mais ao fundo da árvore).
 */
function hitTest(mouseX, mouseY, imgRect, screenW, screenH, elements) {
  const ratioX = screenW / imgRect.width
  const ratioY = screenH / imgRect.height
  const devX = mouseX * ratioX
  const devY = mouseY * ratioY

  const hits = elements.filter(el =>
    el.start_x != null &&
    devX >= el.start_x && devX <= el.end_x &&
    devY >= el.start_y && devY <= el.end_y
  )

  if (hits.length === 0) return null

  // Menor área = elemento mais específico
  return hits.reduce((best, el) => {
    const area = (el.end_x - el.start_x) * (el.end_y - el.start_y)
    const bestArea = (best.end_x - best.start_x) * (best.end_y - best.start_y)
    return area < bestArea ? el : best
  })
}

// ── Overlay SVG de elementos ─────────────────────────────────────────────────
function ElementOverlay({ elements, screenW, screenH, imgSize, hovered, onHover, onClick }) {
  if (!imgSize.w || !imgSize.h) return null

  const scaleX = imgSize.w / screenW
  const scaleY = imgSize.h / screenH

  return (
    <svg
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'visible' }}
      width={imgSize.w}
      height={imgSize.h}
    >
      {elements.map((el, i) => {
        if (el.start_x == null) return null
        const x = el.start_x * scaleX
        const y = el.start_y * scaleY
        const w = (el.end_x - el.start_x) * scaleX
        const h = (el.end_y - el.start_y) * scaleY
        const isHovered = hovered?.index === i
        const color = classColor(el.class_name)

        return (
          <rect
            key={i}
            x={x} y={y} width={w} height={h}
            fill={isHovered ? color : 'transparent'}
            stroke={color.replace('cc', 'ff')}
            strokeWidth={isHovered ? 2 : 1}
            rx={2}
            style={{ pointerEvents: 'all', cursor: 'crosshair' }}
            onMouseEnter={() => onHover({ ...el, index: i })}
            onMouseLeave={() => onHover(null)}
            onClick={() => onClick({ ...el, index: i })}
          />
        )
      })}
    </svg>
  )
}

// ── Tooltip do elemento ──────────────────────────────────────────────────────
function ElementTooltip({ el, pos }) {
  if (!el) return null
  return (
    <div style={{
      position: 'fixed', left: pos.x + 14, top: pos.y + 10,
      background: '#1e2536', border: '1px solid #2e3650',
      borderRadius: 6, padding: '8px 12px', zIndex: 9999,
      fontSize: 11, color: '#e8ecf4', maxWidth: 280,
      boxShadow: '0 4px 20px rgba(0,0,0,.5)', pointerEvents: 'none',
    }}>
      {el.text && <div><b>text:</b> {el.text}</div>}
      {el.resource_id && <div><b>id:</b> <span style={{ color: '#4e6af0' }}>{el.resource_id}</span></div>}
      {el.class_name && <div><b>class:</b> <span style={{ color: '#f59e0b' }}>{el.class_name.split('.').pop()}</span></div>}
      {el.content_desc && <div><b>desc:</b> {el.content_desc}</div>}
      <div style={{ color: '#6b7898', marginTop: 4 }}>
        📍 {el.center_x},{el.center_y}  |  {el.width}×{el.height}px
      </div>
      {el.clickable && <div style={{ color: '#22c55e' }}>✓ clickable</div>}
    </div>
  )
}

// ── Modal de criação de bloco ────────────────────────────────────────────────
function BlockCreateModal({ el, onConfirm, onClose }) {
  const [blockType, setBlockType] = useState(
    el?.clickable ? 'BLOCK_CLICK_TEXT' : 'BLOCK_INPUT_TEXT'
  )

  const handleConfirm = () => {
    const props = blockType === 'BLOCK_CLICK_TEXT'
      ? {
          text:        el.text || el.content_desc || '',
          backend:     'uiautomator2',
          match:       el.text ? 'exact' : 'contains',
          resource_id: el.resource_id || '',
          retries:     2,
          retry_delay: 1,
        }
      : {
          // BLOCK_INPUT_TEXT — clica primeiro via coordenadas, depois digita
          // (usualmente combinado com BLOCK_CLICK_TEXT antes)
          text:   '',
          method: 'natural',
        }

    // Injeta também as coords de tap como fallback (BLOCK_SWIPE usa isso)
    props._center_x = el.center_x
    props._center_y = el.center_y

    onConfirm(blockType, props)
    onClose()
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000,
    }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{
        background: '#1e2536', border: '1px solid #2e3650',
        borderRadius: 8, padding: '20px 24px', width: 360,
        boxShadow: '0 20px 60px rgba(0,0,0,.6)',
      }}>
        <div style={{ fontWeight: 700, marginBottom: 14 }}>➕ Adicionar bloco do elemento</div>

        {/* Resumo do elemento */}
        <div style={{
          background: '#141824', borderRadius: 6, padding: '10px 12px',
          marginBottom: 16, fontSize: 12, color: '#6b7898',
        }}>
          {el.text && <div><b style={{ color: '#e8ecf4' }}>text:</b> {el.text}</div>}
          {el.resource_id && <div><b style={{ color: '#e8ecf4' }}>id:</b> {el.resource_id}</div>}
          <div><b style={{ color: '#e8ecf4' }}>coords:</b> ({el.center_x}, {el.center_y})</div>
        </div>

        {/* Seletor de tipo de bloco */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 10, fontWeight: 600, color: '#6b7898', marginBottom: 6, textTransform: 'uppercase' }}>
            Tipo de bloco
          </div>
          {['BLOCK_CLICK_TEXT', 'BLOCK_INPUT_TEXT', 'BLOCK_PARSE_ELEMENT'].map(type => (
            <label key={type} style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '6px 10px', borderRadius: 5, cursor: 'pointer',
              background: blockType === type ? '#4e6af022' : 'transparent',
              border: `1px solid ${blockType === type ? '#4e6af0' : 'transparent'}`,
              marginBottom: 4,
            }}>
              <input
                type="radio" name="blockType" value={type}
                checked={blockType === type}
                onChange={() => setBlockType(type)}
                style={{ accentColor: '#4e6af0' }}
              />
              <span style={{ fontSize: 12, color: '#e8ecf4' }}>{type}</span>
            </label>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{
            padding: '6px 14px', borderRadius: 5,
            background: 'transparent', border: '1px solid #2e3650',
            color: '#e8ecf4', cursor: 'pointer', fontSize: 12,
          }}>Cancelar</button>
          <button onClick={handleConfirm} style={{
            padding: '6px 14px', borderRadius: 5,
            background: '#4e6af0', border: 'none',
            color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600,
          }}>Adicionar bloco</button>
        </div>
      </div>
    </div>
  )
}

// ── Inspector principal ──────────────────────────────────────────────────────
export default function Inspector({ onAddBlock }) {
  const [devices, setDevices]       = useState([])
  const [deviceId, setDeviceId]     = useState('')
  const [loading, setLoading]       = useState(false)
  const [error, setError]           = useState(null)
  const [inspectData, setInspect]   = useState(null)
  const [hovered, setHovered]       = useState(null)
  const [mousePos, setMousePos]     = useState({ x: 0, y: 0 })
  const [selected, setSelected]     = useState(null)
  const [imgSize, setImgSize]       = useState({ w: 0, h: 0 })
  const [backend, setBackend]       = useState('uiautomator2')
  const [backends, setBackends]     = useState([])
  const [currentApp, setCurrentApp] = useState(null)   // { package, activity }
  const [appLoading, setAppLoading] = useState(false)
  const imgRef = useRef(null)

  // Carrega dispositivos e backends ao montar
  useEffect(() => {
    fetchDevices()
    fetchBackends()
  }, [])

  const fetchBackends = async () => {
    try {
      const r = await fetch(`${API}/api/backends`)
      if (r.ok) {
        const data = await r.json()
        setBackends(data.backends || [])
      }
    } catch { /* API offline — mostra lista estática */ }
  }

  const fetchCurrentApp = async () => {
    if (!deviceId) return
    setAppLoading(true)
    setCurrentApp(null)
    try {
      const r = await fetch(`${API}/api/device/current_app?device_id=${encodeURIComponent(deviceId)}`)
      if (!r.ok) throw new Error((await r.json()).detail)
      setCurrentApp(await r.json())
    } catch (e) {
      setError(e.message)
    } finally {
      setAppLoading(false)
    }
  }

  const fetchDevices = async () => {
    try {
      const r = await fetch(`${API}/api/devices`)
      const data = await r.json()
      setDevices(data.devices || [])
      if (data.devices?.length > 0) setDeviceId(data.devices[0].id)
    } catch {
      setError('API offline. Inicie python api.py primeiro.')
    }
  }

  const handleInspect = async () => {
    if (!deviceId) return
    setLoading(true)
    setError(null)
    try {
      const r = await fetch(`${API}/api/device/inspect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device_id: deviceId, backend, with_screenshot: true }),
      })
      if (!r.ok) throw new Error((await r.json()).detail)
      const data = await r.json()
      setInspect(data)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const handleMirror = async () => {
    if (!deviceId) return
    try {
      await fetch(`${API}/api/device/mirror`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device_id: deviceId }),
      })
    } catch (e) {
      setError(e.message)
    }
  }

  // Atualiza tamanho renderizado da imagem (para cálculo de proporção)
  const onImgLoad = useCallback(() => {
    if (imgRef.current) {
      setImgSize({ w: imgRef.current.clientWidth, h: imgRef.current.clientHeight })
    }
  }, [])

  // Click na imagem → hit-test → abre modal
  const onImgClick = useCallback((e) => {
    if (!inspectData) return
    const rect = imgRef.current.getBoundingClientRect()
    const offsetX = e.clientX - rect.left
    const offsetY = e.clientY - rect.top
    const el = hitTest(
      offsetX, offsetY,
      { width: rect.width, height: rect.height },
      inspectData.screen_width,
      inspectData.screen_height,
      inspectData.elements,
    )
    if (el) setSelected(el)
  }, [inspectData])

  const onMouseMove = useCallback((e) => {
    setMousePos({ x: e.clientX, y: e.clientY })
  }, [])

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100%',
      background: '#161b27', color: '#e8ecf4',
    }}>
      {/* ── Cabeçalho do Inspector ── */}
      <div style={{
        padding: '12px 16px', borderBottom: '1px solid #2e3650',
        display: 'flex', flexDirection: 'column', gap: 10,
      }}>
        <div style={{ fontWeight: 700, fontSize: 13 }}>📱 Android Inspector</div>

        {/* Seletor de device */}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <select
            value={deviceId}
            onChange={e => setDeviceId(e.target.value)}
            style={{
              flex: 1, background: '#141824', border: '1px solid #2e3650',
              borderRadius: 5, color: '#e8ecf4', fontSize: 12, padding: '4px 8px',
            }}
          >
            {devices.length === 0
              ? <option value="">Nenhum device</option>
              : devices.map(d => (
                  <option key={d.id} value={d.id}>
                    {d.id} {d.model ? `(${d.model})` : ''} — {d.state}
                  </option>
                ))
            }
          </select>
          <button
            onClick={fetchDevices}
            title="Recarregar lista"
            style={{
              padding: '4px 10px', borderRadius: 5, fontSize: 13,
              background: 'transparent', border: '1px solid #2e3650',
              color: '#e8ecf4', cursor: 'pointer',
            }}
          >↻</button>
        </div>

        {/* Seletor de backend — dinâmico via /api/backends */}
        <select
          value={backend}
          onChange={e => setBackend(e.target.value)}
          style={{
            background: '#141824', border: '1px solid #2e3650',
            borderRadius: 5, color: '#e8ecf4', fontSize: 11, padding: '4px 8px',
          }}
        >
          {(backends.length > 0
            ? backends
            : ['uiautomator2','classic','fragments','window','tesseract'].map(id => ({ id, label: id, available: true, note: '' }))
          ).map(b => (
            <option
              key={b.id}
              value={b.id}
              disabled={b.available === false}
              title={b.note}
            >
              {b.available === false ? '✗ ' : ''}{b.label ?? b.id}{b.recommended ? ' ★' : ''}
            </option>
          ))}
        </select>

        {/* Botões */}
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            onClick={handleMirror}
            disabled={!deviceId}
            style={{
              flex: 1, padding: '6px', borderRadius: 5, fontSize: 11, fontWeight: 600,
              background: 'transparent', border: '1px solid #2e3650',
              color: '#e8ecf4', cursor: 'pointer',
            }}
          >📺 Mirror</button>
          <button
            onClick={handleInspect}
            disabled={!deviceId || loading}
            style={{
              flex: 1, padding: '6px', borderRadius: 5, fontSize: 11, fontWeight: 600,
              background: '#4e6af0', border: 'none',
              color: '#fff', cursor: 'pointer',
            }}
          >{loading ? '⏳ Capturando…' : '🔍 Inspecionar'}</button>
        </div>

        {error && (
          <div style={{ fontSize: 11, color: '#ef4444', padding: '6px 8px',
            background: '#ef444415', borderRadius: 5, border: '1px solid #ef444430' }}>
            {error}
          </div>
        )}

        {/* App em foco */}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <button
            onClick={fetchCurrentApp}
            disabled={!deviceId || appLoading}
            title="Detectar app em foco"
            style={{
              padding: '4px 8px', borderRadius: 5, fontSize: 11,
              background: 'transparent', border: '1px solid #2e3650',
              color: '#e8ecf4', cursor: 'pointer', whiteSpace: 'nowrap',
            }}
          >{appLoading ? '⏳' : '📦 App'}</button>
          {currentApp && (
            <div style={{
              flex: 1, background: '#141824', borderRadius: 5,
              padding: '4px 8px', fontSize: 10, color: '#6b7898',
              display: 'flex', alignItems: 'center', gap: 6, overflow: 'hidden',
            }}>
              <span style={{ color: '#4e6af0', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {currentApp.package}
              </span>
              <button
                onClick={() => navigator.clipboard.writeText(currentApp.package)}
                title="Copiar package name"
                style={{
                  flexShrink: 0, padding: '1px 5px', borderRadius: 3, fontSize: 10,
                  background: 'transparent', border: '1px solid #2e3650',
                  color: '#6b7898', cursor: 'pointer',
                }}
              >📋</button>
              <button
                onClick={() => onAddBlock && onAddBlock('BLOCK_LAUNCH_APP', { package: currentApp.package })}
                title="Criar bloco Launch App"
                style={{
                  flexShrink: 0, padding: '1px 5px', borderRadius: 3, fontSize: 10,
                  background: '#4e6af022', border: '1px solid #4e6af055',
                  color: '#4e6af0', cursor: 'pointer',
                }}
              >+ bloco</button>
            </div>
          )}
        </div>

        {inspectData && (
          <div style={{ fontSize: 10, color: '#6b7898' }}>
            {inspectData.element_count} elementos · {inspectData.screen_width}×{inspectData.screen_height}px · {inspectData.backend}
          </div>
        )}
      </div>

      {/* ── Área da imagem ── */}
      <div style={{ flex: 1, overflow: 'auto', padding: 12, display: 'flex', justifyContent: 'center' }}>
        {!inspectData && (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#6b7898', fontSize: 12, width: '100%',
          }}>
            Conecte um dispositivo e clique em Inspecionar
          </div>
        )}

        {inspectData?.screenshot_b64 && (
          <div
            style={{ position: 'relative', display: 'inline-block', cursor: 'crosshair' }}
            onMouseMove={onMouseMove}
          >
            <img
              ref={imgRef}
              src={`data:image/png;base64,${inspectData.screenshot_b64}`}
              alt="screenshot"
              onLoad={onImgLoad}
              onClick={onImgClick}
              style={{
                maxWidth: '100%', maxHeight: 'calc(100vh - 280px)',
                display: 'block', borderRadius: 6,
                border: '1px solid #2e3650',
              }}
            />

            {/* Overlay SVG com bounding boxes */}
            <ElementOverlay
              elements={inspectData.elements}
              screenW={inspectData.screen_width}
              screenH={inspectData.screen_height}
              imgSize={imgSize}
              hovered={hovered}
              onHover={setHovered}
              onClick={setSelected}
            />
          </div>
        )}
      </div>

      {/* Tooltip flutuante */}
      <ElementTooltip el={hovered} pos={mousePos} />

      {/* Modal de criação de bloco */}
      {selected && (
        <BlockCreateModal
          el={selected}
          onConfirm={onAddBlock}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  )
}
