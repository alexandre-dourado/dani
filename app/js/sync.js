/**
 * sync.js — Sincronização offline-first com Google Apps Script
 * DaniDoces PWA
 */

import {
  clientesNaoSincronizados,
  vendasNaoSincronizadas,
  marcarClienteSincronizado,
  marcarVendaSincronizada,
  lerConfig,
  exportarTudo
} from './db.js';

let syncEmAndamento = false;

// ─── URL do GAS (configurada nas settings) ────────────────────────────────────
async function getGasUrl() {
  return await lerConfig('gas_url') || '';
}

// ─── Status de conexão ────────────────────────────────────────────────────────
export function estaOnline() {
  return navigator.onLine;
}

// ─── Sincronização principal ──────────────────────────────────────────────────
export async function sincronizar(onProgress) {
  if (syncEmAndamento) return { ok: false, motivo: 'Sincronização já em andamento' };
  if (!estaOnline()) return { ok: false, motivo: 'Sem conexão com a internet' };

  const gasUrl = await getGasUrl();
  if (!gasUrl) return { ok: false, motivo: 'URL do servidor não configurada' };

  syncEmAndamento = true;
  let enviados = 0;
  let erros = 0;

  try {
    // 1. Sincroniza clientes pendentes
    const clientesPendentes = await clientesNaoSincronizados();
    if (onProgress) onProgress(`Enviando ${clientesPendentes.length} cliente(s)...`);

    for (const cliente of clientesPendentes) {
      try {
        const resp = await fetch(gasUrl, {
          method: 'POST',
          redirect: 'follow',
          headers: { 'Content-Type': 'text/plain' },
          body: JSON.stringify({ action: 'salvarCliente', ...cliente })
        });
        if (resp.ok) {
          const json = await resp.json().catch(() => ({}));
          if (json.ok !== false) {
            await marcarClienteSincronizado(cliente.id);
            enviados++;
          } else {
            console.error('GAS recusou cliente:', json.erro);
            erros++;
          }
        } else {
          erros++;
        }
      } catch (e) {
        console.error('Erro ao sync cliente:', e);
        erros++;
      }
    }

    // 2. Sincroniza vendas pendentes
    const vendasPendentes = await vendasNaoSincronizadas();
    if (onProgress) onProgress(`Enviando ${vendasPendentes.length} venda(s)...`);

    for (const venda of vendasPendentes) {
      try {
        const resp = await fetch(gasUrl, {
          method: 'POST',
          redirect: 'follow',
          headers: { 'Content-Type': 'text/plain' },
          body: JSON.stringify({ action: 'salvarVenda', ...venda })
        });
        if (resp.ok) {
          const json = await resp.json().catch(() => ({}));
          if (json.ok !== false) {
            await marcarVendaSincronizada(venda.id);
            enviados++;
          } else {
            console.error('GAS recusou venda:', json.erro);
            erros++;
          }
        } else {
          erros++;
        }
      } catch (e) {
        console.error('Erro ao sync venda:', e);
        erros++;
      }
    }

    // 3. Registra última sync
    const agora = new Date().toISOString();
    localStorage.setItem('ultima_sync', agora);

    return { ok: true, enviados, erros, timestamp: agora };

  } catch (e) {
    console.error('Erro geral de sync:', e);
    return { ok: false, motivo: e.message };
  } finally {
    syncEmAndamento = false;
  }
}

// ─── Sync em lote (fallback) ──────────────────────────────────────────────────
export async function sincronizarLote() {
  if (!estaOnline()) return false;
  const gasUrl = await getGasUrl();
  if (!gasUrl) return false;

  try {
    const dados = await exportarTudo();
    const resp = await fetch(gasUrl, {
      method: 'POST',
      redirect: 'follow',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ action: 'sync', ...dados })
    });
    return resp.ok;
  } catch (e) {
    console.error('Erro ao sync em lote:', e);
    return false;
  }
}

// ─── Auto-sync ao recuperar conexão ──────────────────────────────────────────
export function iniciarAutoSync(callback) {
  window.addEventListener('online', async () => {
    console.log('Conexão restaurada. Iniciando sync automático...');
    const resultado = await sincronizar();
    if (callback) callback(resultado);
  });
}

// ─── Última sincronização ─────────────────────────────────────────────────────
export function ultimaSync() {
  const ts = localStorage.getItem('ultima_sync');
  if (!ts) return 'Nunca sincronizado';
  const d = new Date(ts);
  return d.toLocaleString('pt-BR');
}

// ─── Exportar TXT ─────────────────────────────────────────────────────────────
export async function gerarTXT() {
  const dados = await exportarTudo();
  const linhas = [];
  linhas.push('═══════════════════════════════════════');
  linhas.push('         DANI DOCES — EXTRATO GERAL    ');
  linhas.push(`  Gerado em: ${new Date().toLocaleString('pt-BR')}`);
  linhas.push('═══════════════════════════════════════');
  linhas.push('');

  for (const cliente of dados.clientes) {
    const vendas = dados.vendas.filter(v => v.cliente_id === cliente.id);
    if (vendas.length === 0) continue;

    linhas.push(`CLIENTE: ${cliente.nome}`);
    if (cliente.telefone) linhas.push(`Telefone: ${cliente.telefone}`);
    linhas.push('─────────────────────────────────────');

    // Agrupa por mês
    const meses = [...new Set(vendas.map(v => v.mes_referencia))].sort();
    let totalGeral = 0;

    for (const mes of meses) {
      const vendasMes = vendas.filter(v => v.mes_referencia === mes);
      const [ano, m] = mes.split('-');
      const nomeMes = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
        'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'][parseInt(m)-1];
      linhas.push(`\n  📅 ${nomeMes}/${ano}`);

      let totalMes = 0;
      for (const v of vendasMes) {
        const subtotal = parseFloat(v.valor) * (parseInt(v.quantidade) || 1);
        totalMes += subtotal;
        const qtdStr = v.quantidade > 1 ? ` (${v.quantidade}x)` : '';
        const pagoStr = v.pago ? ' ✓ PAGO' : '';
        linhas.push(`  ${v.data} - ${v.descricao}${qtdStr} - R$ ${subtotal.toFixed(2).replace('.',',')}${pagoStr}`);
      }
      linhas.push(`  Total ${nomeMes}: R$ ${totalMes.toFixed(2).replace('.',',')}`);
      totalGeral += totalMes;
    }

    linhas.push('');
    linhas.push(`TOTAL GERAL ${cliente.nome}: R$ ${totalGeral.toFixed(2).replace('.',',')}`);
    linhas.push('═══════════════════════════════════════');
    linhas.push('');
  }

  return linhas.join('\n');
}

// ─── Exportar JSON ────────────────────────────────────────────────────────────
export async function gerarJSON() {
  const dados = await exportarTudo();
  return JSON.stringify(dados, null, 2);
}

// ─── Gerar texto de cobrança por cliente/mês ─────────────────────────────────
export function gerarTextoCobranca(cliente, vendas, mes) {
  const [ano, m] = mes.split('-');
  const nomeMes = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
    'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'][parseInt(m)-1];

  const linhas = [];
  linhas.push(`🍬 *Dani Doces*`);
  linhas.push(`📋 Resumo — ${nomeMes}/${ano}`);
  linhas.push('');
  linhas.push(`Cliente: *${cliente.nome}*`);
  linhas.push('');

  let total = 0;
  for (const v of vendas) {
    const subtotal = parseFloat(v.valor) * (parseInt(v.quantidade) || 1);
    total += subtotal;
    const qtdStr = v.quantidade > 1 ? ` (${v.quantidade}x)` : '';
    linhas.push(`• ${v.data} — ${v.descricao}${qtdStr}: R$ ${subtotal.toFixed(2).replace('.',',')}`);
  }

  linhas.push('');
  linhas.push(`💰 *Total: R$ ${total.toFixed(2).replace('.',',')}*`);
  linhas.push('');
  linhas.push('Qualquer dúvida, pode me chamar! 🍫');

  return linhas.join('\n');
}

// ─── URL WhatsApp ─────────────────────────────────────────────────────────────
export function gerarUrlWhatsApp(telefone, texto) {
  const numero = telefone.replace(/\D/g, '');
  const numeroCompleto = numero.startsWith('55') ? numero : `55${numero}`;
  const textoCodificado = encodeURIComponent(texto);
  return `https://wa.me/${numeroCompleto}?text=${textoCodificado}`;
}