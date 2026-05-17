import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.11.0/firebase-app.js';
import {
  getFirestore, collection, addDoc,
  query, orderBy, onSnapshot
} from 'https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js';

import { FIREBASE_CONFIG } from './config.js';

const fbApp = initializeApp(FIREBASE_CONFIG);
const db    = getFirestore(fbApp);

const S = {
  tab:         'despesas',   // 'despesas' | 'receitas' | 'empresas' | 'gerencial'
  gerView:     'pessoal',    // 'pessoal' | 'empresas'
  year:        new Date().getFullYear(),
  month:       null,
  data:        { despesas: {}, receitas: {}, empresas: {} },
  charts:      {},
  subs:        {}
};

const MONTHS   = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
                  'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const MONTHS_S = ['JAN','FEV','MAR','ABR','MAI','JUN',
                  'JUL','AGO','SET','OUT','NOV','DEZ'];
const NOW_M = new Date().getMonth() + 1;
const NOW_Y = new Date().getFullYear();

// ── UTILS ─────────────────────────────────────────────────────────────
const mkey = (y, m) => `${y}-${m}`;

const R$ = v => 'R$\u00a0' + Number(v || 0).toLocaleString('pt-BR', {
  minimumFractionDigits: 2, maximumFractionDigits: 2
});

const fmtTs = ts => {
  if (!ts) return '';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString('pt-BR') + ' ' +
         d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
};

const esc = s => (s || '').toString()
  .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
  .replace(/"/g,'&quot;').replace(/'/g,'&#x27;');

function toast(msg, err = false) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast show' + (err ? ' err' : '');
  clearTimeout(t._t);
  t._t = setTimeout(() => { t.className = 'toast'; }, 3200);
}

// ── FIRESTORE ─────────────────────────────────────────────────────────
// Collections: 'despesas' | 'receitas' | 'empresas'
function subMonth(type, month) {
  const key = `${type}_${S.year}_${month}`;
  if (S.subs[key]) return;
  const q = query(
    collection(db, type, mkey(S.year, month), 'entries'),
    orderBy('timestamp', 'desc')
  );
  S.subs[key] = onSnapshot(q, snap => {
    S.data[type][mkey(S.year, month)] = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    scheduleUpdate();
  }, e => console.error(e));
}

async function addEntry(type, payload) {
  try {
    await addDoc(
      collection(db, type, mkey(S.year, S.month), 'entries'),
      { ...payload, timestamp: new Date() }
    );
    toast('✓ Lançamento adicionado!');
  } catch (e) {
    toast('Erro: ' + e.message, true);
  }
}

// ── DEBOUNCE ──────────────────────────────────────────────────────────
let _ut = null;
function scheduleUpdate() {
  clearTimeout(_ut);
  _ut = setTimeout(updateContent, 40);
}

// ── RENDER ────────────────────────────────────────────────────────────
function renderApp() {
  killCharts();
  document.getElementById('app').innerHTML = `
    <header class="header">
      <a class="logo-img-wrap" href="#"><img class="logo-img" src="https://res.cloudinary.com/doo0fzoef/image/upload/v1779056931/icon_ghjanc.png" alt="M&M.finanças"></a>
      <span class="badge">${S.year}</span>
    </header>

    <main class="main" id="mc"></main>

    <nav class="bottom-nav">
      <button class="nav-btn${S.tab==='despesas'?' active':''}" data-tab="despesas" onclick="FC.setTab('despesas')">
        <span class="nav-icon">💸</span>Despesas
      </button>
      <button class="nav-btn${S.tab==='receitas'?' active':''}" data-tab="receitas" onclick="FC.setTab('receitas')">
        <span class="nav-icon">💰</span>Receitas
      </button>
      <button class="nav-btn${S.tab==='empresas'?' active':''}" data-tab="empresas" onclick="FC.setTab('empresas')">
        <span class="nav-icon">🏢</span>Empresas
      </button>
      <button class="nav-btn${S.tab==='gerencial'?' active':''}" data-tab="gerencial" onclick="FC.setTab('gerencial')">
        <span class="nav-icon">📊</span>Gerencial
      </button>
    </nav>
  `;
  updateContent();
}

function updateContent() {
  killCharts();
  const mc = document.getElementById('mc');
  if (!mc) return;

  document.querySelectorAll('.nav-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.tab === S.tab)
  );

  if      (S.tab === 'despesas') mc.innerHTML = S.month ? despesasMesHTML()  : monthSelectorHTML('despesas');
  else if (S.tab === 'receitas') mc.innerHTML = S.month ? receitasMesHTML()  : monthSelectorHTML('receitas');
  else if (S.tab === 'empresas') mc.innerHTML = S.month ? empresasMesHTML()  : monthSelectorHTML('empresas');
  else                           mc.innerHTML = gerencialHTML();

  afterRender();
}

// ── MONTH SELECTOR ────────────────────────────────────────────────────
function monthSelectorHTML(type) {
  const labels = {
    despesas: ['Despesas Pessoais',   'Selecione o mês para gerenciar suas despesas'],
    receitas: ['Receitas',             'Selecione o mês para gerenciar suas receitas'],
    empresas: ['Despesas Empresas',    'Selecione o mês para gerenciar os gastos das empresas'],
  };
  const [title, desc] = labels[type];

  const btns = MONTHS_S.map((m, i) => {
    const mn      = i + 1;
    const entries = (S.data[type] || {})[mkey(S.year, mn)] || [];
    const isCurr  = mn === NOW_M && S.year === NOW_Y;
    return `<button class="m-btn${isCurr?' current':''} ${entries.length?'has-data':''}"
                    onclick="FC.selectMonth(${mn})">${m}</button>`;
  }).join('');

  return `
    <div class="ph">
      <div>
        <div class="ph-title">${title}</div>
        <div class="ph-desc">${desc}</div>
      </div>
    </div>
    <div class="months-grid">${btns}</div>`;
}

// ── DESPESAS PESSOAIS ─────────────────────────────────────────────────
function despesasMesHTML() {
  subMonth('despesas', S.month);
  const entries = S.data.despesas[mkey(S.year, S.month)] || [];
  const mn      = MONTHS[S.month - 1];
  const mayE = entries.filter(e => e.responsavel === 'MAYARA');
  const manE = entries.filter(e => e.responsavel === 'MANUELA');
  const totM = mayE.reduce((s,e)=>s+ +e.valor,0);
  const totN = manE.reduce((s,e)=>s+ +e.valor,0);
  const tot  = totM + totN;
  const pM   = tot>0 ? Math.round(totM/tot*100) : 0;
  const pN   = tot>0 ? Math.round(totN/tot*100) : 0;

  const listHTML = entries.length === 0
    ? emptyState('📋','Nenhuma despesa cadastrada.','Adicione suas despesas →')
    : entries.map(e => entryRow(e, 'despesas')).join('');

  return `
    ${pageHeader(mn)}
    <div class="row row-c">
      <div class="card c-purple">
        <div class="card-person">
          <img class="card-avatar" src="https://res.cloudinary.com/doo0fzoef/image/upload/v1779055490/MayPerfil_eqlext.png" alt="Mayara">
          <div>
            <div class="card-lbl" style="margin-bottom:4px">Mayara</div>
            <div class="card-val cv-purple">${R$(totM)}</div>
            <div class="card-sub">${mayE.length} lançamento(s)</div>
          </div>
        </div>
      </div>
      <div class="card c-cyan">
        <div class="card-person">
          <img class="card-avatar" src="https://res.cloudinary.com/doo0fzoef/image/upload/v1779055490/Perfil_vqfakf.png" alt="Manuela">
          <div>
            <div class="card-lbl" style="margin-bottom:4px">Manuela</div>
            <div class="card-val cv-cyan">${R$(totN)}</div>
            <div class="card-sub">${manE.length} lançamento(s)</div>
          </div>
        </div>
      </div>
      ${donutCard(pM, pN, '--purple', '--cyan', 'Mayara', 'Manuela')}
    </div>
    <div class="card c-red" style="margin-bottom:18px">
      <div class="card-lbl">📊 Total Despesas — ${mn}</div>
      <div class="card-val cv-red">${R$(tot)}</div>
    </div>
    <div class="cgrid">
      <div class="panel">
        <div class="panel-h">📋 Despesas — ${mn}</div>
        ${listHTML}
      </div>
      ${formPanel('despesas')}
    </div>`;
}

// ── RECEITAS ──────────────────────────────────────────────────────────
function receitasMesHTML() {
  subMonth('receitas', S.month);
  const entries = S.data.receitas[mkey(S.year, S.month)] || [];
  const mn      = MONTHS[S.month - 1];
  const recE = entries.filter(e => e.responsavel === 'RECANTO DA OZILIA');
  const driE = entries.filter(e => e.responsavel === 'DRINKS');
  const totR = recE.reduce((s,e)=>s+ +e.valor,0);
  const totD = driE.reduce((s,e)=>s+ +e.valor,0);
  const tot  = totR + totD;
  const pR   = tot>0 ? Math.round(totR/tot*100) : 0;
  const pD   = tot>0 ? Math.round(totD/tot*100) : 0;

  const listHTML = entries.length === 0
    ? emptyState('💰','Nenhuma receita cadastrada.','Adicione suas receitas →')
    : entries.map(e => entryRow(e, 'receitas')).join('');

  return `
    ${pageHeader(mn)}
    <div class="row row-c">
      <div class="card c-green">
        <div class="card-person">
          <img class="card-avatar card-logo" src="https://res.cloudinary.com/doo0fzoef/image/upload/v1779056450/Recantologo_1_od1qwa.png" alt="Recanto da Ozilia">
          <div>
            <div class="card-lbl" style="margin-bottom:4px">Recanto da Ozilia</div>
            <div class="card-val cv-green">${R$(totR)}</div>
            <div class="card-sub">${recE.length} lançamento(s)</div>
          </div>
        </div>
      </div>
      <div class="card c-yellow">
        <div class="card-person">
          <img class="card-avatar card-logo" src="https://res.cloudinary.com/doo0fzoef/image/upload/v1779056419/Drinkslogo_1_qsuxkz.png" alt="Drinks">
          <div>
            <div class="card-lbl" style="margin-bottom:4px">Drinks</div>
            <div class="card-val cv-yellow">${R$(totD)}</div>
            <div class="card-sub">${driE.length} lançamento(s)</div>
          </div>
        </div>
      </div>
      ${donutCard(pR, pD, '--green', '--yellow', 'Recanto', 'Drinks')}
    </div>
    <div class="card c-green" style="margin-bottom:18px">
      <div class="card-lbl">📊 Total Receitas — ${mn}</div>
      <div class="card-val cv-green">${R$(tot)}</div>
    </div>
    <div class="cgrid">
      <div class="panel">
        <div class="panel-h">💰 Receitas — ${mn}</div>
        ${listHTML}
      </div>
      ${formPanel('receitas')}
    </div>`;
}

// ── DESPESAS EMPRESAS ─────────────────────────────────────────────────
function empresasMesHTML() {
  subMonth('empresas', S.month);
  const entries = S.data.empresas[mkey(S.year, S.month)] || [];
  const mn      = MONTHS[S.month - 1];
  const recE = entries.filter(e => e.responsavel === 'RECANTO DA OZILIA');
  const driE = entries.filter(e => e.responsavel === 'OZILIA DRINKS');
  const totR = recE.reduce((s,e)=>s+ +e.valor,0);
  const totD = driE.reduce((s,e)=>s+ +e.valor,0);
  const tot  = totR + totD;
  const pR   = tot>0 ? Math.round(totR/tot*100) : 0;
  const pD   = tot>0 ? Math.round(totD/tot*100) : 0;

  const listHTML = entries.length === 0
    ? emptyState('🏢','Nenhum gasto de empresa cadastrado.','Adicione os gastos →')
    : entries.map(e => entryRow(e, 'empresas')).join('');

  return `
    ${pageHeader(mn, 'Empresas')}
    <div class="row row-c">
      <div class="card c-yellow">
        <div class="card-person">
          <img class="card-avatar card-logo" src="https://res.cloudinary.com/doo0fzoef/image/upload/v1779056450/Recantologo_1_od1qwa.png" alt="Recanto da Ozilia">
          <div>
            <div class="card-lbl" style="margin-bottom:4px">Recanto da Ozilia</div>
            <div class="card-val cv-yellow">${R$(totR)}</div>
            <div class="card-sub">${recE.length} lançamento(s)</div>
          </div>
        </div>
      </div>
      <div class="card c-pink">
        <div class="card-person">
          <img class="card-avatar card-logo" src="https://res.cloudinary.com/doo0fzoef/image/upload/v1779056419/Drinkslogo_1_qsuxkz.png" alt="Ozilia Drinks">
          <div>
            <div class="card-lbl" style="margin-bottom:4px">Ozilia Drinks</div>
            <div class="card-val cv-pink">${R$(totD)}</div>
            <div class="card-sub">${driE.length} lançamento(s)</div>
          </div>
        </div>
      </div>
      ${donutCard(pR, pD, '--yellow', '--pink', 'Recanto', 'Ozilia Drinks')}
    </div>
    <div class="card c-yellow" style="margin-bottom:18px">
      <div class="card-lbl">📊 Total Gastos Empresas — ${mn}</div>
      <div class="card-val cv-yellow">${R$(tot)}</div>
    </div>
    <div class="cgrid">
      <div class="panel">
        <div class="panel-h">🏢 Gastos Empresas — ${mn}</div>
        ${listHTML}
      </div>
      ${formPanel('empresas')}
    </div>`;
}

// ── GERENCIAL ─────────────────────────────────────────────────────────
function gerencialHTML() {
  // Subscribe to all months for both views
  for (let m = 1; m <= 12; m++) {
    subMonth('despesas', m);
    subMonth('receitas', m);
    subMonth('empresas', m);
  }

  const selector = `
    <div class="ph">
      <div>
        <div class="ph-title">Gerencial</div>
        <div class="ph-desc">Selecione qual visão deseja acompanhar</div>
      </div>
    </div>
    <div class="ger-selector">
      <button class="ger-opt${S.gerView==='pessoal'?' active':''}" onclick="FC.setGerView('pessoal')">
        <span class="ger-icon">👤</span>
        <span class="ger-label">Pessoal</span>
        <span class="ger-desc">Despesas &amp; Receitas pessoais</span>
      </button>
      <button class="ger-opt${S.gerView==='empresas'?' active':''}" onclick="FC.setGerView('empresas')">
        <span class="ger-icon">🏢</span>
        <span class="ger-label">Empresas</span>
        <span class="ger-desc">Gastos do Recanto &amp; Ozilia Drinks</span>
      </button>
    </div>
  `;

  return S.gerView === 'pessoal'
    ? selector + gerencialPessoalHTML()
    : selector + gerencialEmpresasHTML();
}

function gerencialPessoalHTML() {
  let totRec = 0, totDesp = 0;
  const months = MONTHS.map((name, i) => {
    const key   = mkey(S.year, i + 1);
    const recs  = (S.data.receitas[key]||[]).reduce((s,e)=>s+ +e.valor,0);
    const desps = (S.data.despesas[key]||[]).reduce((s,e)=>s+ +e.valor,0);
    totRec += recs; totDesp += desps;
    return { name, recs, desps, saldo: recs - desps };
  });
  const saldo = totRec - totDesp;

  const rows = months.map(m => {
    const empty = m.recs===0 && m.desps===0;
    return `<tr>
      <td>${m.name}</td>
      <td class="${m.recs>0?'tg':'tm'}">${m.recs>0?'+'+R$(m.recs):'—'}</td>
      <td class="${m.desps>0?'tr':'tm'}">${m.desps>0?'-'+R$(m.desps):'—'}</td>
      <td class="${empty?'tm':m.saldo>=0?'tg':'tr'}">${empty?'—':(m.saldo>=0?'+':'')+R$(m.saldo)}</td>
    </tr>`;
  }).join('');

  return `
    <div class="row row-3" style="margin-bottom:18px">
      <div class="card c-green"><div class="card-lbl">↑ Total Receitas</div><div class="card-val cv-green">${R$(totRec)}</div></div>
      <div class="card c-red"><div class="card-lbl">↓ Total Despesas</div><div class="card-val cv-red">${R$(totDesp)}</div></div>
      <div class="card ${saldo>=0?'c-green':'c-red'}"><div class="card-lbl">⊖ Saldo Anual</div><div class="card-val ${saldo>=0?'cv-green':'cv-red'}">${saldo<0?'-':''}${R$(Math.abs(saldo))}</div></div>
    </div>
    <div class="cpanel">
      <div class="cpanel-h">📊 Receitas VS Despesas — Mês a Mês</div>
      <canvas id="bar-c" height="75"></canvas>
    </div>
    <div class="cpanel">
      <div class="cpanel-h">📋 Resumo Mensal — Pessoal</div>
      <table class="m-table">
        <thead><tr><th>Mês</th><th>Receitas</th><th>Despesas</th><th>Saldo</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

function gerencialEmpresasHTML() {
  let totRec = 0, totDri = 0;
  const months = MONTHS.map((name, i) => {
    const key  = mkey(S.year, i + 1);
    const ents = S.data.empresas[key] || [];
    const rec  = ents.filter(e=>e.responsavel==='RECANTO DA OZILIA').reduce((s,e)=>s+ +e.valor,0);
    const dri  = ents.filter(e=>e.responsavel==='OZILIA DRINKS').reduce((s,e)=>s+ +e.valor,0);
    totRec += rec; totDri += dri;
    return { name, rec, dri, tot: rec + dri };
  });
  const totGeral = totRec + totDri;

  const rows = months.map(m => {
    const empty = m.tot === 0;
    return `<tr>
      <td>${m.name}</td>
      <td class="${m.rec>0?'tg':'tm'}">${m.rec>0?R$(m.rec):'—'}</td>
      <td class="${m.dri>0?'cv-pink':'tm'}" style="${m.dri>0?'color:var(--pink)':''}">${m.dri>0?R$(m.dri):'—'}</td>
      <td class="${empty?'tm':'tr'}">${empty?'—':R$(m.tot)}</td>
    </tr>`;
  }).join('');

  return `
    <div class="row row-3" style="margin-bottom:18px">
      <div class="card c-yellow"><div class="card-lbl">🏠 Recanto da Ozilia</div><div class="card-val cv-yellow">${R$(totRec)}</div></div>
      <div class="card c-pink"><div class="card-lbl">🍹 Ozilia Drinks</div><div class="card-val cv-pink">${R$(totDri)}</div></div>
      <div class="card c-red"><div class="card-lbl">↓ Total Gastos Empresas</div><div class="card-val cv-red">${R$(totGeral)}</div></div>
    </div>
    <div class="cpanel">
      <div class="cpanel-h">📊 Gastos por Empresa — Mês a Mês</div>
      <canvas id="bar-c" height="75"></canvas>
    </div>
    <div class="cpanel">
      <div class="cpanel-h">📋 Resumo Mensal — Empresas</div>
      <table class="m-table">
        <thead><tr><th>Mês</th><th>Recanto</th><th>Ozilia Drinks</th><th>Total</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

// ── SHARED HELPERS ────────────────────────────────────────────────────
function pageHeader(mn, ctx = '') {
  return `
    <div class="ph">
      <button class="back-btn" onclick="FC.goBack()">← Voltar</button>
      <h1 class="ph-title">${mn}</h1>
      <div class="ph-flex"></div>
      <span class="badge">${S.year}</span>
    </div>`;
}

function emptyState(ico, line1, line2) {
  return `<div class="empty"><div class="empty-ico">${ico}</div><div class="empty-txt">${line1}<br>${line2}</div></div>`;
}

const AVATARS = {
  'MAYARA':           'https://res.cloudinary.com/doo0fzoef/image/upload/v1779055490/MayPerfil_eqlext.png',
  'MANUELA':          'https://res.cloudinary.com/doo0fzoef/image/upload/v1779055490/Perfil_vqfakf.png',
  'RECANTO DA OZILIA':'https://res.cloudinary.com/doo0fzoef/image/upload/v1779056450/Recantologo_1_od1qwa.png',
  'OZILIA DRINKS':    'https://res.cloudinary.com/doo0fzoef/image/upload/v1779056419/Drinkslogo_1_qsuxkz.png',
  'DRINKS':           'https://res.cloudinary.com/doo0fzoef/image/upload/v1779056419/Drinkslogo_1_qsuxkz.png',
};

function entryRow(e, type) {
  const badgeClass = {
    'MAYARA':           'eb-mayara',
    'MANUELA':          'eb-manuela',
    'RECANTO DA OZILIA':'eb-recanto',
    'DRINKS':           'eb-drinks',
    'OZILIA DRINKS':    'eb-ozilia-drinks',
  }[e.responsavel] || 'eb-mayara';

  const valClass = (type === 'receitas') ? 'ev-r' : 'ev-e';
  const prefix   = (type === 'receitas') ? '+' : '-';
  const avatar   = AVATARS[e.responsavel];

  return `
    <div class="entry">
      ${avatar
        ? `<img class="e-avatar" src="${avatar}" alt="${esc(e.responsavel)}">`
        : `<span class="e-badge ${badgeClass}">${esc(e.responsavel)}</span>`
      }
      <div class="e-info">
        <div class="e-desc">${esc(e.descricao)}</div>
        <div class="e-date">${fmtTs(e.timestamp)}</div>
      </div>
      <span class="e-val ${valClass}">${prefix}${R$(e.valor)}</span>
    </div>`;
}

function donutCard(p1, p2, c1, c2, l1, l2) {
  return `
    <div class="donut-card">
      <div class="donut-wrap"><canvas id="donut-c"></canvas></div>
      <div class="donut-legend">
        <div class="l-row"><div class="l-dot" style="background:var(${c1})"></div><span class="l-name">${l1}</span><span class="l-pct">${p1}%</span></div>
        <div class="l-row"><div class="l-dot" style="background:var(${c2})"></div><span class="l-name">${l2}</span><span class="l-pct">${p2}%</span></div>
      </div>
    </div>`;
}

function formPanel(type) {
  const configs = {
    despesas: {
      title: '➕ Nova Despesa',
      idPfx: 'd',
      label: 'Responsável',
      opts:  ['MAYARA','MANUELA'],
      ph:    'Ex: Mercado, Farmácia, Roupa...',
      btn:   'FC.addDespesa()',
      btnTxt:'+ Adicionar Despesa'
    },
    receitas: {
      title: '➕ Nova Receita',
      idPfx: 'r',
      label: 'Responsável',
      opts:  ['RECANTO DA OZILIA','DRINKS'],
      ph:    'Ex: Venda, Serviço, Aluguel...',
      btn:   'FC.addReceita()',
      btnTxt:'+ Adicionar Receita'
    },
    empresas: {
      title: '➕ Novo Gasto Empresa',
      idPfx: 'e',
      label: 'Empresa',
      opts:  ['RECANTO DA OZILIA','OZILIA DRINKS'],
      ph:    'Ex: Fornecedor, Aluguel, Conta...',
      btn:   'FC.addEmpresa()',
      btnTxt:'+ Adicionar Gasto'
    },
  };
  const c = configs[type];
  const opts = c.opts.map(o => `<option value="${o}">${o}</option>`).join('');

  return `
    <div class="panel">
      <div class="panel-h">${c.title}</div>
      <div class="form-bd">
        <div class="fg">
          <label class="fl">${c.label}</label>
          <select class="fc" id="${c.idPfx}-resp">
            <option value="">— Selecione —</option>
            ${opts}
          </select>
        </div>
        <div class="fg">
          <label class="fl">Descrição</label>
          <input class="fc" id="${c.idPfx}-desc" type="text" placeholder="${c.ph}">
        </div>
        <div class="fg">
          <label class="fl">Valor (R$)</label>
          <input class="fc" id="${c.idPfx}-val" type="number" min="0" step="0.01" placeholder="0,00">
        </div>
        <button class="btn-add" onclick="${c.btn}">${c.btnTxt}</button>
      </div>
    </div>`;
}

// ── CHARTS ────────────────────────────────────────────────────────────
function afterRender() {
  const donut = document.getElementById('donut-c');
  if (donut) {
    let data, colors, labels;
    if (S.tab === 'despesas') {
      const e=S.data.despesas[mkey(S.year,S.month)]||[];
      data=[e.filter(x=>x.responsavel==='MAYARA').reduce((s,x)=>s+ +x.valor,0),e.filter(x=>x.responsavel==='MANUELA').reduce((s,x)=>s+ +x.valor,0)];
      colors=['#c77dff','#48cae4']; labels=['Mayara','Manuela'];
    } else if (S.tab === 'receitas') {
      const e=S.data.receitas[mkey(S.year,S.month)]||[];
      data=[e.filter(x=>x.responsavel==='RECANTO DA OZILIA').reduce((s,x)=>s+ +x.valor,0),e.filter(x=>x.responsavel==='DRINKS').reduce((s,x)=>s+ +x.valor,0)];
      colors=['#00e676','#ffa502']; labels=['Recanto','Drinks'];
    } else {
      const e=S.data.empresas[mkey(S.year,S.month)]||[];
      data=[e.filter(x=>x.responsavel==='RECANTO DA OZILIA').reduce((s,x)=>s+ +x.valor,0),e.filter(x=>x.responsavel==='OZILIA DRINKS').reduce((s,x)=>s+ +x.valor,0)];
      colors=['#ffa502','#ff2d78']; labels=['Recanto','Ozilia Drinks'];
    }
    S.charts.donut = new Chart(donut,{
      type:'doughnut',
      data:{labels,datasets:[{data,backgroundColor:colors,borderColor:'#141424',borderWidth:4}]},
      options:{responsive:false,animation:{duration:600},plugins:{legend:{display:false},tooltip:{callbacks:{label:ctx=>' '+R$(ctx.raw)}}},cutout:'68%'}
    });
  }

  const bar = document.getElementById('bar-c');
  if (bar) {
    let datasets, barLabels = MONTHS_S;
    if (S.gerView === 'pessoal') {
      datasets = [
        {label:'Receita', data:MONTHS.map((_,i)=>(S.data.receitas[mkey(S.year,i+1)]||[]).reduce((s,e)=>s+ +e.valor,0)), backgroundColor:'rgba(0,230,118,0.72)', borderColor:'#00e676', borderWidth:1, borderRadius:6, borderSkipped:false},
        {label:'Despesa', data:MONTHS.map((_,i)=>(S.data.despesas[mkey(S.year,i+1)]||[]).reduce((s,e)=>s+ +e.valor,0)), backgroundColor:'rgba(255,71,87,0.72)',  borderColor:'#ff4757', borderWidth:1, borderRadius:6, borderSkipped:false}
      ];
    } else {
      datasets = [
        {label:'Recanto',      data:MONTHS.map((_,i)=>(S.data.empresas[mkey(S.year,i+1)]||[]).filter(e=>e.responsavel==='RECANTO DA OZILIA').reduce((s,e)=>s+ +e.valor,0)), backgroundColor:'rgba(255,165,2,0.72)',  borderColor:'#ffa502', borderWidth:1, borderRadius:6, borderSkipped:false},
        {label:'Ozilia Drinks',data:MONTHS.map((_,i)=>(S.data.empresas[mkey(S.year,i+1)]||[]).filter(e=>e.responsavel==='OZILIA DRINKS').reduce((s,e)=>s+ +e.valor,0)),      backgroundColor:'rgba(255,45,120,0.72)', borderColor:'#ff2d78', borderWidth:1, borderRadius:6, borderSkipped:false}
      ];
    }
    S.charts.bar = new Chart(bar,{
      type:'bar',
      data:{labels:barLabels, datasets},
      options:{
        responsive:true, animation:{duration:700},
        plugins:{legend:{labels:{color:'rgba(240,240,255,0.45)',font:{size:12}}}, tooltip:{callbacks:{label:ctx=>` ${ctx.dataset.label}: ${R$(ctx.raw)}`}}},
        scales:{
          x:{ticks:{color:'rgba(240,240,255,0.32)',font:{size:11}},grid:{color:'rgba(255,255,255,0.04)'}},
          y:{ticks:{color:'rgba(240,240,255,0.32)',callback:v=>v>=1000?'R$'+(v/1000).toFixed(1)+'k':'R$'+v},grid:{color:'rgba(255,255,255,0.04)'}}
        }
      }
    });
  }
}

function killCharts() {
  if (S.charts.donut){S.charts.donut.destroy();S.charts.donut=null;}
  if (S.charts.bar)  {S.charts.bar.destroy();  S.charts.bar=null;}
}

// ── CONTROLLER ────────────────────────────────────────────────────────
window.FC = {
  setTab: tab => { S.tab=tab; S.month=null; updateContent(); },
  selectMonth: m => { S.month=m; updateContent(); },
  goBack: () => { S.month=null; updateContent(); },
  setGerView: v => { S.gerView=v; updateContent(); },

  addDespesa: async () => {
    const resp=document.getElementById('d-resp')?.value;
    const desc=document.getElementById('d-desc')?.value?.trim();
    const val=parseFloat(document.getElementById('d-val')?.value||'0');
    if(!resp){toast('Selecione o responsável!',true);return;}
    if(!desc){toast('Informe a descrição!',true);return;}
    if(!(val>0)){toast('Valor inválido!',true);return;}
    await addEntry('despesas',{responsavel:resp,descricao:desc,valor:val});
  },

  addReceita: async () => {
    const resp=document.getElementById('r-resp')?.value;
    const desc=document.getElementById('r-desc')?.value?.trim();
    const val=parseFloat(document.getElementById('r-val')?.value||'0');
    if(!resp){toast('Selecione o responsável!',true);return;}
    if(!desc){toast('Informe a descrição!',true);return;}
    if(!(val>0)){toast('Valor inválido!',true);return;}
    await addEntry('receitas',{responsavel:resp,descricao:desc,valor:val});
  },

  addEmpresa: async () => {
    const resp=document.getElementById('e-resp')?.value;
    const desc=document.getElementById('e-desc')?.value?.trim();
    const val=parseFloat(document.getElementById('e-val')?.value||'0');
    if(!resp){toast('Selecione a empresa!',true);return;}
    if(!desc){toast('Informe a descrição!',true);return;}
    if(!(val>0)){toast('Valor inválido!',true);return;}
    await addEntry('empresas',{responsavel:resp,descricao:desc,valor:val});
  }
};

// ── INIT ──────────────────────────────────────────────────────────────
renderApp();
subMonth('despesas', NOW_M);
subMonth('receitas', NOW_M);
subMonth('empresas', NOW_M);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(()=>{}));
}
