/**
 * ui.js — Controlador de Interface
 * DaniDoces PWA
 */

import {
  initDB, salvarCliente, listarClientes, buscarCliente, deletarCliente,
  salvarVenda, listarVendasPorCliente, listarVendasPorClienteEMes,
  deletarVenda, marcarVendaPaga,
  totalAbertoCliente, totalPorMes,
  fecharMes, mesFechado, listarMesesFechados,
  salvarConfig, lerConfig,
  formatarMoeda, formatarData, mesParaLabel, mesAtual, mesesDisponiveis, gerarId
} from './db.js';

import {
  sincronizar, ultimaSync, estaOnline,
  gerarTXT, gerarJSON, gerarTextoCobranca, gerarUrlWhatsApp, iniciarAutoSync
} from './sync.js';

// ─── Estado global ────────────────────────────────────────────────────────────
let estadoAtual = 'inicio'; // inicio | nova-venda | cliente | resumo | config | pin
let clienteAtivo = null;
let mesAtivoPorCliente = {};
let toastTimeout = null;

// ─── Init ─────────────────────────────────────────────────────────────────────
export async function iniciar() {
  await initDB();

  // Verifica PIN
  const pin = await lerConfig('pin');
  if (pin) {
    mostrarTela('pin');
    return;
  }

  iniciarAutoSync((res) => {
    if (res.ok) mostrarToast('✅ Dados sincronizados!');
  });

  mostrarTela('inicio');
  atualizarStatusOnline();
  setInterval(atualizarStatusOnline, 5000);
}

// ─── Navegação entre telas ────────────────────────────────────────────────────
export function mostrarTela(tela, params = {}) {
  estadoAtual = tela;
  document.getElementById('app').innerHTML = '';

  const renderers = {
    'pin': renderPin,
    'inicio': renderInicio,
    'nova-venda': renderNovaVenda,
    'cliente': () => renderCliente(params.clienteId),
    'resumo': () => renderResumo(params.clienteId, params.mes),
    'config': renderConfig,
    'extrato-visual': () => renderExtratoVisual(params.clienteId, params.mes),
  };

  if (renderers[tela]) renderers[tela]();
}

// ─── PIN ──────────────────────────────────────────────────────────────────────
function renderPin() {
  const app = document.getElementById('app');
  app.innerHTML = `
    <div class="tela-pin">
      <div class="pin-logo">🍬</div>
      <h1>Dani Doces</h1>
      <p>Digite seu PIN para entrar</p>
      <div class="pin-display" id="pinDisplay">____</div>
      <div class="pin-teclado">
        ${[1,2,3,4,5,6,7,8,9,'⌫',0,'✓'].map(n => `
          <button class="pin-btn ${n === '⌫' ? 'pin-apagar' : ''} ${n === '✓' ? 'pin-confirmar' : ''}" 
                  onclick="window.ui.pinDigito('${n}')">
            ${n}
          </button>
        `).join('')}
      </div>
    </div>
  `;
  window._pinDigitado = '';
}

window.ui = {};
window.ui.pinDigito = async function(digito) {
  if (digito === '⌫') {
    window._pinDigitado = window._pinDigitado.slice(0, -1);
  } else if (digito === '✓') {
    const pinSalvo = await lerConfig('pin');
    if (!pinSalvo || window._pinDigitado === pinSalvo) {
      iniciarAutoSync();
      mostrarTela('inicio');
    } else {
      mostrarToast('❌ PIN incorreto', 'erro');
      window._pinDigitado = '';
    }
  } else {
    if (window._pinDigitado.length < 6) {
      window._pinDigitado += digito;
    }
  }
  // Atualiza display
  const display = document.getElementById('pinDisplay');
  if (display) {
    const preenchido = '●'.repeat(window._pinDigitado.length);
    const vazio = '_'.repeat(Math.max(0, 4 - window._pinDigitado.length));
    display.textContent = preenchido + vazio;
  }
};

// ─── TELA INICIAL ─────────────────────────────────────────────────────────────
async function renderInicio() {
  const app = document.getElementById('app');
  const clientes = await listarClientes();

  // Ordena por nome
  clientes.sort((a, b) => a.nome.localeCompare(b.nome));

  // Calcula totais
  const totais = {};
  for (const c of clientes) {
    totais[c.id] = await totalAbertoCliente(c.id);
  }

  const totalGeral = Object.values(totais).reduce((s, v) => s + v, 0);

  app.innerHTML = `
    <header class="header">
      <div class="header-logo">🍬 Dani Doces</div>
      <div class="header-actions">
        <span class="status-online ${estaOnline() ? 'online' : 'offline'}" id="statusOnline">
          ${estaOnline() ? '🟢' : '🔴'}
        </span>
        <button class="btn-icon" onclick="window.ui.irConfig()">⚙️</button>
      </div>
    </header>

    <div class="resumo-topo">
      <div class="total-geral">
        <span class="total-label">Total em aberto</span>
        <span class="total-valor">${formatarMoeda(totalGeral)}</span>
      </div>
    </div>

    <div class="busca-container">
      <input type="search" id="busca" placeholder="🔍 Buscar cliente..." 
             class="campo-busca" oninput="window.ui.filtrarClientes(this.value)">
    </div>

    <div class="clientes-lista" id="clientesLista">
      ${clientes.length === 0 ? `
        <div class="vazio">
          <div class="vazio-icon">📋</div>
          <p>Nenhum cliente ainda.</p>
          <p>Adicione sua primeira venda!</p>
        </div>
      ` : clientes.map(c => `
        <div class="cliente-card" onclick="window.ui.irCliente('${c.id}')" data-nome="${c.nome.toLowerCase()}">
          <div class="cliente-info">
            <div class="cliente-nome">${c.nome}</div>
            ${c.telefone ? `<div class="cliente-tel">📞 ${c.telefone}</div>` : ''}
          </div>
          <div class="cliente-total ${totais[c.id] > 0 ? 'tem-divida' : 'sem-divida'}">
            ${totais[c.id] > 0 ? formatarMoeda(totais[c.id]) : '✓ Em dia'}
          </div>
        </div>
      `).join('')}
    </div>

    <button class="btn-fab" onclick="window.ui.irNovaVenda()">
      + Nova Venda
    </button>
  `;

  // Guarda dados para filtro
  window._clientesLista = clientes;
  window._totaisClientes = totais;
}

window.ui.filtrarClientes = function(termo) {
  const cards = document.querySelectorAll('.cliente-card');
  const t = termo.toLowerCase();
  cards.forEach(card => {
    const nome = card.getAttribute('data-nome') || '';
    card.style.display = nome.includes(t) ? '' : 'none';
  });
};

window.ui.irInicio = () => mostrarTela('inicio');
window.ui.irConfig = () => mostrarTela('config');
window.ui.irCliente = (id) => mostrarTela('cliente', { clienteId: id });
window.ui.irNovaVenda = () => mostrarTela('nova-venda');

// ─── NOVA VENDA ───────────────────────────────────────────────────────────────
async function renderNovaVenda(clientePreSelecionado = null) {
  const app = document.getElementById('app');
  const clientes = await listarClientes();
  clientes.sort((a, b) => a.nome.localeCompare(b.nome));

  const hoje = new Date().toISOString().split('T')[0];

  app.innerHTML = `
    <header class="header">
      <button class="btn-voltar" onclick="window.ui.irInicio()">← Voltar</button>
      <h2>Nova Venda</h2>
      <div></div>
    </header>

    <div class="formulario">
      <div class="campo-grupo">
        <label class="campo-label">👤 Cliente *</label>
        <div class="cliente-select-wrapper">
          <select id="clienteSel" class="campo" onchange="window.ui.onClienteChange(this.value)">
            <option value="">Selecione ou crie novo...</option>
            ${clientes.map(c => `<option value="${c.id}" ${c.id === clientePreSelecionado ? 'selected' : ''}>${c.nome}</option>`).join('')}
            <option value="__novo__">➕ Criar novo cliente</option>
          </select>
        </div>
      </div>

      <div id="novoClienteForm" style="display:none">
        <div class="campo-grupo">
          <label class="campo-label">Nome do novo cliente *</label>
          <input type="text" id="novoNome" class="campo" placeholder="Nome completo">
        </div>
        <div class="campo-grupo">
          <label class="campo-label">Telefone (opcional)</label>
          <input type="tel" id="novoTel" class="campo" placeholder="(00) 00000-0000">
        </div>
      </div>

      <div class="campo-grupo">
        <label class="campo-label">🍬 O que foi vendido? *</label>
        <input type="text" id="descricao" class="campo" placeholder="Ex: Brigadeiro, Bolo de pote...">
      </div>

      <div class="campos-linha">
        <div class="campo-grupo flex-1">
          <label class="campo-label">💰 Valor (R$) *</label>
          <input type="number" id="valor" class="campo" placeholder="0,00" 
                 step="0.01" min="0" inputmode="decimal">
        </div>
        <div class="campo-grupo flex-1">
          <label class="campo-label">🔢 Quantidade</label>
          <input type="number" id="quantidade" class="campo" value="1" min="1" inputmode="numeric">
        </div>
      </div>

      <div class="campo-grupo">
        <label class="campo-label">📅 Data</label>
        <input type="date" id="data" class="campo" value="${hoje}">
      </div>

      <div class="subtotal-preview" id="subtotalPreview" style="display:none">
        <span>Subtotal:</span>
        <span id="subtotalValor" class="subtotal-valor"></span>
      </div>

      <button class="btn-salvar" onclick="window.ui.salvarVenda()">
        💾 SALVAR VENDA
      </button>
    </div>
  `;

  // Listeners para preview
  document.getElementById('valor').addEventListener('input', atualizarSubtotal);
  document.getElementById('quantidade').addEventListener('input', atualizarSubtotal);

  if (clientePreSelecionado) {
    document.getElementById('clienteSel').value = clientePreSelecionado;
  }
}

function atualizarSubtotal() {
  const valor = parseFloat(document.getElementById('valor').value) || 0;
  const qtd = parseInt(document.getElementById('quantidade').value) || 1;
  const preview = document.getElementById('subtotalPreview');
  if (valor > 0) {
    preview.style.display = 'flex';
    document.getElementById('subtotalValor').textContent = formatarMoeda(valor * qtd);
  } else {
    preview.style.display = 'none';
  }
}

window.ui.onClienteChange = function(valor) {
  const form = document.getElementById('novoClienteForm');
  form.style.display = valor === '__novo__' ? 'block' : 'none';
};

window.ui.salvarVenda = async function() {
  const clienteSel = document.getElementById('clienteSel').value;
  const descricao = document.getElementById('descricao').value.trim();
  const valor = parseFloat(document.getElementById('valor').value);
  const quantidade = parseInt(document.getElementById('quantidade').value) || 1;
  const data = document.getElementById('data').value;

  // Validações
  if (!descricao) { mostrarToast('⚠️ Informe o que foi vendido', 'aviso'); return; }
  if (!valor || valor <= 0) { mostrarToast('⚠️ Informe o valor', 'aviso'); return; }

  let clienteId;

  if (clienteSel === '__novo__' || !clienteSel) {
    // Cria novo cliente
    const nome = document.getElementById('novoNome')?.value.trim();
    const tel = document.getElementById('novoTel')?.value.trim();
    if (!nome) { mostrarToast('⚠️ Informe o nome do cliente', 'aviso'); return; }

    // Verifica duplicidade
    const todos = await listarClientes();
    const existente = todos.find(c => c.nome.toLowerCase() === nome.toLowerCase());
    if (existente) {
      const confirma = confirm(`⚠️ Já existe um cliente com o nome "${nome}". Deseja criar mesmo assim?`);
      if (!confirma) return;
    }

    const novoCliente = { nome, telefone: tel || '', observacoes: '' };
    await salvarCliente(novoCliente);
    clienteId = novoCliente.id;
    mostrarToast(`✅ Cliente "${nome}" criado!`);
  } else {
    clienteId = clienteSel;
  }

  if (!clienteId) { mostrarToast('⚠️ Selecione ou crie um cliente', 'aviso'); return; }

  // Salva venda
  const venda = { cliente_id: clienteId, descricao, valor, quantidade, data };
  await salvarVenda(venda);

  mostrarToast('✅ Venda salva com sucesso!');

  // Feedback visual e volta
  setTimeout(() => mostrarTela('cliente', { clienteId }), 800);
};

// ─── TELA CLIENTE ─────────────────────────────────────────────────────────────
async function renderCliente(clienteId) {
  const app = document.getElementById('app');
  const cliente = await buscarCliente(clienteId);
  if (!cliente) { mostrarTela('inicio'); return; }

  const vendas = await listarVendasPorCliente(clienteId);
  vendas.sort((a, b) => new Date(b.data) - new Date(a.data));

  const total = await totalAbertoCliente(clienteId);
  const meses = mesesDisponiveis(vendas);
  const mesCorrente = mesAtivoPorCliente[clienteId] || meses[0] || mesAtual();

  const vendasDoMes = vendas.filter(v => v.mes_referencia === mesCorrente);
  const totalMes = vendasDoMes.reduce((s, v) => s + (parseFloat(v.valor) * (v.quantidade || 1)), 0);
  const fechado = await mesFechado(clienteId, mesCorrente);

  app.innerHTML = `
    <header class="header">
      <button class="btn-voltar" onclick="window.ui.irInicio()">← Voltar</button>
      <h2>${cliente.nome}</h2>
      <button class="btn-icon" onclick="window.ui.editarCliente('${clienteId}')">✏️</button>
    </header>

    <div class="cliente-resumo-topo">
      <div class="info-pill">
        <span class="info-label">Em aberto</span>
        <span class="info-valor ${total > 0 ? 'valor-devendo' : 'valor-pago'}">${formatarMoeda(total)}</span>
      </div>
      ${cliente.telefone ? `
        <a class="btn-whatsapp-mini" href="https://wa.me/55${cliente.telefone.replace(/\D/g,'')}" target="_blank">
          📱 WhatsApp
        </a>
      ` : ''}
    </div>

    <!-- Seletor de mês -->
    ${meses.length > 0 ? `
    <div class="mes-selector">
      <button class="btn-seta" onclick="window.ui.navegarMes('${clienteId}', '${meses.join(',')}', -1)">◀</button>
      <div class="mes-atual">
        <div class="mes-nome">${mesParaLabel(mesCorrente)}</div>
        <div class="mes-total">${formatarMoeda(totalMes)} ${fechado ? '🔒' : ''}</div>
      </div>
      <button class="btn-seta" onclick="window.ui.navegarMes('${clienteId}', '${meses.join(',')}', 1)">▶</button>
    </div>
    ` : ''}

    <!-- Ações do mês -->
    <div class="acoes-mes">
      ${!fechado ? `
        <button class="btn-fechar-mes" onclick="window.ui.fecharMesCliente('${clienteId}', '${mesCorrente}')">
          🔒 Fechar Mês
        </button>
      ` : '<span class="badge-fechado">🔒 Mês fechado</span>'}
      <button class="btn-cobrar" onclick="window.ui.irResumo('${clienteId}', '${mesCorrente}')">
        💰 Cobrar
      </button>
    </div>

    <!-- Lista de vendas -->
    <div class="vendas-lista">
      ${vendasDoMes.length === 0 ? `
        <div class="vazio">
          <p>Nenhuma venda neste mês.</p>
        </div>
      ` : vendasDoMes.map(v => `
        <div class="venda-item ${v.pago ? 'venda-paga' : ''}" id="venda-${v.id}">
          <div class="venda-info">
            <div class="venda-data">${formatarData(v.data)}</div>
            <div class="venda-desc">${v.descricao}${v.quantidade > 1 ? ` (${v.quantidade}x)` : ''}</div>
          </div>
          <div class="venda-direita">
            <div class="venda-valor">${formatarMoeda(parseFloat(v.valor) * (v.quantidade || 1))}</div>
            <div class="venda-acoes">
              ${!v.pago ? `
                <button class="btn-mini btn-pagar" onclick="window.ui.marcarPago('${v.id}', '${clienteId}')">✓ Pago</button>
              ` : '<span class="tag-pago">✓ Pago</span>'}
              ${!fechado ? `
                <button class="btn-mini btn-excluir" onclick="window.ui.excluirVenda('${v.id}', '${clienteId}')">🗑</button>
              ` : ''}
            </div>
          </div>
        </div>
      `).join('')}
    </div>

    <!-- Botão nova venda para esse cliente -->
    <button class="btn-fab" onclick="window.ui.novaVendaParaCliente('${clienteId}')">
      + Nova Venda
    </button>
  `;
}

window.ui.navegarMes = function(clienteId, mesesStr, direcao) {
  const meses = mesesStr.split(',');
  const atual = mesAtivoPorCliente[clienteId] || meses[0];
  const idx = meses.indexOf(atual);
  const novoIdx = idx - direcao; // invertido pois lista está em ordem decrescente
  if (novoIdx >= 0 && novoIdx < meses.length) {
    mesAtivoPorCliente[clienteId] = meses[novoIdx];
    mostrarTela('cliente', { clienteId });
  }
};

window.ui.marcarPago = async function(vendaId, clienteId) {
  await marcarVendaPaga(vendaId, true);
  mostrarToast('✅ Marcado como pago!');
  mostrarTela('cliente', { clienteId });
};

window.ui.excluirVenda = async function(vendaId, clienteId) {
  if (!confirm('Deseja excluir esta venda?')) return;
  await deletarVenda(vendaId);
  mostrarToast('🗑 Venda excluída');
  mostrarTela('cliente', { clienteId });
};

window.ui.fecharMesCliente = async function(clienteId, mes) {
  if (!confirm(`Fechar ${mesParaLabel(mes)}? Nenhuma alteração poderá ser feita.`)) return;
  await fecharMes(clienteId, mes);
  mostrarToast('🔒 Mês fechado com sucesso!');
  mostrarTela('cliente', { clienteId });
};

window.ui.irResumo = (clienteId, mes) => mostrarTela('resumo', { clienteId, mes });
window.ui.novaVendaParaCliente = (clienteId) => { renderNovaVenda(clienteId); };

window.ui.editarCliente = async function(clienteId) {
  const cliente = await buscarCliente(clienteId);
  const nome = prompt('Nome do cliente:', cliente.nome);
  if (nome && nome.trim()) {
    cliente.nome = nome.trim();
    const tel = prompt('Telefone (com DDD):', cliente.telefone || '');
    cliente.telefone = tel || '';
    await salvarCliente(cliente);
    mostrarToast('✅ Cliente atualizado!');
    mostrarTela('cliente', { clienteId });
  }
};

// ─── RESUMO / COBRANÇA ────────────────────────────────────────────────────────
async function renderResumo(clienteId, mes) {
  const app = document.getElementById('app');
  const cliente = await buscarCliente(clienteId);
  const vendas = await listarVendasPorClienteEMes(clienteId, mes);
  vendas.sort((a, b) => new Date(a.data) - new Date(b.data));

  const total = vendas.reduce((s, v) => s + (parseFloat(v.valor) * (v.quantidade || 1)), 0);
  const texto = gerarTextoCobranca(cliente, vendas, mes);

  app.innerHTML = `
    <header class="header">
      <button class="btn-voltar" onclick="window.ui.irCliente('${clienteId}')">← Voltar</button>
      <h2>Cobrança</h2>
      <button class="btn-icon" onclick="window.ui.irExtratoVisual('${clienteId}', '${mes}')">🖼</button>
    </header>

    <div class="resumo-header">
      <div class="resumo-cliente">${cliente.nome}</div>
      <div class="resumo-mes">${mesParaLabel(mes)}</div>
      <div class="resumo-total">${formatarMoeda(total)}</div>
    </div>

    <div class="resumo-itens">
      ${vendas.map(v => `
        <div class="resumo-item">
          <div class="resumo-item-info">
            <span class="resumo-data">${formatarData(v.data)}</span>
            <span class="resumo-desc">${v.descricao}${v.quantidade > 1 ? ` (${v.quantidade}x)` : ''}</span>
          </div>
          <span class="resumo-valor">${formatarMoeda(parseFloat(v.valor) * (v.quantidade || 1))}</span>
        </div>
      `).join('')}
    </div>

    <div class="texto-cobranca" id="textoCobranca">${texto}</div>

    <div class="acoes-cobranca">
      <button class="btn-copiar" onclick="window.ui.copiarTexto()">
        📋 Copiar Texto
      </button>
      ${cliente.telefone ? `
        <a class="btn-whatsapp" 
           href="${gerarUrlWhatsApp(cliente.telefone, texto)}" 
           target="_blank">
          📲 Enviar WhatsApp
        </a>
      ` : `
        <button class="btn-whatsapp btn-desabilitado" onclick="alert('Cadastre o telefone do cliente para usar este recurso.')">
          📲 Enviar WhatsApp
        </button>
      `}
    </div>

    <div class="acoes-secundarias">
      <button class="btn-secundario" onclick="window.ui.irExtratoVisual('${clienteId}', '${mes}')">
        🖼 Ver Extrato Visual
      </button>
    </div>
  `;
}

window.ui.irCliente = (id) => mostrarTela('cliente', { clienteId: id });
window.ui.irExtratoVisual = (clienteId, mes) => mostrarTela('extrato-visual', { clienteId, mes });

window.ui.copiarTexto = function() {
  const txt = document.getElementById('textoCobranca').innerText;
  navigator.clipboard.writeText(txt).then(() => {
    mostrarToast('📋 Texto copiado!');
  }).catch(() => {
    // Fallback
    const ta = document.createElement('textarea');
    ta.value = txt;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    mostrarToast('📋 Texto copiado!');
  });
};

// ─── EXTRATO VISUAL (para print/screenshot) ───────────────────────────────────
async function renderExtratoVisual(clienteId, mes) {
  const app = document.getElementById('app');
  const cliente = await buscarCliente(clienteId);
  const vendas = await listarVendasPorClienteEMes(clienteId, mes);
  vendas.sort((a, b) => new Date(a.data) - new Date(b.data));
  const total = vendas.reduce((s, v) => s + (parseFloat(v.valor) * (v.quantidade || 1)), 0);

  app.innerHTML = `
    <header class="header header-print-hide">
      <button class="btn-voltar" onclick="window.ui.irResumo('${clienteId}', '${mes}')">← Voltar</button>
      <h2>Extrato Visual</h2>
      <button class="btn-icon" onclick="window.print()">🖨</button>
    </header>

    <div class="extrato-visual" id="extratoVisual">
      <div class="extrato-topo">
        <div class="extrato-logo">🍬</div>
        <div class="extrato-titulo">Dani Doces</div>
        <div class="extrato-subtitulo">Extrato de Compras</div>
      </div>

      <div class="extrato-info">
        <div class="extrato-linha">
          <span class="extrato-label">Cliente</span>
          <span class="extrato-dado">${cliente.nome}</span>
        </div>
        ${cliente.telefone ? `
        <div class="extrato-linha">
          <span class="extrato-label">Telefone</span>
          <span class="extrato-dado">${cliente.telefone}</span>
        </div>` : ''}
        <div class="extrato-linha">
          <span class="extrato-label">Período</span>
          <span class="extrato-dado">${mesParaLabel(mes)}</span>
        </div>
        <div class="extrato-linha">
          <span class="extrato-label">Emitido em</span>
          <span class="extrato-dado">${new Date().toLocaleDateString('pt-BR')}</span>
        </div>
      </div>

      <div class="extrato-divisor"></div>

      <div class="extrato-itens">
        <div class="extrato-cabecalho">
          <span>Data</span>
          <span>Descrição</span>
          <span>Qtd</span>
          <span>Valor</span>
        </div>
        ${vendas.map(v => `
          <div class="extrato-item-linha">
            <span>${formatarData(v.data)}</span>
            <span>${v.descricao}</span>
            <span>${v.quantidade || 1}x</span>
            <span>${formatarMoeda(parseFloat(v.valor) * (v.quantidade || 1))}</span>
          </div>
        `).join('')}
      </div>

      <div class="extrato-divisor"></div>

      <div class="extrato-total">
        <span>TOTAL</span>
        <span>${formatarMoeda(total)}</span>
      </div>

      <div class="extrato-rodape">
        <div>Obrigada pela preferência! 💕</div>
        <div class="extrato-rodape-pequeno">Dani Doces — ${new Date().getFullYear()}</div>
      </div>
    </div>

    <div class="acoes-extrato header-print-hide">
      <button class="btn-salvar" onclick="window.print()">
        🖨 Salvar / Imprimir
      </button>
    </div>
  `;
}

// ─── CONFIGURAÇÕES ────────────────────────────────────────────────────────────
async function renderConfig() {
  const app = document.getElementById('app');
  const gasUrl = await lerConfig('gas_url') || '';
  const pinAtual = await lerConfig('pin') || '';

  app.innerHTML = `
    <header class="header">
      <button class="btn-voltar" onclick="window.ui.irInicio()">← Voltar</button>
      <h2>⚙️ Configurações</h2>
      <div></div>
    </header>

    <div class="config-lista">

      <div class="config-secao">
        <div class="config-secao-titulo">🔐 Segurança</div>
        <div class="campo-grupo">
          <label class="campo-label">PIN de acesso (4–6 dígitos)</label>
          <input type="password" id="pinNovo" class="campo" maxlength="6" 
                 inputmode="numeric" placeholder="${pinAtual ? '••••' : 'Sem PIN'}"
                 value="${pinAtual}">
        </div>
        <button class="btn-config" onclick="window.ui.salvarPin()">💾 Salvar PIN</button>
        ${pinAtual ? `<button class="btn-config btn-perigo" onclick="window.ui.removerPin()">🗑 Remover PIN</button>` : ''}
      </div>

      <div class="config-secao">
        <div class="config-secao-titulo">🔌 Sincronização</div>
        <div class="campo-grupo">
          <label class="campo-label">URL do Google Apps Script</label>
          <input type="url" id="gasUrl" class="campo" placeholder="https://script.google.com/..." value="${gasUrl}">
        </div>
        <button class="btn-config" onclick="window.ui.salvarGasUrl()">💾 Salvar URL</button>
        <button class="btn-config btn-sync" onclick="window.ui.sincronizarAgora()">🔄 Sincronizar Agora</button>
        <div class="config-info">Última sync: ${ultimaSync()}</div>
      </div>

      <div class="config-secao">
        <div class="config-secao-titulo">💾 Exportar Dados</div>
        <button class="btn-config" onclick="window.ui.exportarTXT()">📄 Exportar TXT</button>
        <button class="btn-config" onclick="window.ui.exportarJSON()">📦 Exportar JSON (Backup)</button>
      </div>

      <div class="config-secao config-secao-perigo">
        <div class="config-secao-titulo">⚠️ Zona de Perigo</div>
        <button class="btn-config btn-perigo" onclick="window.ui.limparDados()">🗑 Apagar Todos os Dados</button>
      </div>

    </div>
  `;
}

window.ui.salvarPin = async function() {
  const pin = document.getElementById('pinNovo').value.trim();
  if (pin && (pin.length < 4 || pin.length > 6)) {
    mostrarToast('⚠️ PIN deve ter 4 a 6 dígitos', 'aviso');
    return;
  }
  await salvarConfig('pin', pin);
  mostrarToast('✅ PIN salvo!');
};

window.ui.removerPin = async function() {
  if (!confirm('Remover o PIN de acesso?')) return;
  await salvarConfig('pin', '');
  mostrarToast('🔓 PIN removido');
  mostrarTela('config');
};

window.ui.salvarGasUrl = async function() {
  const url = document.getElementById('gasUrl').value.trim();
  await salvarConfig('gas_url', url);
  mostrarToast('✅ URL salva!');
};

window.ui.sincronizarAgora = async function() {
  mostrarToast('🔄 Sincronizando...', 'info', 10000);
  const res = await sincronizar((msg) => mostrarToast(msg, 'info', 5000));
  if (res.ok) {
    mostrarToast(`✅ Sync concluído! ${res.enviados} item(s) enviado(s)`);
  } else {
    mostrarToast(`❌ Erro: ${res.motivo}`, 'erro');
  }
  mostrarTela('config');
};

window.ui.exportarTXT = async function() {
  const txt = await gerarTXT();
  downloadArquivo(txt, 'danidoces-extrato.txt', 'text/plain');
  mostrarToast('📄 TXT exportado!');
};

window.ui.exportarJSON = async function() {
  const json = await gerarJSON();
  downloadArquivo(json, 'danidoces-backup.json', 'application/json');
  mostrarToast('📦 JSON exportado!');
};

window.ui.limparDados = async function() {
  const confirmacao = prompt('Digite APAGAR para confirmar a exclusão de todos os dados:');
  if (confirmacao === 'APAGAR') {
    indexedDB.deleteDatabase('danidoces');
    mostrarToast('🗑 Dados apagados. Reiniciando...');
    setTimeout(() => location.reload(), 1500);
  } else {
    mostrarToast('Operação cancelada', 'info');
  }
};

// ─── UTILITÁRIOS DE UI ────────────────────────────────────────────────────────
export function mostrarToast(msg, tipo = 'sucesso', duracao = 3000) {
  clearTimeout(toastTimeout);
  let toast = document.getElementById('toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.className = `toast toast-${tipo} toast-ativo`;
  toastTimeout = setTimeout(() => {
    toast.className = 'toast';
  }, duracao);
}

function downloadArquivo(conteudo, nome, tipo) {
  const blob = new Blob([conteudo], { type: tipo });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  a.click();
  URL.revokeObjectURL(url);
}

function atualizarStatusOnline() {
  const el = document.getElementById('statusOnline');
  if (el) {
    el.textContent = estaOnline() ? '🟢' : '🔴';
    el.className = `status-online ${estaOnline() ? 'online' : 'offline'}`;
  }
}
