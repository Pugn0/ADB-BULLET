/**
 * Definição canônica de cada tipo de bloco.
 *
 * fields[] descreve os campos que aparecem no nó e que serão exportados
 * como `properties` no JSON final para a NoCodeEngine.
 *
 * field shape:
 *   key      : string   — chave no dict `properties`
 *   label    : string   — rótulo visível
 *   type     : "text" | "select" | "number" | "textarea"
 *   default  : any      — valor inicial
 *   options? : string[] — apenas para type="select"
 *   placeholder? : string
 */

export const BLOCK_DEFS = [
  {
    type: 'BLOCK_LAUNCH_APP',
    label: 'Launch App',
    icon: '🚀',
    color: '#4e6af0',
    desc: 'Abre um app pelo package',
    fields: [
      { key: 'package',     label: 'Package Name', type: 'text',   default: '',  placeholder: 'com.instagram.android' },
      { key: 'sleep_after', label: 'Sleep após (s)', type: 'number', default: 3 },
      { key: 'timeout',     label: 'Timeout (s)',    type: 'number', default: 5  },
    ],
  },
  {
    type: 'BLOCK_OPEN_URL',
    label: 'Open URL',
    icon: '🌐',
    color: '#0ea5e9',
    desc: 'Abre uma URL no navegador',
    fields: [
      { key: 'url',          label: 'URL',            type: 'text',   default: '', placeholder: 'https://...' },
      { key: 'sleep_after',  label: 'Sleep após (s)', type: 'number', default: 2 },
      { key: 'wait_for_text',label: 'Aguardar texto', type: 'text',   default: '', placeholder: '(opcional)' },
      { key: 'wait_timeout', label: 'Timeout (s)',    type: 'number', default: 20 },
    ],
  },
  {
    type: 'BLOCK_CLOSE_APP',
    label: 'Close App',
    icon: '🛑',
    color: '#ef4444',
    desc: 'Fecha um app (force-stop)',
    fields: [
      { key: 'package',    label: 'Package Name', type: 'text',   default: '', placeholder: 'com.instagram.android' },
      { key: 'clear_data', label: 'Limpar dados', type: 'select', default: 'false', options: ['false','true'] },
    ],
  },
  {
    type: 'BLOCK_CLICK_TEXT',
    label: 'Click Text',
    icon: '👆',
    color: '#22c55e',
    desc: 'Localiza texto e clica',
    fields: [
      { key: 'text',        label: 'Texto alvo',  type: 'text',   default: '',         placeholder: 'Log in' },
      { key: 'match',       label: 'Match',       type: 'select', default: 'contains', options: ['contains','exact','regex'] },
      { key: 'index',       label: 'Ocorrência',  type: 'number', default: 0 },
      { key: 'retries',     label: 'Retries',     type: 'number', default: 1 },
      { key: 'retry_delay', label: 'Delay retry (s)', type: 'number', default: 1 },
      { key: 'scroll',      label: 'Scroll se não achar', type: 'select', default: 'false', options: ['false','true'] },
    ],
  },
  {
    type: 'BLOCK_INPUT_TEXT',
    label: 'Input Text',
    icon: '⌨️',
    color: '#f59e0b',
    desc: 'Toca no campo e digita texto',
    fields: [
      { key: 'text',        label: 'Texto',        type: 'text',   default: '',      placeholder: '<variavel> ou texto fixo' },
      { key: 'clear_first', label: 'Limpar antes', type: 'select', default: 'false', options: ['false','true'] },
      { key: 'tap_x',       label: 'Tap X',        type: 'number', default: 0 },
      { key: 'tap_y',       label: 'Tap Y',        type: 'number', default: 0 },
    ],
  },
  {
    type: 'BLOCK_FILL_FIELD',
    label: 'Fill Field',
    icon: '📋',
    color: '#facc15',
    desc: 'Clica no N-ésimo campo de texto e digita',
    fields: [
      { key: 'index', label: 'Índice do campo', type: 'number', default: 0 },
      { key: 'text',  label: 'Texto',           type: 'text',   default: '', placeholder: '<variavel> ou texto fixo' },
      { key: 'clear', label: 'Limpar antes',    type: 'select', default: 'true', options: ['true','false'] },
    ],
  },
  {
    type: 'BLOCK_SWIPE',
    label: 'Swipe',
    icon: '👋',
    color: '#a855f7',
    desc: 'Desliza na tela',
    fields: [
      { key: 'direction',    label: 'Direção',         type: 'select', default: 'up', options: ['up','down','left','right','custom'] },
      { key: 'distance_pct', label: 'Distância (%)',   type: 'number', default: 0.4 },
      { key: 'duration',     label: 'Duração (ms)',    type: 'number', default: 300 },
      { key: 'x1',           label: 'X1 (se custom)',  type: 'number', default: 0 },
      { key: 'y1',           label: 'Y1 (se custom)',  type: 'number', default: 0 },
      { key: 'x2',           label: 'X2 (se custom)',  type: 'number', default: 0 },
      { key: 'y2',           label: 'Y2 (se custom)',  type: 'number', default: 0 },
    ],
  },
  {
    type: 'BLOCK_PARSE_ELEMENT',
    label: 'Parse Element',
    icon: '🔍',
    color: '#06b6d4',
    desc: 'Captura texto/atributo → variável',
    fields: [
      { key: 'save_as',       label: 'Salvar como',   type: 'text',   default: '',         placeholder: 'nome_variavel' },
      { key: 'text',          label: 'Filtro texto',  type: 'text',   default: '',         placeholder: 'deixe vazio se usar outro filtro' },
      { key: 'resource_id',   label: 'Resource ID',   type: 'text',   default: '',         placeholder: 'com.app:id/element' },
      { key: 'class_name',    label: 'Class Name',    type: 'text',   default: '',         placeholder: 'android.widget.TextView' },
      { key: 'content_desc',  label: 'Content Desc',  type: 'text',   default: '',         placeholder: '(opcional)' },
      { key: 'match',         label: 'Match',         type: 'select', default: 'contains', options: ['contains','exact','regex'] },
      { key: 'source_field',  label: 'Campo fonte',   type: 'select', default: 'text',     options: ['text','content_desc','resource_id','class_name','bounds'] },
      { key: 'index',         label: 'Ocorrência',    type: 'number', default: 0 },
    ],
  },
  {
    type: 'BLOCK_WAIT_TEXT',
    label: 'Wait Text',
    icon: '👁️',
    color: '#14b8a6',
    desc: 'Aguarda um texto aparecer na tela',
    fields: [
      { key: 'text',    label: 'Texto alvo', type: 'text',   default: '',         placeholder: 'Login efetuado' },
      { key: 'timeout', label: 'Timeout (s)', type: 'number', default: 20 },
      { key: 'match',   label: 'Match',       type: 'select', default: 'contains', options: ['contains','exact','regex'] },
    ],
  },
  {
    type: 'BLOCK_IF_TEXT',
    label: 'If Text Present',
    icon: '🔀',
    color: '#8b5cf6',
    desc: 'Verifica se texto está na tela → variável bool',
    fields: [
      { key: 'text',    label: 'Texto alvo', type: 'text',   default: '',         placeholder: 'Preenchimento incorreto' },
      { key: 'save_as', label: 'Salvar como', type: 'text',   default: '',         placeholder: 'resultado_dead' },
      { key: 'match',   label: 'Match',       type: 'select', default: 'contains', options: ['contains','exact','regex'] },
    ],
  },
  {
    type: 'BLOCK_WAIT',
    label: 'Wait',
    icon: '⏳',
    color: '#6b7280',
    desc: 'Aguarda N segundos',
    fields: [
      { key: 'seconds', label: 'Segundos', type: 'number', default: 2, placeholder: '2' },
    ],
  },
  {
    type: 'BLOCK_BACK',
    label: 'Voltar',
    icon: '⬅️',
    color: '#64748b',
    desc: 'Pressiona o botão Voltar do Android',
    fields: [],
  },
  {
    type: 'BLOCK_KEYCODE',
    label: 'Keycode',
    icon: '🎮',
    color: '#ec4899',
    desc: 'Pressiona tecla Android',
    fields: [
      { key: 'key',  label: 'Keycode',      type: 'text',   default: 'BACK',  placeholder: 'BACK, HOME, ENTER, TAB…' },
      { key: 'long', label: 'Long press',   type: 'select', default: 'false', options: ['false','true'] },
    ],
  },
  {
    type: 'BLOCK_SET_VARIABLE',
    label: 'Set Variable',
    icon: '📝',
    color: '#f97316',
    desc: 'Define uma variável',
    fields: [
      { key: 'name',  label: 'Nome',  type: 'text', default: '', placeholder: 'minha_var' },
      { key: 'value', label: 'Valor', type: 'text', default: '', placeholder: 'valor ou <outra_var>' },
    ],
  },
]

// Lookup rápido por type
export const BLOCK_DEF_MAP = Object.fromEntries(BLOCK_DEFS.map(d => [d.type, d]))
