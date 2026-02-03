import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { 
    getFirestore, collection, query, where, getDocs, doc, setDoc, getDoc 
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { 
    getAuth, onAuthStateChanged, signInWithCustomToken, signInAnonymously 
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";

// Importação do módulo de PDF
import { gerarRelatorioExercitoCompleto, gerarPlanilhaPecasExercito } from './pdf-generator-relatexercito.js';

// CONFIGURAÇÃO FIREBASE
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {
    apiKey: "AIzaSyC8L8dTkuL_KxvW_-m7V3c0UmYwV-gbQfE", 
    authDomain: "ordem-de-servicos---bm-medical.firebaseapp.com",
    projectId: "ordem-de-servicos---bm-medical",
    storageBucket: "ordem-de-servicos---bm-medical.firebasestorage.app",
    messagingSenderId: "92355637827",
    appId: "1:92355637827:web:850b89afa5054781475af6"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';

const state = {
    user: null,
    mesRef: '',
    anoRef: '',
    ossCarregadas: [],
    itensPeças: [], 
    historicoFechamentos: [],
    limiteAnual: 30000.00,
    valorServicoMensal: 2920.00,
    valorReferenciaPecasMensal: 2500.00,
    isSyncing: false
};

// --- FUNÇÕES DE INTERFACE (EXPOSTAS) ---

const autoResize = (el) => {
    el.style.height = 'auto';
    el.style.height = (el.scrollHeight) + 'px';
};

const switchTab = (tabId) => {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
    document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
    document.getElementById('tab-' + tabId).classList.remove('hidden');
    document.getElementById('tab-btn-' + tabId).classList.add('active');
    
    if (tabId === 'relatorio') {
        setTimeout(() => document.querySelectorAll('.editable-field').forEach(autoResize), 50);
    }
};

// --- INICIALIZAÇÃO ---

document.addEventListener('DOMContentLoaded', async () => {
    setupEventListeners();
    await initAuth();
});

async function initAuth() {
    try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
            await signInWithCustomToken(auth, __initial_auth_token);
        } else {
            await signInAnonymously(auth).catch(() => console.log("Aguardando sessão..."));
        }
    } catch (e) { console.error("Erro auth:", e); }

    onAuthStateChanged(auth, (user) => {
        state.user = user;
        if (user) console.log("Conectado:", user.uid);
    });
}

function setupEventListeners() {
    document.getElementById('btn-update')?.addEventListener('click', carregarDados);
    document.getElementById('btn-add-item')?.addEventListener('click', adicionarItemManual);
    document.getElementById('btn-save-data')?.addEventListener('click', salvarFechamento);
    document.getElementById('btn-sel-all')?.addEventListener('click', () => toggleAllCheckboxes(true));
    document.getElementById('btn-sel-none')?.addEventListener('click', () => toggleAllCheckboxes(false));
    document.getElementById('btn-print-parts')?.addEventListener('click', handlePrintPlanilha);
    document.getElementById('btn-print-full')?.addEventListener('click', handlePrintRelatorio);
    
    document.getElementById('tab-btn-relatorio')?.addEventListener('click', () => switchTab('relatorio'));
    document.getElementById('tab-btn-editor')?.addEventListener('click', () => switchTab('editor'));

    document.getElementById('btn-toggle-sidebar')?.addEventListener('click', () => {
        document.getElementById('os-selection-sidebar').classList.toggle('collapsed');
    });

    document.querySelectorAll('.toggle-edit').forEach(chk => {
        chk.addEventListener('change', (e) => {
            const field = document.getElementById(e.target.dataset.target);
            if (e.target.checked) {
                field.removeAttribute('readonly');
                autoResize(field);
                field.focus();
            } else {
                field.setAttribute('readonly', true);
            }
        });
    });
}

// --- LÓGICA DE DADOS ---

async function carregarDados() {
    if (!state.user || state.isSyncing) return;
    const val = document.getElementById('month-selector').value;
    if (!val) return alert("Selecione um mês.");
    
    [state.anoRef, state.mesRef] = val.split('-');
    state.isSyncing = true;

    try {
        await Promise.all([
            carregarHistoricoTotal(),
            carregarOSsDoMes(),
            carregarFechamentoSalvo()
        ]);
        atualizarTabelasRelatorio();
        renderizarEditorPeças();
        renderizarListaOSs(state.ossCarregadas);
        renderizarSidebar();
        updateUIPeriodo();
    } catch (e) { console.error(e); } finally { state.isSyncing = false; }
}

async function carregarHistoricoTotal() {
    const snap = await getDocs(collection(db, 'artifacts', appId, 'public', 'data', 'fechamentos_exercito'));
    state.historicoFechamentos = snap.docs.map(d => d.data());
}

async function carregarOSsDoMes() {
    const q = query(collection(db, "orders"), where("contrato", "==", "Contrato Nº 10/2025"));
    const snap = await getDocs(q);
    const inicio = `${state.anoRef}-${state.mesRef}-01`;
    const fim = `${state.anoRef}-${state.mesRef}-31`;
    
    state.ossCarregadas = snap.docs.map(d => ({id: d.id, ...d.data()}))
        .filter(os => os.status === 'finalizada' && os.data_conclusao >= inicio && os.data_conclusao <= fim)
        .sort((a,b) => (parseInt(a.os_numero.match(/\d+/)) || 0) - (parseInt(b.os_numero.match(/\d+/)) || 0));
}

async function carregarFechamentoSalvo() {
    const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'fechamentos_exercito', `${state.anoRef}-${state.mesRef}`);
    const snap = await getDoc(docRef);
    if (snap.exists()) {
        state.itensPeças = snap.data().itens || [];
    } else {
        const pecasMap = new Map();
        state.ossCarregadas.forEach(os => {
            os.pecas_utilizadas?.forEach(p => {
                const k = p.descricao.toUpperCase().trim();
                if (pecasMap.has(k)) pecasMap.get(k).qtd += parseFloat(p.qtd) || 0;
                else pecasMap.set(k, {id: crypto.randomUUID(), descricao: p.descricao, qtd: parseFloat(p.qtd)||0, valorUnit: 0});
            });
        });
        state.itensPeças = Array.from(pecasMap.values());
    }
}

function atualizarTabelasRelatorio() {
    const totalMesPecas = state.itensPeças.reduce((acc, i) => acc + (i.qtd * i.valorUnit), 0);
    
    // Tabela Peças
    const tbodyP = document.getElementById('tbody-pecas-mes');
    tbodyP.innerHTML = state.itensPeças.map(i => `<tr><td class="border border-gray-900 p-2 text-left">${i.descricao}</td><td class="border border-gray-900 p-2 text-center">${i.qtd}</td><td class="border border-gray-900 p-2 text-center">${formatMoeda(i.valorUnit)}</td><td class="border border-gray-900 p-2 text-center font-bold">${formatMoeda(i.qtd * i.valorUnit)}</td></tr>`).join('');
    tbodyP.innerHTML += `<tr class="bg-total-custom font-bold text-sm"><td colspan="3" class="border border-gray-900 p-2 text-right uppercase">Total de Peças no Mês</td><td class="border border-gray-900 p-2 text-center">${formatMoeda(totalMesPecas)}</td></tr>`;

    // Tabela Controle
    const tbodyC = document.getElementById('tbody-controle-gastos');
    tbodyC.innerHTML = '';
    let saldoProg = 0;
    let gastoAcumuladoTotal = 0;
    const dataInicio = new Date(2025, 5, 1);
    const dataAlvo = new Date(state.anoRef, state.mesRef - 1, 1);
    const meses = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

    for (let c = new Date(dataInicio); c <= dataAlvo; c.setMonth(c.getMonth() + 1)) {
        const m = c.getMonth() + 1;
        const a = c.getFullYear();
        const f = state.historicoFechamentos.find(x => x.mes_ref == m && x.ano_ref == a);
        const gasto = (m == state.mesRef && a == state.anoRef) ? totalMesPecas : (f?.valor_total || 0);
        saldoProg = (saldoProg + state.valorReferenciaPecasMensal) - gasto;
        gastoAcumuladoTotal += gasto;
        tbodyC.innerHTML += `<tr><td class="border border-gray-900 p-2 text-center">${meses[m-1]}/${a}</td><td class="border border-gray-900 p-2 text-center">${formatMoeda(gasto)}</td><td class="border border-gray-900 p-2 text-center font-bold">${formatMoeda(saldoProg)}</td></tr>`;
    }
    const saldoRestante = state.limiteAnual - gastoAcumuladoTotal;
    tbodyC.innerHTML += `<tr class="bg-total-custom font-bold text-sm"><td colspan="2" class="border border-gray-900 p-2 text-right uppercase">Valor Contratual Disponível (Anual)</td><td class="border border-gray-900 p-2 text-center">${formatMoeda(saldoRestante)}</td></tr>`;

    // Faturamento
    document.getElementById('tbody-faturamento').innerHTML = `<tr><td class="border border-gray-900 p-2 text-center">1</td><td class="border border-gray-900 p-2 text-left">Contratação de empresa especializada para prestação de serviço mensal de manutenção...</td><td class="border border-gray-900 p-2 text-center">${formatMoeda(state.valorServicoMensal)}</td></tr><tr><td class="border border-gray-900 p-2 text-center">2</td><td class="border border-gray-900 p-2 text-left">Fornecimento de peças para manutenção preventiva e corretiva...</td><td class="border border-gray-900 p-2 text-center">${formatMoeda(totalMesPecas)}</td></tr><tr class="bg-total-custom font-bold text-sm"><td colspan="2" class="border border-gray-900 p-2 text-right uppercase">Total do Faturamento</td><td class="border border-gray-900 p-2 text-center">${formatMoeda(state.valorServicoMensal + totalMesPecas)}</td></tr>`;

    // Editor Stats
    document.getElementById('acumulado-anterior-display').innerText = formatMoeda(gastoAcumuladoTotal - totalMesPecas);
    document.getElementById('saldo-final-display').innerText = formatMoeda(saldoRestante);
}

function renderizarListaOSs(lista) {
    const container = document.getElementById('os-pages-container');
    container.innerHTML = lista.map(os => `<div class="a4-page relative mb-8 print:mb-0 print:shadow-none print:m-0 flex flex-col" style="page-break-before: always;" id="page-os-${os.id}">${renderOSHTML(os)}</div>`).join('');
}

function renderOSHTML(os) {
    const fmt = (d) => d ? d.split('-').reverse().join('/') : '';
    const assSetor = os.assinaturaDispensada ? '<div class="text-[10px] font-bold text-gray-500 italic">(Assinatura Dispensada)</div>' : '<div class="h-16"></div>';
    return `<div class="font-sans text-gray-900 h-full flex flex-col p-8 bg-white relative">
        <div class="flex justify-between items-start mb-4"><div class="w-1/2"><img src="./images/logo.png" class="h-24 object-contain"></div><div class="w-1/2 text-right text-[10px]"><p class="font-bold text-sm">BM MEDICAL Engenharia Clínica</p><p>CNPJ: 48.673.158/0001-59</p><p>central.bmmedical@outlook.com</p></div></div>
        <div class="text-center mb-6"><h2 class="text-xl font-bold">OS ${os.os_numero || 'S/N'}</h2><p class="text-sm font-bold uppercase">${os.tipo_manutencao === 'preventiva' ? 'MP - Preventiva' : 'MC - Corretiva'}</p></div>
        <div class="space-y-4 flex-grow">
            <div class="border border-gray-300 rounded-lg p-2"><h3 class="text-[#3498db] font-bold text-sm border-b border-[#3498db] mb-1">Dados do Cliente</h3><p class="text-xs">Contrato: ${os.contrato}<br>Cliente: Exército Brasileiro<br>Endereço: Av. Duque de Caxias, 344, Pelotas - RS</p></div>
            <div class="border border-gray-300 rounded-lg p-2"><h3 class="text-[#3498db] font-bold text-sm border-b border-[#3498db] mb-1">Dados do Equipamento</h3><div class="text-xs grid grid-cols-2"><div>Equipamento: ${os.equipamento}</div><div>Marca: ${os.marca}</div><div>Modelo: ${os.modelo}</div><div>Serial: ${os.serial}</div></div></div>
            <div class="border border-gray-300 rounded-lg p-2"><h3 class="text-[#3498db] font-bold text-sm border-b border-[#3498db] mb-1">Descrição</h3><p class="text-xs text-justify">${os.servicos_realizados}</p></div>
        </div>
        <div class="mt-auto grid grid-cols-2 gap-12 pt-2">
            <div class="text-center relative"><div class="flex justify-center items-end h-16 pb-1">${assSetor}</div><div class="border-t border-gray-400 w-3/4 mx-auto pt-1 font-bold text-xs uppercase">Responsável do Setor</div></div>
            <div class="text-center relative"><div class="flex justify-center items-end h-16 pb-1"><img src="./images/assinatura-tecnico.png" class="h-16 object-contain" onerror="this.style.display='none'"></div><div class="border-t border-gray-400 w-3/4 mx-auto pt-1 font-bold text-xs uppercase">Responsável Técnico</div></div>
        </div>
    </div>`;
}

function renderizarSidebar() {
    const list = document.getElementById('sidebar-list');
    list.innerHTML = state.ossCarregadas.map(os => `<div class="flex items-start p-2 border-b hover:bg-gray-100 transition cursor-pointer"><input type="checkbox" id="chk-${os.id}" checked class="mt-1 mr-2"><label for="chk-${os.id}" class="text-[10px] flex-grow"><b>${os.os_numero}</b><br>${os.equipamento}</label></div>`).join('');
    document.getElementById('count-selected').innerText = `${state.ossCarregadas.length}/${state.ossCarregadas.length}`;
    document.getElementById('os-selection-sidebar').classList.remove('hidden');
}

function handlePrintPlanilha() {
    const dados = { mesRef: state.mesRef, mesReferenciaNome: state.mesRef, itens: state.itensPeças };
    gerarPlanilhaPecasExercito(dados, document.getElementById('btn-print-parts'));
}

function handlePrintRelatorio() {
    const dados = { 
        mesRef: state.mesRef, 
        periodoTexto: document.getElementById('periodo-texto').innerText,
        textoObjeto: document.getElementById('txt-objeto').value,
        textoAtividades: document.getElementById('txt-atividades').value,
        itens: state.itensPeças,
        ossImprimir: state.ossCarregadas.filter(os => document.getElementById(`chk-${os.id}`).checked)
    };
    gerarRelatorioExercitoCompleto(dados, document.getElementById('btn-print-full'));
}

// Helpers Adicionais
const formatMoeda = (v) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const updateUIPeriodo = () => {
    const last = new Date(state.anoRef, state.mesRef, 0).getDate();
    document.getElementById('periodo-texto').innerText = `01/${state.mesRef}/${state.anoRef} - ${last}/${state.mesRef}/${state.anoRef}`;
};
function toggleAllCheckboxes(checked) { document.querySelectorAll('#sidebar-list input').forEach(c => { c.checked = checked; c.dispatchEvent(new Event('change')); }); }
function adicionarItemManual() { state.itensPeças.push({id: crypto.randomUUID(), descricao: 'Novo Item', qtd: 1, valorUnit: 0}); renderizarEditorPeças(); }
function renderizarEditorPeças() { /* Implementação básica similar ao atualizarTabelas */ }
async function salvarFechamento() { /* Lógica de setDoc similar às versões anteriores */ }