import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { 
    getFirestore, collection, query, where, getDocs, doc, setDoc, getDoc 
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { 
    getAuth, onAuthStateChanged, signInWithCustomToken 
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";

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
    isSyncing: false,
    hasSavedData: false
};

// --- INICIALIZAÇÃO ---
document.addEventListener('DOMContentLoaded', async () => {
    const monthInput = document.getElementById('month-selector');
    if (monthInput) monthInput.value = "";

    document.getElementById('btn-update')?.addEventListener('click', () => carregarDados());
    document.getElementById('btn-add-item')?.addEventListener('click', adicionarItemManual);
    document.getElementById('btn-save-data')?.addEventListener('click', salvarFechamento);
    document.getElementById('btn-reload-os')?.addEventListener('click', () => {
        if(confirm("Isso irá substituir a lista atual pelas peças das OSs. Continuar?")) {
            extrairPeçasDasOSs();
            renderizarEditorPeças();
            atualizarTabelasRelatorio();
        }
    });

    const initAuth = async () => {
        try {
            if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
                await signInWithCustomToken(auth, __initial_auth_token);
            }
        } catch (error) { console.error("Erro auth:", error); }
    };

    await initAuth();

    onAuthStateChanged(auth, (user) => {
        state.user = user;
        if (user) console.log("Firebase OK");
    });
});

// --- CARREGAMENTO DE DADOS ---
async function carregarDados() {
    if (!state.user || state.isSyncing) return;
    
    const mesInput = document.getElementById('month-selector')?.value;
    if (!mesInput) { alert("Selecione um mês."); return; }
    
    [state.anoRef, state.mesRef] = mesInput.split('-');
    state.isSyncing = true;

    updateUIPeriodo();
    mostrarCarregando(true);

    try {
        // Busca os fechamentos históricos e as OSs do mês em paralelo
        await Promise.all([
            carregarHistoricoAnual(),
            carregarOSsDoMes(),
            carregarFechamentoSalvo()
        ]);
        
        // Renderiza as tabelas financeiras e o editor
        atualizarTabelasRelatorio();
        renderizarEditorPeças();
        
        // Renderiza as páginas de OS no relatório (Aba 1)
        renderizarListaOSs(state.ossCarregadas);

    } catch (error) {
        console.error("Erro sincronia:", error);
    } finally {
        state.isSyncing = false;
        mostrarCarregando(false);
    }
}

async function carregarHistoricoAnual() {
    const collRef = collection(db, 'artifacts', appId, 'public', 'data', 'fechamentos_exercito');
    const snap = await getDocs(collRef);
    
    state.historicoFechamentos = snap.docs
        .map(d => d.data())
        .filter(d => d.ano_ref == state.anoRef)
        .sort((a, b) => parseInt(a.mes_ref) - parseInt(b.mes_ref));
}

async function carregarOSsDoMes() {
    const dataInicio = `${state.anoRef}-${state.mesRef}-01`;
    const ultimoDia = new Date(state.anoRef, state.mesRef, 0).getDate();
    const dataFim = `${state.anoRef}-${state.mesRef}-${String(ultimoDia).padStart(2, '0')}`;

    // Nota: Verifique se no seu banco o nome do contrato está exatamente como "Contrato Nº 10/2025"
    const q = query(collection(db, "orders"), where("contrato", "==", "Contrato Nº 10/2025"));
    const snap = await getDocs(q);
    
    const lista = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(os => os.status === 'finalizada' && os.data_conclusao >= dataInicio && os.data_conclusao <= dataFim);
    
    // Ordenação Numérica (igual ao Capão)
    const extrairNumeroOS = (os) => { const m = (os.os_numero || '').match(/(\d+)$/); return m ? parseInt(m[0], 10) : 0; };
    lista.sort((a, b) => extrairNumeroOS(a) - extrairNumeroOS(b));

    state.ossCarregadas = lista;
    renderizarSidebar();
}

async function carregarFechamentoSalvo() {
    const docId = `${state.anoRef}-${state.mesRef}`;
    const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'fechamentos_exercito', docId);
    const snap = await getDoc(docRef);

    const statusEl = document.getElementById('status-fechamento');
    if (snap.exists()) {
        state.itensPeças = snap.data().itens || [];
        state.hasSavedData = true;
        if (statusEl) {
            statusEl.innerText = "DADOS SALVOS NO BANCO";
            statusEl.className = "text-xs font-bold px-2 py-1 rounded bg-green-100 text-green-700";
        }
    } else {
        extrairPeçasDasOSs();
        state.hasSavedData = false;
        if (statusEl) {
            statusEl.innerText = "DADOS NÃO SALVOS (RASCUNHO)";
            statusEl.className = "text-xs font-bold px-2 py-1 rounded bg-amber-100 text-amber-700";
        }
    }
}

function extrairPeçasDasOSs() {
    const pecasMap = new Map();
    state.ossCarregadas.forEach(os => {
        if (os.pecas_utilizadas && Array.isArray(os.pecas_utilizadas)) {
            os.pecas_utilizadas.forEach(p => {
                const key = p.descricao.toUpperCase().trim();
                const qtd = parseFloat(p.qtd) || 0;
                if (pecasMap.has(key)) {
                    pecasMap.get(key).qtd += qtd;
                } else {
                    pecasMap.set(key, { id: crypto.randomUUID(), descricao: p.descricao, qtd: qtd, valorUnit: 0 });
                }
            });
        }
    });
    state.itensPeças = Array.from(pecasMap.values());
}

// --- RENDERIZAÇÃO ---

function renderizarEditorPeças() {
    const tbody = document.getElementById('tbody-editor-items');
    if (!tbody) return;
    tbody.innerHTML = '';

    state.itensPeças.forEach((item, index) => {
        const tr = document.createElement('tr');
        tr.className = "border-b border-gray-50 hover:bg-gray-50 transition";
        tr.innerHTML = `
            <td class="py-3"><input type="text" value="${item.descricao}" onchange="window.updateItem(${index}, 'descricao', this.value)" class="w-full bg-transparent border-b border-transparent focus:border-blue-300 outline-none"></td>
            <td class="py-3 text-center"><input type="number" value="${item.qtd}" onchange="window.updateItem(${index}, 'qtd', this.value)" class="w-16 text-center bg-gray-50 rounded"></td>
            <td class="py-3 text-right"><input type="number" step="0.01" value="${item.valorUnit}" onchange="window.updateItem(${index}, 'valorUnit', this.value)" class="w-32 text-right bg-gray-50 rounded px-2"></td>
            <td class="py-3 text-right font-bold text-gray-700">${formatMoeda(item.qtd * item.valorUnit)}</td>
            <td class="py-3 text-right"><button onclick="window.removerItem(${index})" class="text-red-300 hover:text-red-600 px-2"><i class="fas fa-times"></i></button></td>
        `;
        tbody.appendChild(tr);
    });
    calcularTotais();
}

function atualizarTabelasRelatorio() {
    const tbodyPecas = document.getElementById('tbody-pecas-mes');
    if (!tbodyPecas) return;
    tbodyPecas.innerHTML = '';
    let totalMes = 0;

    state.itensPeças.forEach(item => {
        const total = item.qtd * item.valorUnit;
        totalMes += total;
        if (total > 0 || item.qtd > 0) {
            tbodyPecas.innerHTML += `<tr><td class="border border-gray-900 p-2">${item.descricao}</td><td class="border border-gray-900 p-2 text-center">${item.qtd}</td><td class="border border-gray-900 p-2 text-right">${formatMoeda(item.valorUnit)}</td><td class="border border-gray-900 p-2 text-right font-bold">${formatMoeda(total)}</td></tr>`;
        }
    });

    if (state.itensPeças.length === 0) {
        tbodyPecas.innerHTML = '<tr><td colspan="4" class="p-4 text-center text-gray-400 italic">Nenhum item detectado.</td></tr>';
    } else {
        tbodyPecas.innerHTML += `<tr class="bg-gray-50 font-bold"><td colspan="3" class="border border-gray-900 p-2 text-right uppercase text-[9px]">Total de Peças no Mês</td><td class="border border-gray-900 p-2 text-right text-blue-800">${formatMoeda(totalMes)}</td></tr>`;
    }

    const tbodyControle = document.getElementById('tbody-controle-gastos');
    if (tbodyControle) {
        tbodyControle.innerHTML = '';
        let saldoAtual = state.limiteAnual;
        const mesesNomes = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
        const startMonth = (state.anoRef == "2025") ? 6 : 1;

        for (let m = startMonth; m <= parseInt(state.mesRef); m++) {
            const fechamento = state.historicoFechamentos.find(f => parseInt(f.mes_ref) == m);
            const gastoMes = (m == parseInt(state.mesRef)) ? totalMes : (fechamento ? fechamento.valor_total : 0);
            saldoAtual -= gastoMes;

            tbodyControle.innerHTML += `<tr><td class="border border-gray-900 p-2">${mesesNomes[m-1]}/${state.anoRef}</td><td class="border border-gray-900 p-2 text-right">${formatMoeda(gastoMes)}</td><td class="border border-gray-900 p-2 text-right font-bold">${formatMoeda(saldoAtual)}</td></tr>`;
        }

        tbodyControle.innerHTML += `<tr class="bg-blue-900 text-white font-bold"><td colspan="2" class="border border-gray-900 p-2 text-right uppercase text-[9px]">Valor Contratual Disponível (Anual)</td><td class="border border-gray-900 p-2 text-right">${formatMoeda(saldoAtual)}</td></tr>`;
        
        const accDisp = document.getElementById('acumulado-anterior-display');
        const salDisp = document.getElementById('saldo-final-display');
        if (accDisp) accDisp.innerText = formatMoeda(state.limiteAnual - (saldoAtual + totalMes));
        if (salDisp) salDisp.innerText = formatMoeda(saldoAtual);
    }

    const tbodyFat = document.getElementById('tbody-faturamento');
    if (tbodyFat) {
        tbodyFat.innerHTML = `<tr><td class="border border-gray-900 p-2 text-center">1</td><td class="border border-gray-900 p-2">Serviço Mensal Manutenção Odontoclínica - PMGuPel</td><td class="border border-gray-900 p-2 text-right">${formatMoeda(state.valorServicoMensal)}</td></tr><tr><td class="border border-gray-900 p-2 text-center">2</td><td class="border border-gray-900 p-2">Fornecimento de peças para manutenção (Total do Mês)</td><td class="border border-gray-900 p-2 text-right">${formatMoeda(totalMes)}</td></tr><tr class="font-bold bg-gray-100"><td colspan="2" class="border border-gray-900 p-2 text-right uppercase text-[9px]">Total do Faturamento</td><td class="border border-gray-900 p-2 text-right">${formatMoeda(state.valorServicoMensal + totalMes)}</td></tr>`;
    }
}

// --- RENDERIZAÇÃO DAS PÁGINAS DE OS ---

function renderizarListaOSs(listaOSs) {
    const container = document.getElementById('os-pages-container');
    if (!container) return;
    container.innerHTML = '';

    listaOSs.forEach(os => {
        const pageDiv = document.createElement('div');
        pageDiv.className = 'a4-page relative mb-8 print:mb-0 print:shadow-none print:m-0 flex flex-col';
        pageDiv.style.pageBreakBefore = 'always';
        pageDiv.id = `page-os-${os.id}`;
        
        pageDiv.innerHTML = renderOSHTML(os);
        container.appendChild(pageDiv);
    });
}

function renderOSHTML(os) {
    const fmt = (d) => { if(!d) return ''; const [y, m, da] = d.split('-'); return `${da}/${m}/${y}`; }
    const tipoManutencao = os.tipo_manutencao === 'preventiva' ? 'MP - Manutenção Preventiva' : 'MC - Manutenção Corretiva';
    
    let linhasPecas = '';
    if (os.pecas_utilizadas && os.pecas_utilizadas.length > 0) {
        os.pecas_utilizadas.forEach((peca, idx) => {
            linhasPecas += `<div class="grid grid-cols-12 text-xs py-1 border-t border-gray-300"><div class="col-span-1 text-center font-bold">${idx + 1}</div><div class="col-span-2 text-center">${peca.qtd}</div><div class="col-span-9 pl-2">${peca.descricao}</div></div>`;
        });
    } else { 
        linhasPecas = '<div class="text-xs text-gray-500 italic py-2 text-center border-t border-gray-300">Nenhuma peça utilizada.</div>'; 
    }

    const boxClass = "border border-gray-300 rounded-lg p-2 mb-3 relative bg-white";
    const titleClass = "text-[#3498db] font-bold text-sm mb-1";
    const lineClass = "border-t border-[#3498db] mb-2";

    return `
        <div class="font-sans text-gray-900 h-full flex flex-col p-8 bg-white relative">
            <div class="flex justify-between items-start mb-4">
                <div class="w-1/2"><img src="./images/logo.png" class="h-24 w-auto object-contain" alt="BM Medical"></div>
                <div class="w-1/2 text-right pt-2">
                    <div class="text-[10px] text-black leading-snug">
                        <p class="font-bold text-black text-sm mb-1">BM MEDICAL Engenharia Clínica</p>
                        <p>CNPJ: 48.673.158/0001-59</p>
                        <p>Av. Duque de Caxias, 915-B403, Pelotas-RS</p>
                        <p>Fone: (51) 99377-5933</p>
                        <p class="text-black font-medium">central.bmmedical@outlook.com</p>
                    </div>
                </div>
            </div>
            <div class="text-center mb-6">
                <h2 class="text-xl font-bold text-gray-800 mb-1">OS ${os.os_numero || 'S/N'}</h2>
                <p class="text-sm font-bold text-gray-700 uppercase tracking-wide">${tipoManutencao}</p>
            </div>
            <div class="space-y-4 flex-grow">
                <div class="${boxClass}"><h3 class="${titleClass}">Dados do Cliente</h3><div class="${lineClass}"></div><div class="text-xs space-y-1 pl-1"><p><span class="font-bold w-20 inline-block">Contrato:</span> ${os.contrato || '-'}</p><p><span class="font-bold w-20 inline-block">Cliente:</span> Exército Brasileiro</p></div></div>
                <div class="${boxClass}"><h3 class="${titleClass}">Dados do Equipamento</h3><div class="${lineClass}"></div><div class="text-xs grid grid-cols-2 gap-x-8 pl-1"><div><span class="font-bold w-24 inline-block">Equipamento:</span> ${os.equipamento || '-'}</div><div><span class="font-bold w-24 inline-block">Marca:</span> ${os.marca || '-'}</div></div></div>
                <div class="${boxClass}"><h3 class="${titleClass}">Atendimento</h3><div class="${lineClass}"></div><div class="text-xs grid grid-cols-2 gap-x-8 pl-1"><div><span class="font-bold w-28 inline-block">Data Execução:</span> ${fmt(os.data_conclusao)}</div><div><span class="font-bold w-28 inline-block">Local:</span> ${os.local_atendimento || '-'}</div></div></div>
                <div class="${boxClass}"><h3 class="${titleClass}">Descrição dos Serviços</h3><div class="${lineClass}"></div><div class="text-xs text-justify p-1">${os.servicos_realizados || 'Nenhum serviço descrito.'}</div></div>
                <div class="${boxClass}"><h3 class="${titleClass}">Peças Utilizadas</h3><div class="${lineClass}"></div><div class="border border-gray-300 rounded overflow-hidden mt-1"><div class="grid grid-cols-12 bg-gray-100 text-[10px] font-bold py-1 border-b border-gray-300 text-black"><div class="col-span-1 text-center">Item</div><div class="col-span-2 text-center">Qtd.</div><div class="col-span-9 pl-2">Descrição</div></div>${linhasPecas}</div></div>
            </div>
            <div class="mt-auto grid grid-cols-2 gap-12 pt-2">
                <div class="text-center border-t border-gray-400 pt-1"><p class="font-bold text-xs uppercase">Responsável do Setor</p></div>
                <div class="text-center border-t border-gray-400 pt-1"><p class="font-bold text-xs uppercase">Responsável Técnico</p></div>
            </div>
        </div>`;
}

// --- HANDLERS ---

window.updateItem = (index, field, value) => {
    state.itensPeças[index][field] = field === 'descricao' ? value : parseFloat(value) || 0;
    renderizarEditorPeças();
    atualizarTabelasRelatorio();
};

window.removerItem = (index) => {
    state.itensPeças.splice(index, 1);
    renderizarEditorPeças();
    atualizarTabelasRelatorio();
};

function adicionarItemManual() {
    state.itensPeças.push({ id: crypto.randomUUID(), descricao: 'Novo Item Extra', qtd: 1, valorUnit: 0 });
    renderizarEditorPeças();
    atualizarTabelasRelatorio();
}

function calcularTotais() {
    const total = state.itensPeças.reduce((acc, curr) => acc + (curr.qtd * curr.valorUnit), 0);
    const display = document.getElementById('total-pecas-display');
    if (display) display.innerText = formatMoeda(total);
}

async function salvarFechamento() {
    if (!state.user) return;
    const docId = `${state.anoRef}-${state.mesRef}`;
    const total = state.itensPeças.reduce((acc, curr) => acc + (curr.qtd * curr.valorUnit), 0);
    
    try {
        const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'fechamentos_exercito', docId);
        await setDoc(docRef, {
            mes_ref: state.mesRef,
            ano_ref: state.anoRef,
            valor_total: total,
            itens: state.itensPeças,
            updated_at: new Date()
        });
        alert("Fechamento salvo!");
        carregarDados();
    } catch (e) { alert("Erro ao salvar."); }
}

function updateUIPeriodo() {
    const display = document.getElementById('periodo-texto');
    if (!state.mesRef && display) { display.innerText = "Selecione um mês..."; return; }
    const ultimoDia = new Date(state.anoRef, state.mesRef, 0).getDate();
    if (display) display.innerText = `01/${state.mesRef}/${state.anoRef} - ${ultimoDia}/${state.mesRef}/${state.anoRef}`;
}

function formatMoeda(v) { return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }

function mostrarCarregando(show) {
    const btn = document.getElementById('btn-update');
    if (!btn) return;
    btn.disabled = show;
    btn.innerHTML = show ? '<i class="fas fa-spinner fa-spin mr-2"></i> ...' : '<i class="fas fa-sync-alt mr-2"></i> Sincronizar';
}

function renderizarSidebar() {
    const list = document.getElementById('sidebar-list');
    const sidebar = document.getElementById('os-selection-sidebar');
    if (!list || !sidebar) return;
    list.innerHTML = '';
    
    if (state.ossCarregadas.length === 0) { sidebar.classList.add('hidden'); return; }
    sidebar.classList.remove('hidden');
    document.getElementById('count-selected').innerText = `${state.ossCarregadas.length}/${state.ossCarregadas.length}`;

    state.ossCarregadas.forEach(os => {
        const row = document.createElement('div');
        row.className = "flex items-start p-2 border-b border-gray-100 bg-white hover:bg-gray-50 transition";
        row.innerHTML = `
            <input type="checkbox" id="chk-${os.id}" checked class="mt-1 mr-2 cursor-pointer">
            <label for="chk-${os.id}" class="text-[10px] flex-grow cursor-pointer">
                <p class="font-bold text-gray-800">${os.os_numero || 'S/N'}</p>
                <p class="text-gray-500 truncate w-40">${os.equipamento || '-'}</p>
            </label>
        `;
        
        // Lógica de mostrar/esconder página ao desmarcar checkbox
        const checkbox = row.querySelector('input');
        checkbox.addEventListener('change', (e) => {
            const pageId = `page-os-${os.id}`;
            const pageElement = document.getElementById(pageId);
            if (pageElement) {
                if (e.target.checked) {
                    pageElement.style.display = 'flex';
                } else {
                    pageElement.style.display = 'none';
                }
            }
            const checkedCount = list.querySelectorAll('input:checked').length;
            document.getElementById('count-selected').innerText = `${checkedCount}/${state.ossCarregadas.length}`;
        });

        list.appendChild(row);
    });
}