/**
 * Code.gs — Google Apps Script
 * DaniDoces — API REST + Integração com Google Sheets
 *
 * COMO USAR:
 * 1. Acesse script.google.com → Novo Projeto
 * 2. Cole este código
 * 3. Clique em "Executar" > "setupSheet" para criar a planilha
 * 4. Clique em "Implantar" > "Nova implantação"
 *    - Tipo: App da Web
 *    - Executar como: Eu (sua conta)
 *    - Acesso: Qualquer pessoa
 * 5. Copie a URL gerada e cole nas Configurações do app
 */

// ─── Configuração da Planilha ─────────────────────────────────────────────────
const SHEET_ID = PropertiesService.getScriptProperties().getProperty('SHEET_ID') || '';
const NOME_PLANILHA = 'DaniDoces';

// ─── CORS Helper ──────────────────────────────────────────────────────────────
function criarResposta(dados, statusCode) {
  const jsonStr = JSON.stringify(dados);
  return ContentService
    .createTextOutput(jsonStr)
    .setMimeType(ContentService.MimeType.JSON);
}

function respostaErro(mensagem, codigo) {
  return criarResposta({ ok: false, erro: mensagem, codigo: codigo || 400 });
}

function respostaSucesso(dados) {
  return criarResposta({ ok: true, ...dados });
}

// ─── Roteador principal (GET) ─────────────────────────────────────────────────
function doGet(e) {
  try {
    const action = e.parameter.action || '';
    
    switch (action) {
      case 'listarClientes':
        return listarClientes();
      case 'listarVendas':
        return listarVendas();
      case 'status':
        return respostaSucesso({ status: 'online', versao: '1.0.0' });
      default:
        return respostaSucesso({ 
          status: 'DaniDoces API', 
          versao: '1.0.0',
          endpoints: ['listarClientes', 'listarVendas', 'salvarCliente', 'salvarVenda', 'sync']
        });
    }
  } catch (err) {
    Logger.log('Erro no doGet: ' + err.message);
    return respostaErro('Erro interno: ' + err.message, 500);
  }
}

// ─── Roteador principal (POST) ────────────────────────────────────────────────
function doPost(e) {
  try {
    const action = e.parameter.action || '';
    let body = {};
    
    try {
      body = JSON.parse(e.postData.contents);
    } catch (parseErr) {
      return respostaErro('JSON inválido no corpo da requisição');
    }
    
    switch (action) {
      case 'salvarCliente':
        return salvarClienteEndpoint(body);
      case 'salvarVenda':
        return salvarVendaEndpoint(body);
      case 'sync':
        return syncLote(body);
      default:
        return respostaErro('Action desconhecida: ' + action);
    }
  } catch (err) {
    Logger.log('Erro no doPost: ' + err.message);
    return respostaErro('Erro interno: ' + err.message, 500);
  }
}

// ─── Obtém/cria a planilha ────────────────────────────────────────────────────
function getSpreadsheet() {
  const sheetId = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  if (sheetId) {
    try {
      return SpreadsheetApp.openById(sheetId);
    } catch (e) {
      Logger.log('Planilha não encontrada pelo ID. Criando nova...');
    }
  }
  
  // Cria nova planilha
  const ss = SpreadsheetApp.create(NOME_PLANILHA);
  PropertiesService.getScriptProperties().setProperty('SHEET_ID', ss.getId());
  Logger.log('Nova planilha criada: ' + ss.getId());
  return ss;
}

function getAba(nomeAba) {
  const ss = getSpreadsheet();
  let aba = ss.getSheetByName(nomeAba);
  if (!aba) {
    aba = ss.insertSheet(nomeAba);
  }
  return aba;
}

// ─── SETUP COMPLETO DA PLANILHA ───────────────────────────────────────────────
/**
 * setupSheet — Configura a planilha automaticamente
 * Execute esta função UMA VEZ após criar o projeto GAS
 */
function setupSheet() {
  Logger.log('Iniciando setup da planilha...');
  
  const ss = getSpreadsheet();
  
  // Remove aba padrão "Página1" se existir
  const abasPadrao = ss.getSheets().filter(s => 
    s.getName() === 'Página1' || s.getName() === 'Sheet1' || s.getName() === 'Plan1'
  );
  
  // ── Aba: CLIENTES ────────────────────────────────
  let abaClientes = ss.getSheetByName('CLIENTES');
  if (!abaClientes) {
    abaClientes = ss.insertSheet('CLIENTES');
  }
  
  abaClientes.clearContents();
  abaClientes.clearFormats();
  
  // Cabeçalho
  const headerClientes = [['id', 'nome', 'telefone', 'observacoes', 'data_criacao', 'synced_em']];
  abaClientes.getRange(1, 1, 1, 6).setValues(headerClientes);
  
  // Formatação do cabeçalho
  const rangeHeaderC = abaClientes.getRange(1, 1, 1, 6);
  rangeHeaderC.setBackground('#E8437A');
  rangeHeaderC.setFontColor('#FFFFFF');
  rangeHeaderC.setFontWeight('bold');
  rangeHeaderC.setFontSize(11);
  
  // Larguras das colunas
  abaClientes.setColumnWidth(1, 200); // id
  abaClientes.setColumnWidth(2, 200); // nome
  abaClientes.setColumnWidth(3, 150); // telefone
  abaClientes.setColumnWidth(4, 250); // observacoes
  abaClientes.setColumnWidth(5, 180); // data_criacao
  abaClientes.setColumnWidth(6, 180); // synced_em
  
  // Congela primeira linha
  abaClientes.setFrozenRows(1);
  
  Logger.log('Aba CLIENTES configurada');
  
  // ── Aba: VENDAS ──────────────────────────────────
  let abaVendas = ss.getSheetByName('VENDAS');
  if (!abaVendas) {
    abaVendas = ss.insertSheet('VENDAS');
  }
  
  abaVendas.clearContents();
  abaVendas.clearFormats();
  
  // Cabeçalho
  const headerVendas = [['id', 'cliente_id', 'valor', 'descricao', 'quantidade', 'data', 'mes_referencia', 'pago', 'synced_em']];
  abaVendas.getRange(1, 1, 1, 9).setValues(headerVendas);
  
  // Formatação do cabeçalho
  const rangeHeaderV = abaVendas.getRange(1, 1, 1, 9);
  rangeHeaderV.setBackground('#E8437A');
  rangeHeaderV.setFontColor('#FFFFFF');
  rangeHeaderV.setFontWeight('bold');
  rangeHeaderV.setFontSize(11);
  
  // Larguras
  abaVendas.setColumnWidth(1, 200); // id
  abaVendas.setColumnWidth(2, 200); // cliente_id
  abaVendas.setColumnWidth(3, 100); // valor
  abaVendas.setColumnWidth(4, 250); // descricao
  abaVendas.setColumnWidth(5, 90);  // quantidade
  abaVendas.setColumnWidth(6, 120); // data
  abaVendas.setColumnWidth(7, 130); // mes_referencia
  abaVendas.setColumnWidth(8, 80);  // pago
  abaVendas.setColumnWidth(9, 180); // synced_em
  
  abaVendas.setFrozenRows(1);
  
  Logger.log('Aba VENDAS configurada');
  
  // ── Aba: RESUMO ──────────────────────────────────
  let abaResumo = ss.getSheetByName('RESUMO');
  if (!abaResumo) {
    abaResumo = ss.insertSheet('RESUMO');
  }
  
  abaResumo.clearContents();
  abaResumo.clearFormats();
  
  // Título
  abaResumo.getRange('A1').setValue('📊 RESUMO — DANI DOCES');
  abaResumo.getRange('A1').setFontSize(14).setFontWeight('bold').setFontColor('#E8437A');
  
  abaResumo.getRange('A3').setValue('Última atualização:');
  abaResumo.getRange('B3').setValue(new Date().toLocaleString('pt-BR'));
  
  abaResumo.getRange('A5').setValue('Total de Clientes:');
  abaResumo.getRange('B5').setFormula("=COUNTA(CLIENTES!A:A)-1");
  
  abaResumo.getRange('A6').setValue('Total de Vendas:');
  abaResumo.getRange('B6').setFormula("=COUNTA(VENDAS!A:A)-1");
  
  abaResumo.getRange('A7').setValue('Valor Total Geral:');
  abaResumo.getRange('B7').setFormula("=SUMPRODUCT(VENDAS!C2:C10000*VENDAS!E2:E10000)");
  abaResumo.getRange('B7').setNumberFormat('R$ #,##0.00');
  
  abaResumo.getRange('A9').setValue('Valor Total em Aberto:');
  abaResumo.getRange('B9').setFormula("=SUMPRODUCT((VENDAS!H2:H10000=FALSE)*VENDAS!C2:C10000*VENDAS!E2:E10000)");
  abaResumo.getRange('B9').setNumberFormat('R$ #,##0.00');
  
  abaResumo.getRange('A10').setValue('Valor Total Pago:');
  abaResumo.getRange('B10').setFormula("=SUMPRODUCT((VENDAS!H2:H10000=TRUE)*VENDAS!C2:C10000*VENDAS!E2:E10000)");
  abaResumo.getRange('B10').setNumberFormat('R$ #,##0.00');
  
  abaResumo.setColumnWidth(1, 220);
  abaResumo.setColumnWidth(2, 180);
  
  Logger.log('Aba RESUMO configurada');
  
  // ── Aba: CONFIG ──────────────────────────────────
  let abaConfig = ss.getSheetByName('CONFIG');
  if (!abaConfig) {
    abaConfig = ss.insertSheet('CONFIG');
  }
  
  abaConfig.clearContents();
  abaConfig.getRange('A1').setValue('Chave');
  abaConfig.getRange('B1').setValue('Valor');
  abaConfig.getRange(1, 1, 1, 2).setBackground('#E8437A').setFontColor('#FFFFFF').setFontWeight('bold');
  
  abaConfig.getRange('A2').setValue('versao');
  abaConfig.getRange('B2').setValue('1.0.0');
  abaConfig.getRange('A3').setValue('criado_em');
  abaConfig.getRange('B3').setValue(new Date().toISOString());
  abaConfig.getRange('A4').setValue('sheet_id');
  abaConfig.getRange('B4').setValue(ss.getId());
  
  Logger.log('Aba CONFIG configurada');
  
  // Remove abas padrão vazias
  abasPadrao.forEach(aba => {
    try {
      if (ss.getSheets().length > 1) {
        ss.deleteSheet(aba);
        Logger.log('Aba padrão removida: ' + aba.getName());
      }
    } catch (e) {
      Logger.log('Não foi possível remover aba: ' + aba.getName());
    }
  });
  
  // Log final
  const url = ss.getUrl();
  Logger.log('✅ Setup concluído!');
  Logger.log('URL da planilha: ' + url);
  Logger.log('ID da planilha: ' + ss.getId());
  
  // Mostra resultado no log
  const resultado = {
    ok: true,
    mensagem: 'Planilha configurada com sucesso!',
    sheet_id: ss.getId(),
    sheet_url: url,
    abas: ['CLIENTES', 'VENDAS', 'RESUMO', 'CONFIG']
  };
  
  Logger.log(JSON.stringify(resultado));
  return resultado;
}

// ─── CLIENTES ─────────────────────────────────────────────────────────────────

function listarClientes() {
  try {
    const aba = getAba('CLIENTES');
    const dados = aba.getDataRange().getValues();
    
    if (dados.length <= 1) {
      return respostaSucesso({ clientes: [] });
    }
    
    const clientes = dados.slice(1).map(row => ({
      id: row[0],
      nome: row[1],
      telefone: row[2],
      observacoes: row[3],
      data_criacao: row[4],
      synced: true
    })).filter(c => c.id); // Remove linhas vazias
    
    return respostaSucesso({ clientes });
  } catch (err) {
    Logger.log('Erro ao listar clientes: ' + err.message);
    return respostaErro('Erro ao listar clientes: ' + err.message);
  }
}

function salvarClienteEndpoint(cliente) {
  try {
    if (!cliente.id || !cliente.nome) {
      return respostaErro('id e nome são obrigatórios');
    }
    
    const aba = getAba('CLIENTES');
    const dados = aba.getDataRange().getValues();
    
    // Procura linha existente pelo ID
    let linhaExistente = -1;
    for (let i = 1; i < dados.length; i++) {
      if (dados[i][0] === cliente.id) {
        linhaExistente = i + 1;
        break;
      }
    }
    
    const agora = new Date().toISOString();
    const novaLinha = [
      cliente.id,
      cliente.nome,
      cliente.telefone || '',
      cliente.observacoes || '',
      cliente.data_criacao || agora,
      agora
    ];
    
    if (linhaExistente > 0) {
      // Atualiza linha existente
      aba.getRange(linhaExistente, 1, 1, 6).setValues([novaLinha]);
    } else {
      // Adiciona nova linha
      aba.appendRow(novaLinha);
    }
    
    Logger.log('Cliente salvo: ' + cliente.nome);
    return respostaSucesso({ id: cliente.id, acao: linhaExistente > 0 ? 'atualizado' : 'criado' });
  } catch (err) {
    Logger.log('Erro ao salvar cliente: ' + err.message);
    return respostaErro('Erro ao salvar cliente: ' + err.message);
  }
}

// ─── VENDAS ───────────────────────────────────────────────────────────────────

function listarVendas() {
  try {
    const aba = getAba('VENDAS');
    const dados = aba.getDataRange().getValues();
    
    if (dados.length <= 1) {
      return respostaSucesso({ vendas: [] });
    }
    
    const vendas = dados.slice(1).map(row => ({
      id: row[0],
      cliente_id: row[1],
      valor: parseFloat(row[2]) || 0,
      descricao: row[3],
      quantidade: parseInt(row[4]) || 1,
      data: row[5],
      mes_referencia: row[6],
      pago: row[7] === true || row[7] === 'TRUE' || row[7] === 'true',
      synced: true
    })).filter(v => v.id);
    
    return respostaSucesso({ vendas });
  } catch (err) {
    Logger.log('Erro ao listar vendas: ' + err.message);
    return respostaErro('Erro ao listar vendas: ' + err.message);
  }
}

function salvarVendaEndpoint(venda) {
  try {
    if (!venda.id || !venda.cliente_id) {
      return respostaErro('id e cliente_id são obrigatórios');
    }
    
    const aba = getAba('VENDAS');
    const dados = aba.getDataRange().getValues();
    
    let linhaExistente = -1;
    for (let i = 1; i < dados.length; i++) {
      if (dados[i][0] === venda.id) {
        linhaExistente = i + 1;
        break;
      }
    }
    
    const agora = new Date().toISOString();
    const novaLinha = [
      venda.id,
      venda.cliente_id,
      parseFloat(venda.valor) || 0,
      venda.descricao || '',
      parseInt(venda.quantidade) || 1,
      venda.data || agora.split('T')[0],
      venda.mes_referencia || '',
      venda.pago === true || venda.pago === 'true',
      agora
    ];
    
    if (linhaExistente > 0) {
      aba.getRange(linhaExistente, 1, 1, 9).setValues([novaLinha]);
    } else {
      aba.appendRow(novaLinha);
    }
    
    Logger.log('Venda salva: ' + venda.descricao);
    return respostaSucesso({ id: venda.id, acao: linhaExistente > 0 ? 'atualizado' : 'criado' });
  } catch (err) {
    Logger.log('Erro ao salvar venda: ' + err.message);
    return respostaErro('Erro ao salvar venda: ' + err.message);
  }
}

// ─── SYNC EM LOTE ─────────────────────────────────────────────────────────────

function syncLote(dados) {
  try {
    let clientesSalvos = 0;
    let vendasSalvas = 0;
    const erros = [];
    
    // Sync clientes
    if (dados.clientes && Array.isArray(dados.clientes)) {
      for (const cliente of dados.clientes) {
        try {
          salvarClienteEndpoint(cliente);
          clientesSalvos++;
        } catch (e) {
          erros.push('Cliente ' + cliente.id + ': ' + e.message);
        }
      }
    }
    
    // Sync vendas
    if (dados.vendas && Array.isArray(dados.vendas)) {
      for (const venda of dados.vendas) {
        try {
          salvarVendaEndpoint(venda);
          vendasSalvas++;
        } catch (e) {
          erros.push('Venda ' + venda.id + ': ' + e.message);
        }
      }
    }
    
    // Atualiza data no resumo
    try {
      const abaResumo = getAba('RESUMO');
      abaResumo.getRange('B3').setValue(new Date().toLocaleString('pt-BR'));
    } catch (e) {
      Logger.log('Aviso: não foi possível atualizar o resumo');
    }
    
    Logger.log(`Sync concluído: ${clientesSalvos} clientes, ${vendasSalvas} vendas`);
    
    return respostaSucesso({
      clientes_salvos: clientesSalvos,
      vendas_salvas: vendasSalvas,
      erros: erros,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    Logger.log('Erro no sync em lote: ' + err.message);
    return respostaErro('Erro no sync em lote: ' + err.message);
  }
}

// ─── FUNÇÕES UTILITÁRIAS (para execução manual) ───────────────────────────────

/**
 * testarAPI — Testa a configuração básica
 */
function testarAPI() {
  const ss = getSpreadsheet();
  Logger.log('Planilha: ' + ss.getName());
  Logger.log('ID: ' + ss.getId());
  Logger.log('URL: ' + ss.getUrl());
  Logger.log('Abas: ' + ss.getSheets().map(s => s.getName()).join(', '));
  
  // Testa salvar um cliente de teste
  const clienteTeste = {
    id: 'teste-001',
    nome: 'Cliente Teste',
    telefone: '38900000000',
    observacoes: 'Criado pelo teste',
    data_criacao: new Date().toISOString()
  };
  
  const resultado = salvarClienteEndpoint(clienteTeste);
  Logger.log('Resultado do teste: ' + JSON.stringify(resultado));
  
  return 'Teste concluído! Verifique os logs.';
}

/**
 * getUrlDeployment — Retorna instruções para obter a URL
 */
function getUrlDeployment() {
  const info = {
    instrucao: 'Para obter a URL:',
    passos: [
      '1. Clique em "Implantar" no menu superior',
      '2. Selecione "Nova implantação"',
      '3. Tipo: App da Web',
      '4. Executar como: Eu (sua conta do Google)',
      '5. Quem pode acessar: Qualquer pessoa',
      '6. Clique em "Implantar"',
      '7. Copie a URL da Web App',
      '8. Cole nas Configurações do app DaniDoces'
    ]
  };
  
  Logger.log(JSON.stringify(info, null, 2));
  return info;
}
