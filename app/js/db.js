/**
 * db.js — Camada de dados IndexedDB
 * DaniDoces PWA — Offline-first
 */

const DB_NAME = 'danidoces';
const DB_VERSION = 1;

let db = null;

// ─── Inicializa o banco ───────────────────────────────────────────────────────
export function initDB() {
  return new Promise((resolve, reject) => {
    if (db) return resolve(db);

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      if (!db.objectStoreNames.contains('clientes')) {
        const store = db.createObjectStore('clientes', { keyPath: 'id' });
        store.createIndex('nome', 'nome', { unique: false });
        store.createIndex('synced', 'synced', { unique: false });
      }

      if (!db.objectStoreNames.contains('vendas')) {
        const store = db.createObjectStore('vendas', { keyPath: 'id' });
        store.createIndex('cliente_id', 'cliente_id', { unique: false });
        store.createIndex('mes_referencia', 'mes_referencia', { unique: false });
        store.createIndex('synced', 'synced', { unique: false });
        store.createIndex('pago', 'pago', { unique: false });
      }

      if (!db.objectStoreNames.contains('config')) {
        db.createObjectStore('config', { keyPath: 'chave' });
      }

      if (!db.objectStoreNames.contains('meses_fechados')) {
        const store = db.createObjectStore('meses_fechados', { keyPath: 'id' });
        store.createIndex('cliente_id', 'cliente_id', { unique: false });
        store.createIndex('mes', 'mes', { unique: false });
      }
    };

    request.onsuccess = (event) => {
      db = event.target.result;
      resolve(db);
    };

    request.onerror = (event) => reject(event.target.error);
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function tx(storeName, mode = 'readonly') {
  if (!db) throw new Error('DB não inicializado');
  return db.transaction(storeName, mode).objectStore(storeName);
}

function promisify(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export function safeKey(key, nome = 'key') {
  if (key === undefined || key === null || key === '') {
    throw new Error(`${nome} inválido: ${key}`);
  }
  return String(key);
}

// ─── CLIENTES ─────────────────────────────────────────────────────────────────

export async function salvarCliente(cliente) {
  await initDB();

  if (!cliente.id) cliente.id = gerarId();
  if (!cliente.data_criacao) cliente.data_criacao = new Date().toISOString();

  cliente.synced = false;

  return promisify(tx('clientes', 'readwrite').put(cliente));
}

export async function listarClientes() {
  await initDB();
  return promisify(tx('clientes').getAll());
}

export async function buscarCliente(id) {
  await initDB();
  return promisify(tx('clientes').get(id));
}

export async function deletarCliente(id) {
  await initDB();
  return promisify(tx('clientes', 'readwrite').delete(id));
}

export async function clientesNaoSincronizados() {
  await initDB();
  const index = tx('clientes').index('synced');
  return promisify(index.getAll(IDBKeyRange.only(false)));
}

export async function marcarClienteSincronizado(id) {
  await initDB();
  const store = tx('clientes', 'readwrite');
  const cliente = await promisify(store.get(id));

  if (cliente) {
    cliente.synced = true;
    return promisify(store.put(cliente));
  }
}

// ─── VENDAS ───────────────────────────────────────────────────────────────────

export async function salvarVenda(venda) {
  await initDB();

  if (!venda.cliente_id) {
    throw new Error('Venda sem cliente_id');
  }

  venda.cliente_id = String(venda.cliente_id);

  if (!venda.id) venda.id = gerarId();
  if (!venda.data) venda.data = new Date().toISOString().split('T')[0];

  if (!venda.mes_referencia) {
    const d = new Date(venda.data);
    venda.mes_referencia = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }

  if (venda.pago === undefined) venda.pago = false;

  venda.synced = false;

  return promisify(tx('vendas', 'readwrite').put(venda));
}

export async function listarVendas() {
  await initDB();
  return promisify(tx('vendas').getAll());
}

export async function listarVendasPorCliente(clienteId) {
  await initDB();

  const id = safeKey(clienteId, 'clienteId');

  const index = tx('vendas').index('cliente_id');
  return promisify(index.getAll(IDBKeyRange.only(id)));
}

export async function listarVendasPorClienteEMes(clienteId, mes) {
  const vendas = await listarVendasPorCliente(clienteId);
  return vendas.filter(v => v.mes_referencia === mes);
}

export async function deletarVenda(id) {
  await initDB();
  return promisify(tx('vendas', 'readwrite').delete(id));
}

export async function marcarVendaPaga(id, pago = true) {
  await initDB();
  const store = tx('vendas', 'readwrite');
  const venda = await promisify(store.get(id));

  if (venda) {
    venda.pago = pago;
    venda.synced = false;
    return promisify(store.put(venda));
  }
}

export async function vendasNaoSincronizadas() {
  await initDB();
  const index = tx('vendas').index('synced');
  return promisify(index.getAll(IDBKeyRange.only(false)));
}

export async function marcarVendaSincronizada(id) {
  await initDB();
  const store = tx('vendas', 'readwrite');
  const venda = await promisify(store.get(id));

  if (venda) {
    venda.synced = true;
    return promisify(store.put(venda));
  }
}

// ─── TOTAIS ───────────────────────────────────────────────────────────────────

export async function totalAbertoCliente(clienteId) {
  const vendas = await listarVendasPorCliente(clienteId);

  return vendas
    .filter(v => !v.pago)
    .reduce((soma, v) => soma + (parseFloat(v.valor) * (parseInt(v.quantidade) || 1)), 0);
}

export async function totalPorMes(clienteId, mes) {
  const vendas = await listarVendasPorClienteEMes(clienteId, mes);

  return vendas.reduce((soma, v) =>
    soma + (parseFloat(v.valor) * (parseInt(v.quantidade) || 1)), 0);
}

export async function totalGeralAberto() {
  const vendas = await listarVendas();

  return vendas
    .filter(v => !v.pago)
    .reduce((soma, v) => soma + (parseFloat(v.valor) * (parseInt(v.quantidade) || 1)), 0);
}

// ─── MESES FECHADOS ───────────────────────────────────────────────────────────

export async function fecharMes(clienteId, mes) {
  await initDB();

  const id = `${safeKey(clienteId)}_${mes}`;

  const registro = {
    id,
    cliente_id: String(clienteId),
    mes,
    fechado_em: new Date().toISOString(),
    synced: false
  };

  return promisify(tx('meses_fechados', 'readwrite').put(registro));
}

export async function mesFechado(clienteId, mes) {
  await initDB();

  const id = `${safeKey(clienteId)}_${mes}`;
  const registro = await promisify(tx('meses_fechados').get(id));

  return !!registro;
}

export async function listarMesesFechados(clienteId) {
  await initDB();

  const id = safeKey(clienteId, 'clienteId');

  const index = tx('meses_fechados').index('cliente_id');
  return promisify(index.getAll(IDBKeyRange.only(id)));
}

// ─── CONFIG ───────────────────────────────────────────────────────────────────

export async function salvarConfig(chave, valor) {
  await initDB();
  return promisify(tx('config', 'readwrite').put({ chave, valor }));
}

export async function lerConfig(chave) {
  await initDB();
  const registro = await promisify(tx('config').get(chave));
  return registro ? registro.valor : null;
}

// ─── EXPORTAÇÃO ───────────────────────────────────────────────────────────────

export async function exportarTudo() {
  await initDB();

  const clientes = await listarClientes();
  const vendas = await listarVendas();
  const meses = await promisify(tx('meses_fechados').getAll());

  return {
    clientes,
    vendas,
    meses_fechados: meses,
    exportado_em: new Date().toISOString()
  };
}

// ─── UTILITÁRIOS ──────────────────────────────────────────────────────────────

export function gerarId() {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export function formatarMoeda(valor) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(valor || 0);
}

export function formatarData(dataStr) {
  if (!dataStr) return '';
  const d = new Date(dataStr + 'T00:00:00');
  return d.toLocaleDateString('pt-BR');
}

export function mesAtual() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function mesesDisponiveis(vendas) {
  const set = new Set(vendas.map(v => v.mes_referencia));
  return [...set].sort().reverse();
}