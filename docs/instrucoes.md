# 📘 Instruções de Deploy — DaniDoces PWA

## Índice
1. [Visão Geral](#1-visão-geral)
2. [Deploy do Frontend (Vercel)](#2-deploy-do-frontend-vercel)
3. [Configurar o Backend (Google Apps Script)](#3-configurar-o-backend-google-apps-script)
4. [Conectar o App ao GAS](#4-conectar-o-app-ao-gas)
5. [Instalar o PWA no Celular](#5-instalar-o-pwa-no-celular)
6. [Configurar PIN de Acesso](#6-configurar-pin-de-acesso)
7. [Solução de Problemas](#7-solução-de-problemas)

---

## 1. Visão Geral

```
┌─────────────────────────────────────────────────────┐
│                    DaniDoces PWA                     │
│                                                      │
│  Celular Android (Chrome)                            │
│  └── PWA hospedado na Vercel ──── GitHub             │
│       └── IndexedDB (dados locais, offline-first)   │
│            └── Sync com Google Apps Script           │
│                 └── Google Sheets (backup em nuvem) │
└─────────────────────────────────────────────────────┘
```

---

## 2. Deploy do Frontend (Vercel)

### Passo 1: Criar conta no GitHub
1. Acesse [github.com](https://github.com) e crie uma conta (gratuito)
2. Crie um novo repositório chamado `danidoces`
   - Marque como **Público** ou **Privado** (qualquer um funciona)

### Passo 2: Fazer upload dos arquivos
**Opção A — Via interface web do GitHub (mais fácil):**
1. Acesse o repositório criado
2. Clique em "uploading an existing file"
3. Arraste todos os arquivos e pastas do projeto
4. Clique em "Commit changes"

**Opção B — Via Git (linha de comando):**
```bash
cd danidoces
git init
git add .
git commit -m "Versão inicial DaniDoces"
git remote add origin https://github.com/SEU_USUARIO/danidoces.git
git push -u origin main
```

### Passo 3: Conectar Vercel ao GitHub
1. Acesse [vercel.com](https://vercel.com) e faça login com o GitHub
2. Clique em "New Project"
3. Importe o repositório `danidoces`
4. Configurações:
   - **Framework Preset:** Other
   - **Root Directory:** `app` ← IMPORTANTE!
   - **Build Command:** (deixar vazio)
   - **Output Directory:** (deixar vazio)
5. Clique em "Deploy"

> ✅ Pronto! A Vercel vai gerar uma URL tipo `danidoces.vercel.app`

### Passo 4: Configurar domínio personalizado (opcional)
1. Na Vercel, vá em Settings → Domains
2. Adicione um domínio de sua preferência

---

## 3. Configurar o Backend (Google Apps Script)

### Passo 1: Criar o projeto GAS
1. Acesse [script.google.com](https://script.google.com)
2. Clique em "Novo Projeto"
3. Renomeie para "DaniDoces API"

### Passo 2: Colar o código
1. Apague todo o código padrão
2. Cole o conteúdo completo do arquivo `gas/Code.gs`
3. Salve com Ctrl+S

### Passo 3: Configurar a planilha automaticamente
1. No menu, clique em **Executar** → selecione a função `setupSheet`
2. Na primeira vez, o Google vai pedir autorização:
   - Clique em "Revisar permissões"
   - Escolha sua conta Google
   - Clique em "Avançado" → "Ir para DaniDoces API (não seguro)"
   - Clique em "Permitir"
3. Aguarde a execução (aparece "Execução concluída" no rodapé)
4. Vá em **Ver** → **Logs** para ver a URL da planilha criada

> ✅ A planilha será criada automaticamente no seu Google Drive!

### Passo 4: Implantar como Web App
1. Clique em **Implantar** → **Nova implantação**
2. Clique no ícone de engrenagem → **App da Web**
3. Configure:
   - **Executar como:** Eu (sua conta)
   - **Quem pode acessar:** Qualquer pessoa
4. Clique em **Implantar**
5. **COPIE a URL gerada** — você vai precisar dela no próximo passo!

A URL será parecida com:
```
https://script.google.com/macros/s/AKfycby.../exec
```

---

## 4. Conectar o App ao GAS

1. Abra o app DaniDoces no celular (pela URL da Vercel)
2. Toque no botão ⚙️ (configurações)
3. Na seção "Sincronização", cole a URL do GAS
4. Toque em "Salvar URL"
5. Toque em "Sincronizar Agora" para testar

---

## 5. Instalar o PWA no Celular

### Android (Chrome):
1. Abra o app no Chrome pelo celular
2. Aguarde o banner aparecer **OU**
3. Toque no menu ⋮ → "Adicionar à tela inicial"
4. Confirme e pronto! O ícone aparece na tela inicial

### iPhone (Safari):
1. Abra o app no Safari
2. Toque no botão de compartilhar 📤
3. Toque em "Adicionar à tela de início"
4. Confirme

---

## 6. Configurar PIN de Acesso

1. Abra o app → ⚙️ Configurações
2. Na seção "Segurança", digitie um PIN de 4 a 6 dígitos
3. Toque em "Salvar PIN"

> ⚠️ Guarde o PIN! Se esquecer, precisará limpar os dados do app.

---

## 7. Solução de Problemas

### App não abre offline
- Certifique-se de ter aberto o app pelo menos uma vez com internet
- O Service Worker baixa todos os arquivos na primeira visita

### Dados não sincronizam
1. Verifique a URL do GAS nas configurações
2. Verifique se está conectado à internet
3. Abra a URL do GAS diretamente no navegador — deve aparecer `{"ok":true,"status":"DaniDoces API"...}`
4. Se aparecer erro 403: reimplante o GAS com "Qualquer pessoa" no campo de acesso

### "Erro ao abrir IndexedDB"
- Verifique se o navegador não está em modo privado/anônimo
- IndexedDB não funciona em modo privado em alguns navegadores

### App não instala no celular (PWA)
- O app precisa estar em HTTPS (a Vercel já faz isso automaticamente)
- Use o Chrome no Android para melhor suporte

### Esqueci o PIN
1. No Chrome Android: Configurações → Site → danidoces.vercel.app → Limpar dados
2. Reabra o app (estará sem dados — **faça backup antes!**)

---

## Estrutura do Projeto

```
danidoces/
├── app/
│   ├── index.html          ← Entrada do app (PWA)
│   ├── sw.js               ← Service Worker (offline)
│   ├── manifest.json       ← Configuração PWA
│   ├── css/
│   │   └── style.css       ← Estilos (rosa doceria)
│   └── js/
│       ├── db.js           ← IndexedDB (banco local)
│       ├── ui.js           ← Interface e telas
│       └── sync.js         ← Sincronização e exportação
├── gas/
│   └── Code.gs             ← Backend Google Apps Script
├── docs/
│   └── instrucoes.md       ← Este arquivo
├── vercel.json             ← Configuração de deploy
└── .gitignore
```

---

## Atualizações futuras

Para atualizar o app:
1. Modifique os arquivos localmente
2. Faça commit e push para o GitHub
3. A Vercel faz o deploy automático em ~1 minuto
4. O app vai detectar a nova versão e pedir para atualizar

---

*DaniDoces PWA — v1.0.0*  
*Desenvolvido com ❤️ para uso pessoal*
