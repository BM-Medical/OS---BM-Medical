import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { 
    getFirestore, collection, query, where, getDocs, doc, setDoc, getDoc 
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { 
    getAuth, onAuthStateChanged, signInWithCustomToken, signInAnonymously 
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";

// Importação do módulo de PDF
import { gerarRelatorioExercitoCompleto, gerarPlanilhaPecasExercito } from './pdf-generator-relatexercito.js';

// CONFIGURAÇÃO FIREBASE - Restaurada a apiKey original conforme solicitado
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

// --- FUNÇÕES GLOBAIS PARA O EDITOR ---

/**
 * Máscara de Moeda reativa
 */
window.handleCurrencyInput = (el, index) => {
    let value = el.value.replace(/\D/g, "");
    if (!value) value = "0";
    
    // Converte para float (ex: 125 -> 1.25)
    const floatValue = parseFloat(value) / 100;
    
    // Atualiza estado
    state.itensPeças[index].valorUnit = floatValue;
    
    // Formata visualmente no campo
    el.value = formatMoeda(floatValue);
    
    // Atualiza cálculos de linha e totais sem re-renderizar a tabela (para não perder o foco)
    const rowTotalEl = el.closest('tr').querySelector('.item-total-cell');
    if (rowTotalEl) {
        const item = state.itensPeças[index];
        rowTotalEl.innerText = formatMoeda(item.qtd * item.valorUnit);
    }
    
    const totalGeral = state.itensPeças.reduce((acc, i) => acc + (i.qtd * i.valorUnit), 0);
    const display = document.getElementById('total-pecas-display');
    if (display) display.innerText = formatMoeda(totalGeral);
    
    atualizarTabelasRelatorio();
};

window.updateItemField = (index, field, value) => {
    if (!state.itensPeças[index]) return;
    
    if (field === 'qtd') {
        state.itensPeças[index][field] = parseInt(value) || 0;
        // Atualiza o total da linha e geral se for quantidade
        renderizarEditorPeças(); // Re-renderiza para atualizar totais de linha e formatação
    } else {
        state.itensPeças[index][field] = value;
    }
    calcularTotaisERelatorio();
};

window.clearIfZero = (el) => {
    // Se o valor numérico for 0, limpa o campo ao focar
    const numericValue = parseFloat(el.value.replace(/\D/g, "")) / 100;
    if (numericValue === 0) {
        el.value = "R$ ";
    }
};

window.removeItem = (index) => {
    state.itensPeças.splice(index, 1);
    renderizarEditorPeças();
    atualizarTabelasRelatorio();
};

// --- INTERFACE ---

const autoResize = (el) => {
    if (!el) return;
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

// --- AUTENTICAÇÃO E INICIALIZAÇÃO ---

document.addEventListener('DOMContentLoaded', async () => {
    setupEventListeners();
    await initAuth();
});

async function initAuth() {
    const signIn = async (retryCount = 0) => {
        try {
            if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
                await signInWithCustomToken(auth, __initial_auth_token);
            } else {
                await signInAnonymously(auth);
            }
        } catch (err) {
            if (retryCount < 5) {
                const delay = Math.pow(2, retryCount) * 1000;
                setTimeout(() => signIn(retryCount + 1), delay);
            } else {
                console.error("Falha crítica na autenticação.");
            }
        }
    };

    onAuthStateChanged(auth, (user) => {
        state.user = user;
        if (user) {
            console.log("Usuário Autenticado:", user.uid);
            const val = document.getElementById('month-selector').value;
            if (val) carregarDados();
        }
    });

    await signIn();
}

function setupEventListeners() {
    document.getElementById('btn-update')?.addEventListener('click', carregarDados);
    document.getElementById('btn-add-item')?.addEventListener('click', adicionarItemManual);
    document.getElementById('btn-save-data')?.addEventListener('click', salvarFechamento);
    document.getElementById('btn-sel-all')?.addEventListener('click', () => toggleAllCheckboxes(true));
    document.getElementById('btn-sel-none')?.addEventListener('click', () => toggleAllCheckboxes(false));
    document.getElementById('btn-print-parts')?.addEventListener('click', handlePrintPlanilha);
    document.getElementById('btn-print-full')?.addEventListener('click', handlePrintRelatorio);
    document.getElementById('btn-reload-os')?.addEventListener('click', importarPecasDasOSs);
    
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

// --- DADOS ---

async function carregarDados() {
    if (!state.user || state.isSyncing) return;
    const val = document.getElementById('month-selector').value;
    if (!val) return;
    
    [state.anoRef, state.mesRef] = val.split('-');
    state.isSyncing = true;

    const btn = document.getElementById('btn-update');
    const originalText = btn?.innerHTML;
    if(btn) btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sincronizando...';

    try {
        await Promise.all([
            carregarHistoricoTotal(),
            carregarOSsDoMes()
        ]);
        
        await carregarFechamentoSalvo();
        
        renderizarEditorPeças();
        atualizarTabelasRelatorio();
        renderizarListaOSs(state.ossCarregadas);
        renderizarSidebar();
        updateUIPeriodo();

    } catch (e) { 
        console.error("Erro ao sincronizar:", e);
    } finally { 
        state.isSyncing = false; 
        if(btn) btn.innerHTML = originalText;
    }
}

async function carregarHistoricoTotal() {
    const q = collection(db, 'artifacts', appId, 'public', 'data', 'fechamentos_exercito');
    const snap = await getDocs(q);
    state.historicoFechamentos = snap.docs.map(d => d.data());
}

async function carregarOSsDoMes() {
    const q = query(collection(db, "orders"), where("contrato", "==", "Contrato Nº 10/2025"));
    const snap = await getDocs(q);
    
    const mesFormatado = `${state.anoRef}-${state.mesRef}`;
    
    state.ossCarregadas = snap.docs.map(d => ({id: d.id, ...d.data()}))
        .filter(os => {
            if (!os.data_conclusao || os.status !== 'finalizada') return false;
            return os.data_conclusao.startsWith(mesFormatado);
        })
        .sort((a,b) => {
            const numA = parseInt(a.os_numero?.replace(/\D/g, '')) || 0;
            const numB = parseInt(b.os_numero?.replace(/\D/g, '')) || 0;
            return numA - numB;
        });
}

async function carregarFechamentoSalvo() {
    const path = doc(db, 'artifacts', appId, 'public', 'data', 'fechamentos_exercito', `${state.anoRef}-${state.mesRef}`);
    const snap = await getDoc(path);
    
    if (snap.exists()) {
        state.itensPeças = snap.data().itens || [];
    } else {
        await importarPecasDasOSs();
    }
}

async function importarPecasDasOSs() {
    const pecasMap = new Map();
    state.ossCarregadas.forEach(os => {
        os.pecas_utilizadas?.forEach(p => {
            const desc = p.descricao?.toUpperCase().trim() || "SEM DESCRIÇÃO";
            if (pecasMap.has(desc)) {
                pecasMap.get(desc).qtd += (parseFloat(p.qtd) || 0);
            } else {
                pecasMap.set(desc, {
                    id: crypto.randomUUID(), 
                    descricao: desc, 
                    qtd: Math.floor(parseFloat(p.qtd) || 0), 
                    valorUnit: 0
                });
            }
        });
    });
    state.itensPeças = Array.from(pecasMap.values());
    renderizarEditorPeças();
}

function renderizarEditorPeças() {
    const tbody = document.getElementById('tbody-editor-items');
    if (!tbody) return;

    tbody.innerHTML = '';
    
    if (state.itensPeças.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="py-12 text-center text-gray-400 italic">Nenhum item encontrado para este período.</td></tr>';
    } else {
        state.itensPeças.forEach((item, index) => {
            const totalItem = (item.qtd || 0) * (item.valorUnit || 0);
            const tr = document.createElement('tr');
            tr.className = "border-b border-gray-50 hover:bg-gray-50 transition";
            tr.innerHTML = `
                <td class="py-3">
                    <input type="text" value="${item.descricao}" 
                        class="w-full bg-transparent border-none focus:ring-1 focus:ring-blue-500 rounded p-1 text-sm uppercase"
                        oninput="window.updateItemField(${index}, 'descricao', this.value)">
                </td>
                <td class="py-3 text-center">
                    <input type="number" value="${Math.floor(item.qtd)}" step="1" min="0"
                        class="w-16 text-center bg-gray-50 border border-gray-200 rounded p-1 text-sm"
                        oninput="window.updateItemField(${index}, 'qtd', this.value)">
                </td>
                <td class="py-3 text-center">
                    <input type="text" value="${formatMoeda(item.valorUnit)}"
                        class="w-36 text-center bg-gray-50 border border-gray-200 rounded p-1 text-sm font-mono"
                        onfocus="window.clearIfZero(this)"
                        oninput="window.handleCurrencyInput(this, ${index})">
                </td>
                <td class="py-3 text-center font-bold text-gray-700 font-mono item-total-cell">
                    ${formatMoeda(totalItem)}
                </td>
                <td class="py-3 text-right">
                    <button onclick="window.removeItem(${index})" class="text-red-400 hover:text-red-600 p-2">
                        <i class="fas fa-trash-alt"></i>
                    </button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    }

    calcularTotaisERelatorio();
}

function calcularTotaisERelatorio() {
    const totalGeral = state.itensPeças.reduce((acc, i) => acc + (i.qtd * i.valorUnit), 0);
    const display = document.getElementById('total-pecas-display');
    if (display) display.innerText = formatMoeda(totalGeral);
    atualizarTabelasRelatorio();
}

function atualizarTabelasRelatorio() {
    const totalMesPecas = state.itensPeças.reduce((acc, i) => acc + (i.qtd * i.valorUnit), 0);
    
    const tbodyP = document.getElementById('tbody-pecas-mes');
    if (tbodyP) {
        if (state.itensPeças.length === 0) {
            tbodyP.innerHTML = '<tr><td colspan="4" class="p-4 text-center text-gray-400 italic">Nenhum item registrado.</td></tr>';
        } else {
            tbodyP.innerHTML = state.itensPeças.map(i => `
                <tr>
                    <td class="border border-gray-900 p-2 text-left uppercase text-[10px]">${i.descricao}</td>
                    <td class="border border-gray-900 p-2 text-center">${i.qtd}</td>
                    <td class="border border-gray-900 p-2 text-center">${formatMoeda(i.valorUnit)}</td>
                    <td class="border border-gray-900 p-2 text-center font-bold">${formatMoeda(i.qtd * i.valorUnit)}</td>
                </tr>
            `).join('');
            tbodyP.innerHTML += `<tr class="bg-total-custom font-bold text-sm"><td colspan="3" class="border border-gray-900 p-2 text-right uppercase">Total de Peças no Mês</td><td class="border border-gray-900 p-2 text-center">${formatMoeda(totalMesPecas)}</td></tr>`;
        }
    }

    const tbodyC = document.getElementById('tbody-controle-gastos');
    if (tbodyC && state.mesRef) {
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

            tbodyC.innerHTML += `
                <tr>
                    <td class="border border-gray-900 p-2 text-center">${meses[m-1]} de ${a}</td>
                    <td class="border border-gray-900 p-2 text-center">${formatMoeda(gasto)}</td>
                    <td class="border border-gray-900 p-2 text-center font-bold">${formatMoeda(saldoProg)}</td>
                </tr>
            `;
        }
        const saldoRestante = state.limiteAnual - gastoAcumuladoTotal;
        tbodyC.innerHTML += `<tr class="bg-total-custom font-bold text-sm"><td colspan="2" class="border border-gray-900 p-2 text-right uppercase">Valor Contratual Disponível (Anual)</td><td class="border border-gray-900 p-2 text-center">${formatMoeda(saldoRestante)}</td></tr>`;
        
        document.getElementById('acumulado-anterior-display').innerText = formatMoeda(gastoAcumuladoTotal - totalMesPecas);
        document.getElementById('saldo-final-display').innerText = formatMoeda(saldoRestante);
    }

    const tbodyF = document.getElementById('tbody-faturamento');
    if (tbodyF) {
        tbodyF.innerHTML = `
            <tr>
                <td class="border border-gray-900 p-2 text-center">1</td>
                <td class="border border-gray-900 p-2 text-left text-[10px]">Manutenção preventiva e corretiva de equipamentos odontológicos...</td>
                <td class="border border-gray-900 p-2 text-center">${formatMoeda(state.valorServicoMensal)}</td>
            </tr>
            <tr>
                <td class="border border-gray-900 p-2 text-center">2</td>
                <td class="border border-gray-900 p-2 text-left text-[10px]">Fornecimento de peças conforme discriminado no item 3...</td>
                <td class="border border-gray-900 p-2 text-center">${formatMoeda(totalMesPecas)}</td>
            </tr>
            <tr class="bg-total-custom font-bold text-sm">
                <td colspan="2" class="border border-gray-900 p-2 text-right uppercase">Total do Faturamento</td>
                <td class="border border-gray-900 p-2 text-center">${formatMoeda(state.valorServicoMensal + totalMesPecas)}</td>
            </tr>
        `;
    }
}

function renderizarListaOSs(lista) {
    const container = document.getElementById('os-pages-container');
    if (!container) return;
    container.innerHTML = lista.map(os => `<div class="a4-page relative mb-8 print:mb-0 print:shadow-none print:m-0 flex flex-col" style="page-break-before: always;" id="page-os-${os.id}">${renderOSHTML(os)}</div>`).join('');
}

function renderOSHTML(os) {
    const assSetor = os.assinaturaDispensada ? '<div class="text-[10px] font-bold text-gray-500 italic">(Assinatura Dispensada)</div>' : '<div class="h-16"></div>';
    return `
    <div class="font-sans text-gray-900 h-full flex flex-col p-8 bg-white relative">
        <div class="flex justify-between items-start mb-4">
            <div class="w-1/2"><img src="./images/logo.png" class="h-24 object-contain"></div>
            <div class="w-1/2 text-right text-[10px]">
                <p class="font-bold text-sm">BM MEDICAL Engenharia Clínica</p>
                <p>CNPJ: 48.673.158/0001-59</p>
                <p>central.bmmedical@outlook.com</p>
            </div>
        </div>
        <div class="text-center mb-6">
            <h2 class="text-xl font-bold">OS ${os.os_numero || 'S/N'}</h2>
            <p class="text-sm font-bold uppercase">${os.tipo_manutencao === 'preventiva' ? 'Preventiva' : 'Corretiva'}</p>
        </div>
        <div class="space-y-4 flex-grow text-[10px]">
            <div class="border border-gray-300 rounded-lg p-2">
                <h3 class="text-blue-600 font-bold border-b border-blue-100 mb-1 uppercase">Dados do Cliente</h3>
                <p><b>Contrato:</b> ${os.contrato}<br><b>Cliente:</b> Exército Brasileiro<br><b>Unidade:</b> 9° BI Mtz</p>
            </div>
            <div class="border border-gray-300 rounded-lg p-2">
                <h3 class="text-blue-600 font-bold border-b border-blue-100 mb-1 uppercase">Equipamento</h3>
                <div class="grid grid-cols-2">
                    <div><b>Equipamento:</b> ${os.equipamento}</div>
                    <div><b>Marca/Modelo:</b> ${os.marca} / ${os.modelo}</div>
                    <div><b>Série:</b> ${os.serial}</div>
                </div>
            </div>
            <div class="border border-gray-300 rounded-lg p-2">
                <h3 class="text-blue-600 font-bold border-b border-blue-100 mb-1 uppercase">Serviços Realizados</h3>
                <p class="text-justify leading-tight">${os.servicos_realizados}</p>
            </div>
        </div>
        <div class="mt-auto grid grid-cols-2 gap-12 pt-4">
            <div class="text-center relative">
                <div class="flex justify-center items-end h-16 pb-1">${assSetor}</div>
                <div class="border-t border-gray-400 w-3/4 mx-auto pt-1 font-bold text-[9px] uppercase">Responsável do Setor</div>
            </div>
            <div class="text-center relative">
                <div class="flex justify-center items-end h-16 pb-1">
                    <img src="./images/assinatura-tecnico.png" class="h-16 object-contain" onerror="this.style.display='none'">
                </div>
                <div class="border-t border-gray-400 w-3/4 mx-auto pt-1 font-bold text-[9px] uppercase">Responsável Técnico</div>
            </div>
        </div>
    </div>`;
}

function renderizarSidebar() {
    const list = document.getElementById('sidebar-list');
    if (!list) return;
    list.innerHTML = state.ossCarregadas.map(os => `
        <div class="flex items-start p-2 border-b hover:bg-gray-100 transition cursor-pointer">
            <input type="checkbox" id="chk-${os.id}" checked class="mt-1 mr-2 cursor-pointer">
            <label for="chk-${os.id}" class="text-[10px] flex-grow cursor-pointer">
                <b>${os.os_numero}</b><br>${os.equipamento}
            </label>
        </div>
    `).join('');
    const count = document.getElementById('count-selected');
    if (count) count.innerText = `${state.ossCarregadas.length}/${state.ossCarregadas.length}`;
    document.getElementById('os-selection-sidebar')?.classList.remove('hidden');
}

function handlePrintPlanilha() {
    if (!state.mesRef) return;
    const dados = { mesRef: state.mesRef, anoRef: state.anoRef, itens: state.itensPeças };
    gerarPlanilhaPecasExercito(dados, document.getElementById('btn-print-parts'));
}

function handlePrintRelatorio() {
    if (!state.mesRef) return;
    const dados = { 
        mesRef: state.mesRef, 
        anoRef: state.anoRef,
        periodoTexto: document.getElementById('periodo-texto').innerText,
        textoObjeto: document.getElementById('txt-objeto').value,
        textoAtividades: document.getElementById('txt-atividades').value,
        itens: state.itensPeças,
        ossImprimir: state.ossCarregadas.filter(os => document.getElementById(`chk-${os.id}`)?.checked),
        historicoControle: calcularHistoricoControle()
    };
    gerarRelatorioExercitoCompleto(dados, document.getElementById('btn-print-full'));
}

function calcularHistoricoControle() {
    const totalMesPecas = state.itensPeças.reduce((acc, i) => acc + (i.qtd * i.valorUnit), 0);
    const dataInicio = new Date(2025, 5, 1);
    const dataAlvo = new Date(state.anoRef, state.mesRef - 1, 1);
    const historico = [];
    let saldoProg = 0;

    for (let c = new Date(dataInicio); c <= dataAlvo; c.setMonth(c.getMonth() + 1)) {
        const m = c.getMonth() + 1;
        const a = c.getFullYear();
        const f = state.historicoFechamentos.find(x => x.mes_ref == m && x.ano_ref == a);
        const gasto = (m == state.mesRef && a == state.anoRef) ? totalMesPecas : (f?.valor_total || 0);
        saldoProg = (saldoProg + state.valorReferenciaPecasMensal) - gasto;
        historico.push({
            mesAno: `${m}/${a}`,
            gasto: gasto,
            sobrando: saldoProg
        });
    }
    return historico;
}

const formatMoeda = (v) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const updateUIPeriodo = () => {
    const last = new Date(state.anoRef, state.mesRef, 0).getDate();
    const el = document.getElementById('periodo-texto');
    if (el) el.innerText = `01/${state.mesRef}/${state.anoRef} - ${last}/${state.mesRef}/${state.anoRef}`;
};

function toggleAllCheckboxes(checked) { 
    document.querySelectorAll('#sidebar-list input').forEach(c => { c.checked = checked; }); 
}

function adicionarItemManual() { 
    state.itensPeças.push({id: crypto.randomUUID(), descricao: 'NOVO ITEM', qtd: 1, valorUnit: 0}); 
    renderizarEditorPeças(); 
    atualizarTabelasRelatorio();
}

async function salvarFechamento() {
    if (!state.user || !state.mesRef) return;
    
    const btn = document.getElementById('btn-save-data');
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...';

    try {
        const total = state.itensPeças.reduce((acc, i) => acc + (i.qtd * i.valorUnit), 0);
        const docData = {
            mes_ref: parseInt(state.mesRef),
            ano_ref: parseInt(state.anoRef),
            itens: state.itensPeças,
            valor_total: total,
            data_fechamento: new Date().toISOString()
        };

        const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'fechamentos_exercito', `${state.anoRef}-${state.mesRef}`);
        await setDoc(docRef, docData);
        
        await carregarHistoricoTotal();
        atualizarTabelasRelatorio();
        
        btn.innerHTML = '<i class="fas fa-check"></i> Salvo!';
        setTimeout(() => { btn.innerHTML = originalText; btn.disabled = false; }, 2000);
    } catch (e) {
        console.error("Erro ao salvar:", e);
        btn.innerHTML = '<i class="fas fa-times"></i> Erro';
        btn.disabled = false;
    }
}