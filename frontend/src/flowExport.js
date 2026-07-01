/**
 * Percorre o grafo React Flow e gera a lista JSON que a NoCodeEngine espera.
 *
 * Algoritmo:
 *   1. Constrói mapa de adjacência (source → target) a partir das edges.
 *   2. Encontra o(s) nó(s) raiz: sem nenhuma edge chegando neles.
 *   3. Percorre em DFS/BFS linear a cadeia de nós conectados.
 *   4. Nós não conectados a nenhum fio ficam no final (isolados).
 *   5. Para cada nó, extrai `properties` com base nos valores dos campos,
 *      aplicando coerção de tipos (number, boolean) onde necessário.
 */

const NUMBER_FIELDS = new Set([
  'sleep_after','timeout','index','retries','retry_delay',
  'distance_pct','duration','x1','y1','x2','y2','seconds',
])

const BOOL_FIELDS = new Set(['clear_first','long'])

function coerce(key, value) {
  if (NUMBER_FIELDS.has(key)) {
    const n = parseFloat(value)
    return isNaN(n) ? 0 : n
  }
  if (BOOL_FIELDS.has(key)) {
    return value === 'true' || value === true
  }
  return value
}

/**
 * Ordena nós seguindo a cadeia de edges.
 * Retorna array de node ids em ordem de execução.
 */
function topologicalChain(nodes, edges) {
  // Quem tem incoming edge
  const hasIncoming = new Set(edges.map(e => e.target))
  // Quem tem outgoing edge
  const outMap = {}
  for (const e of edges) {
    outMap[e.source] = e.target
  }

  const allIds = new Set(nodes.map(n => n.id))

  // Raízes: nós sem incoming que têm pelo menos uma outgoing
  // Se não houver raiz com outgoing, considera todo nó sem incoming como raiz
  const roots = nodes
    .filter(n => !hasIncoming.has(n.id))
    .sort((a, b) => (a.position?.y ?? 0) - (b.position?.y ?? 0)) // ordena por posição Y como fallback

  const ordered = []
  const visited = new Set()

  // Percorre cada cadeia a partir de cada raiz
  for (const root of roots) {
    let cur = root.id
    while (cur && !visited.has(cur) && allIds.has(cur)) {
      visited.add(cur)
      ordered.push(cur)
      cur = outMap[cur]
    }
  }

  // Nós isolados (sem nenhuma edge): adiciona ao final por posição Y
  const isolated = nodes
    .filter(n => !visited.has(n.id))
    .sort((a, b) => (a.position?.y ?? 0) - (b.position?.y ?? 0))

  for (const n of isolated) {
    ordered.push(n.id)
  }

  return ordered
}

/**
 * Converte nodes + edges em lista JSON para a NoCodeEngine.
 *
 * @param {object[]} nodes  — array de nós do React Flow
 * @param {object[]} edges  — array de edges do React Flow
 * @returns {object[]}      — lista de blocos no formato da engine
 */
export function exportFlow(nodes, edges) {
  if (nodes.length === 0) return []

  const nodeMap = Object.fromEntries(nodes.map(n => [n.id, n]))
  const orderedIds = topologicalChain(nodes, edges)

  return orderedIds.map(id => {
    const node = nodeMap[id]
    const { blockType, fields } = node.data

    // Monta properties, omitindo campos vazios opcionais que a engine ignora
    const properties = {}
    for (const [key, rawValue] of Object.entries(fields)) {
      const value = coerce(key, rawValue)
      // Não omite — a engine já tem defaults para campos opcionais
      properties[key] = value
    }

    return {
      id: id,
      type: blockType,
      properties,
    }
  })
}
