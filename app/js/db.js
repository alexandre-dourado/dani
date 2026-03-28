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

      // Store: clientes
      if (!db.objectStoreNames.contains('clientes')) {
        const clientesStore = db.createObjectStore('clientes', { keyPath: 'id' });
        clientesStore.createIndex('nome', 'nome', { unique: false });
        clientesStore.createIndex('synced', 'synced', { unique: false });
      }

      // Store: vendas
      if (!db.objectStoreNames.contains('vendas')) {
        const vendasStore = db.createObjectStore('vendas', { keyPath: 'id' });
        vendasStore.createIndex('cliente_id', 'cliente_id', { unique: false });
        vendasStore.createIndex('mes_referencia', 'mes_referencia', { unique: false });
        vendasStore.createIndex('synced', 'synced', { unique: false });
        vendasStore.createIndex('pago', 'pago', { unique: false });
      }

      // Store: config
      if (!db.objectStoreNames.contains('config')) {
        db.createObjectStore('config', { keyPath: 'chave' });
      }

      // Store: meses_fechados
      if (!db.objectStoreNames.contains('meses_fechados')) {
        const mesesStore = db.createObjectStore('meses_fechados', { keyPath: 'id' });
        mesesStore.createIndex('cliente_id', 'cliente_id', { unique: false });
        mesesStore.createIndex('mes', 'mes', { unique: false });
      }
    };

    request.onsuccess = (event) => {
      db = event.target.result;
      resolve(db);
    };

    request.onerror = (event) => {
      console.error('Erro ao abrir IndexedDB:', event.target.error);
      reject(event.target.error);
    };
  });
}

// ─── Helper: transação genérica ───────────────────────────────────────────────
function tx(storeName, mode = 'readonly') {
  return db.transaction(storeName, mode).objectStore(storeName);
}

function promisify(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
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
  const todos = await promisify(tx('clientes').getAll());
  return todos.filter(c => !c.synced);
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
  const store = tx('vendas');
  const index = store.index('cliente_id');
  return promisify(index.getAll(IDBKeyRange.only(clienteId)));
}

export async function listarVendasPorClienteEMes(clienteId, mes) {
  await initDB();
  const todas = await listarVendasPorCliente(clienteId);
  return todas.filter(v => v.mes_referencia === mes);
}

export async function deletarVenda(id) {
  await initDB();
  return promisify(tx('vendas', 'readwrite').delete(id));
}

export async function marcarVendaPaga(id, pago = true) {
  await initDB();
  const venda = await promisify(tx('vendas').get(id));
  if (venda) {
    venda.pago = pago;
    venda.synced = false;
    return promisify(tx('vendas', 'readwrite').put(venda));
  }
}

export async function vendasNaoSincronizadas() {
  await initDB();
  const todas = await promisify(tx('vendas').getAll());
  return todas.filter(v => !v.synced);
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
  return vendas.reduce((soma, v) => soma + (parseFloat(v.valor) * (parseInt(v.quantidade) || 1)), 0);
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
  const id = `${clienteId}_${mes}`;
  const registro = {
    id,
    cliente_id: clienteId,
    mes,
    fechado_em: new Date().toISOString(),
    synced: false
  };
  return promisify(tx('meses_fechados', 'readwrite').put(registro));
}

export async function mesFechado(clienteId, mes) {
  await initDB();
  const id = `${clienteId}_${mes}`;
  const registro = await promisify(tx('meses_fechados').get(id));
  return !!registro;
}

export async function listarMesesFechados(clienteId) {
  await initDB();
  const store = tx('meses_fechados');
  const index = store.index('cliente_id');
  return promisify(index.getAll(IDBKeyRange.only(clienteId)));
}

// ─── CONFIG / PIN ─────────────────────────────────────────────────────────────

export async function salvarConfig(chave, valor) {
  await initDB();
  return promisify(tx('config', 'readwrite').put({ chave, valor }));
}

export async function lerConfig(chave) {
  await initDB();
  const registro = await promisify(tx('config').get(chave));
  return registro ? registro.valor : null;
}

// ─── EXPORTAÇÃO COMPLETA ──────────────────────────────────────────────────────

export async function exportarTudo() {
  await initDB();
  const clientes = await listarClientes();
  const vendas = await listarVendas();
  const meses = await promisify(tx('meses_fechados').getAll());
  return { clientes, vendas, meses_fechados: meses, exportado_em: new Date().toISOString() };
}

// ─── UTILITÁRIOS ──────────────────────────────────────────────────────────────

export function gerarId() {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export function formatarMoeda(valor) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor || 0);
}

export function formatarData(dataStr) {
  if (!dataStr) return '';
  const d = new Date(dataStr + 'T00:00:00');
  return d.toLocaleDateString('pt-BR');
}

export function mesParaLabel(mesStr) {
  if (!mesStr) return '';
  const [ano, mes] = mesStr.split('-');
  const meses = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
                  'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  return `${meses[parseInt(mes) - 1]} de ${ano}`;
}

export function mesAtual() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function mesesDisponiveis(vendas) {
  const set = new Set(vendas.map(v => v.mes_referencia));
  return [...set].sort().reverse();
}