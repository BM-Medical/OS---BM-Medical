import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getFirestore, collection, query, where, getDocs, doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";

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
    configContrato: [], 
    isSyncing: false
};

// Formatação padrão de moeda
const formatMoeda = (v) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

window.handleCurrencyInput = (el, index) => {
    let value = el.value.replace(/\D/g, "");
    if (!value) value = "0";
    const floatValue = parseFloat(value) / 100;
    
    state.itensPeças[index].valorUnit = floatValue;
    el.value = formatMoeda(floatValue);
    
    const rowTotalEl = el.closest('tr').querySelector('.item-total-cell');
    if (rowTotalEl) {
        const item = state.itensPeças[index];
        rowTotalEl.innerText = formatMoeda(item.qtd * item.valorUnit);
    }
    
    const display = document.getElementById('total-pecas-display');
    if (display) display.innerText = formatMoeda(calcularTotalGeralPecas());
    
    atualizarTabelasRelatorio();
};

window.handleGenericCurrencyInput = (el) => {
    let value = el.value.replace(/\D/g, "");
    if (!value) value = "0";
    const floatValue = parseFloat(value) / 100;
    el.value = formatMoeda(floatValue);
    el.dataset.floatValue = floatValue;
};

window.clearIfZero = (el) => {
    const numericValue = parseFloat(el.value.replace(/\D/g, "")) / 100;
    if (numericValue === 0) el.value = "R$ ";
};

window.updateItemField = (index, field, value) => {
    if (!state.itensPeças[index]) return;
    if (field === 'qtd') {
        state.itensPeças[index][field] = parseInt(value) || 0;
        renderizarEditorPeças();
    } else {
        state.itensPeças[index][field] = value;
    }
    calcularTotaisERelatorio();
};

window.removeItem = (index) => {
    state.itensPeças.splice(index, 1);
    renderizarEditorPeças();
    atualizarTabelasRelatorio();
};

function calcularTotalGeralPecas() {
    return state.itensPeças.reduce((acc, i) => acc + ((i.qtd || 0) * (i.valorUnit || 0)), 0);
}

function checkMesTransicao() {
    if (!state.configContrato || state.configContrato.length === 0 || !state.mesRef) {
        return null;
    }
    
    // TRAVA ABSOLUTA: Transição só ocorre no mês 06 (Junho)
    const mesAtualInt = parseInt(state.mesRef);
    const anoAtualInt = parseInt(state.anoRef);
    
    if (mesAtualInt !== 6) {
        return null;
    }
    
    const contratosOrdenados = [...state.configContrato].sort((a,b) => new Date(a.dataInicio) - new Date(b.dataInicio));
    
    for (let i = 0; i < contratosOrdenados.length; i++) {
        const conf = contratosOrdenados[i];
        const [confAno, confMes, confDia] = conf.dataInicio.split('-');
        
        if (parseInt(confAno) === anoAtualInt && parseInt(confMes) === 6) {
            const diaInicioNovo = parseInt(confDia);
            const prevConf = i > 0 ? contratosOrdenados[i-1] : null;
            
            return {
                isTransition: true,
                diaCorte: diaInicioNovo,
                anoAntigo: prevConf ? prevConf.ano : conf.ano - 1,
                anoNovo: conf.ano,
                strDataAntigo: `01/06 a ${String(diaInicioNovo - 1).padStart(2, '0')}/06`,
                strDataNovo: `${String(diaInicioNovo).padStart(2, '0')}/06 a 30/06`
            };
        }
    }
    return null; 
}

async function carregarConfiguracoesContrato() {
    try {
        const docRef = doc(db, 'configuracoes_contratos', 'contrato_10_2025');
        const snap = await getDoc(docRef);
        if (snap.exists()) {
            state.configContrato = snap.data().vigencias || [];
        } else {
            throw new Error("Documento vazio no Firebase");
        }
    } catch (e) {
        state.configContrato = [
            { ano: 1, dataInicio: "2025-06-18", dataFim: "2026-06-17", valorMaoDeObra: 2920, tetoPecas: 30000 },
            { ano: 2, dataInicio: "2026-06-18", dataFim: "2027-06-17", valorMaoDeObra: 3073.80, tetoPecas: 31580.16 }
        ];
    }
}

function renderizarTabelaConfiguracoes() {
    const tbody = document.getElementById('tbody-config-vigencias');
    if (!tbody) return;
    
    tbody.innerHTML = '';
    const vigenciasOrdenadas = [...state.configContrato].sort((a,b) => a.ano - b.ano);

    vigenciasOrdenadas.forEach((vig, index) => {
        const tr = document.createElement('tr');
        tr.className = "hover:bg-gray-50 transition";
        tr.innerHTML = `
            <td class="border border-gray-200 p-2 text-center font-bold">
                <input type="number" value="${vig.ano}" class="w-full text-center bg-transparent border-b border-gray-300 focus:border-blue-500 outline-none vig-ano">
            </td>
            <td class="border border-gray-200 p-2 text-center">
                <input type="date" value="${vig.dataInicio}" class="w-full text-center bg-transparent border-b border-gray-300 focus:border-blue-500 outline-none vig-inicio">
            </td>
            <td class="border border-gray-200 p-2 text-center">
                <input type="date" value="${vig.dataFim}" class="w-full text-center bg-transparent border-b border-gray-300 focus:border-blue-500 outline-none vig-fim">
            </td>
            <td class="border border-gray-200 p-2 text-center">
                <input type="text" data-float-value="${vig.valorMaoDeObra}" value="${formatMoeda(vig.valorMaoDeObra)}" class="w-full text-center bg-transparent border-b border-gray-300 focus:border-blue-500 outline-none vig-mao-obra font-mono text-xs" onfocus="window.clearIfZero(this)" oninput="window.handleGenericCurrencyInput(this)">
            </td>
            <td class="border border-gray-200 p-2 text-center">
                <input type="text" data-float-value="${vig.tetoPecas}" value="${formatMoeda(vig.tetoPecas)}" class="w-full text-center bg-transparent border-b border-gray-300 focus:border-blue-500 outline-none vig-pecas font-mono text-xs" onfocus="window.clearIfZero(this)" oninput="window.handleGenericCurrencyInput(this)">
            </td>
            <td class="border border-gray-200 p-2 text-center">
                <button class="text-red-500 hover:text-red-700 p-1 btn-delete-vig" data-index="${index}"><i class="fas fa-trash-alt"></i></button>
            </td>
        `;
        tbody.appendChild(tr);
    });

    document.querySelectorAll('.btn-delete-vig').forEach(btn => {
        btn.onclick = () => {
            state.configContrato.splice(btn.dataset.index, 1);
            renderizarTabelaConfiguracoes();
        };
    });
}

async function salvarConfiguracoesContrato() {
    const btn = document.getElementById('btn-save-config');
    const origText = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...';
    btn.disabled = true;

    const tbody = document.getElementById('tbody-config-vigencias');
    const rows = tbody.querySelectorAll('tr');
    const novasVigencias = [];
    
    rows.forEach(row => {
        novasVigencias.push({
            ano: parseInt(row.querySelector('.vig-ano').value) || 1,
            dataInicio: row.querySelector('.vig-inicio').value,
            dataFim: row.querySelector('.vig-fim').value,
            valorMaoDeObra: parseFloat(row.querySelector('.vig-mao-obra').dataset.floatValue) || 0,
            tetoPecas: parseFloat(row.querySelector('.vig-pecas').dataset.floatValue) || 0
        });
    });

    try {
        const docRef = doc(db, 'configuracoes_contratos', 'contrato_10_2025');
        await setDoc(docRef, { vigencias: novasVigencias });
        state.configContrato = novasVigencias;
        btn.innerHTML = '<i class="fas fa-check"></i> Salvo!';
        setTimeout(() => { document.getElementById('modal-config-contrato').classList.add('hidden'); btn.innerHTML = origText; btn.disabled = false; }, 1000);
        if (document.getElementById('month-selector').value) carregarDados();
    } catch (e) {
        console.error("Erro ao salvar config:", e);
        alert("Erro ao salvar configurações no banco. O erro de permissão pode estar bloqueando a gravação.");
        btn.innerHTML = origText; btn.disabled = false;
    }
}

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
    
    if (tabId === 'relatorio') setTimeout(() => document.querySelectorAll('.editable-field').forEach(autoResize), 50);
};

function setupEventListeners() {
    const btnUpdate = document.getElementById('btn-update');
    if (btnUpdate) {
        btnUpdate.addEventListener('click', () => {
            carregarDados();
        });
    }

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
            } else { field.setAttribute('readonly', true); }
        });
    });

    document.getElementById('btn-config-contrato')?.addEventListener('click', () => {
        renderizarTabelaConfiguracoes();
        document.getElementById('modal-config-contrato').classList.remove('hidden');
    });
    
    document.getElementById('btn-close-config')?.addEventListener('click', () => document.getElementById('modal-config-contrato').classList.add('hidden'));
    document.getElementById('btn-cancel-config')?.addEventListener('click', () => document.getElementById('modal-config-contrato').classList.add('hidden'));
    
    document.getElementById('btn-add-vigencia')?.addEventListener('click', () => {
        state.configContrato.push({ ano: state.configContrato.length + 1, dataInicio: "", dataFim: "", valorMaoDeObra: 0, tetoPecas: 0 });
        renderizarTabelaConfiguracoes();
    });

    document.getElementById('btn-save-config')?.addEventListener('click', salvarConfiguracoesContrato);
}

function initAuth() {
    return new Promise((resolve) => {
        onAuthStateChanged(auth, (user) => {
            state.user = user;
            resolve(user); // Libera o sistema para continuar (com ou sem usuário)
        });
    });
}

document.addEventListener('DOMContentLoaded', async () => {
    setupEventListeners();
    await initAuth();
    await carregarConfiguracoesContrato();
});

async function carregarDados() {
    if (state.isSyncing) return;
    
    const val = document.getElementById('month-selector').value;
    if (!val) {
        alert("Por favor, selecione um mês primeiro no calendário.");
        return;
    }
    
    [state.anoRef, state.mesRef] = val.split('-');
    state.isSyncing = true;
    const btn = document.getElementById('btn-update');
    const originalText = btn?.innerHTML;
    if(btn) btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sincronizando...';

    // Disparamos as buscas blindadas
    try {
        await Promise.all([
            carregarHistoricoTotal().catch(e => console.error(e)),
            carregarOSsDoMes().catch(e => console.error(e))
        ]);
        await carregarFechamentoSalvo().catch(e => console.error(e));
        
        renderizarBotoesEditor();
        renderizarEditorPeças();
        atualizarTabelasRelatorio();
        renderizarListaOSs(state.ossCarregadas);
        renderizarSidebar();
        updateUIPeriodo();
        atualizarCardsControleGastos();
    } catch (e) { 
        console.error(e);
        alert("Falha no carregamento. Verifique o console.");
    } finally { 
        state.isSyncing = false; 
        if(btn) btn.innerHTML = originalText;
    }
}

async function carregarHistoricoTotal() {
    try {
        const q = collection(db, 'artifacts', appId, 'public', 'data', 'fechamentos_exercito');
        const snap = await getDocs(q);
        // MODIFICAÇÃO: Agora salvamos também a ID do documento (ex: "2025-06") para busca blindada
        state.historicoFechamentos = snap.docs.map(d => ({ docId: d.id, ...d.data() }));
    } catch (e) {
        state.historicoFechamentos = [];
    }
}

async function carregarOSsDoMes() {
    try {
        const q = query(collection(db, "orders"), where("contrato", "==", "Contrato Nº 10/2025"));
        const snap = await getDocs(q);
        const mesFormatado = `${state.anoRef}-${state.mesRef}`;
        
        state.ossCarregadas = snap.docs.map(d => ({id: d.id, ...d.data()}))
            .filter(os => os.data_conclusao && os.status === 'finalizada' && os.data_conclusao.startsWith(mesFormatado))
            .sort((a,b) => (parseInt(a.os_numero?.replace(/\D/g, '')) || 0) - (parseInt(b.os_numero?.replace(/\D/g, '')) || 0));
    } catch (e) {
        state.ossCarregadas = [];
    }
}

async function carregarFechamentoSalvo() {
    try {
        const path = doc(db, 'artifacts', appId, 'public', 'data', 'fechamentos_exercito', `${state.anoRef}-${state.mesRef}`);
        const snap = await getDoc(path);
        if (snap.exists()) {
            state.itensPeças = snap.data().itens || [];
        } else {
            await importarPecasDasOSs();
        }
    } catch (e) {
        await importarPecasDasOSs();
    }
}

async function importarPecasDasOSs() {
    const pecasMap = new Map();
    const transicao = checkMesTransicao();

    state.ossCarregadas.forEach(os => {
        let anoAtribuido = "geral";
        if (transicao && os.data_conclusao) {
            const diaConclusao = parseInt(os.data_conclusao.split('-')[2]);
            anoAtribuido = diaConclusao < transicao.diaCorte ? transicao.anoAntigo : transicao.anoNovo;
        }

        os.pecas_utilizadas?.forEach(p => {
            const desc = p.descricao?.toUpperCase().trim() || "SEM DESCRIÇÃO";
            const key = transicao ? `${desc}_ANO_${anoAtribuido}` : desc; 
            
            if (pecasMap.has(key)) {
                pecasMap.get(key).qtd += (parseFloat(p.qtd) || 0);
            } else {
                pecasMap.set(key, {
                    id: crypto.randomUUID(), 
                    descricao: desc, 
                    qtd: Math.floor(parseFloat(p.qtd) || 0), 
                    valorUnit: 0,
                    contratoAno: anoAtribuido
                });
            }
        });
    });
    state.itensPeças = Array.from(pecasMap.values());
    renderizarBotoesEditor();
    renderizarEditorPeças();
}

function renderizarBotoesEditor() {
    const container = document.getElementById('add-buttons-container');
    if (!container) return;
    
    const transicao = checkMesTransicao();
    document.querySelectorAll('.btn-add-item-dynamic').forEach(b => b.remove());
    const btnSalvar = document.getElementById('btn-save-data');

    if (transicao) {
        const btn1 = document.createElement('button');
        btn1.className = "btn-add-item-dynamic bg-blue-800 hover:bg-blue-700 px-3 py-1 rounded text-xs font-bold uppercase transition text-white";
        btn1.innerHTML = `<i class="fas fa-plus mr-1"></i> Item ${transicao.anoAntigo}º Ano`;
        btn1.onclick = () => { window.adicionarItemManual(transicao.anoAntigo); };
        
        const btn2 = document.createElement('button');
        btn2.className = "btn-add-item-dynamic bg-indigo-700 hover:bg-indigo-600 px-3 py-1 rounded text-xs font-bold uppercase transition text-white";
        btn2.innerHTML = `<i class="fas fa-plus mr-1"></i> Item ${transicao.anoNovo}º Ano`;
        btn2.onclick = () => { window.adicionarItemManual(transicao.anoNovo); };

        container.insertBefore(btn2, btnSalvar);
        container.insertBefore(btn1, btn2);
    } else {
        const btn = document.createElement('button');
        btn.className = "btn-add-item-dynamic bg-blue-800 hover:bg-blue-700 px-3 py-1 rounded text-xs font-bold uppercase transition text-white";
        btn.innerHTML = `<i class="fas fa-plus mr-1"></i> Item Extra`;
        btn.onclick = () => { window.adicionarItemManual("geral"); };
        
        container.insertBefore(btn, btnSalvar);
    }
}

window.adicionarItemManual = (anoContratual = "geral") => { 
    state.itensPeças.push({
        id: crypto.randomUUID(), 
        descricao: 'NOVO ITEM', 
        qtd: 1, 
        valorUnit: 0, 
        contratoAno: anoContratual
    }); 
    renderizarEditorPeças(); 
    atualizarTabelasRelatorio();
};

function renderizarEditorPeças() {
    const container = document.getElementById('editor-tables-container');
    if (!container) return;

    container.innerHTML = '';
    const transicao = checkMesTransicao();

    const gerarTabelaHTML = (titulo, itensFiltrados) => {
        let rows = '';
        let totalTabela = 0;
        
        if (itensFiltrados.length === 0) {
            rows = `<tr><td colspan="5" class="py-12 text-center text-gray-400 italic">Nenhum item encontrado.</td></tr>`;
        } else {
            itensFiltrados.forEach((itemObj) => {
                const globalIndex = state.itensPeças.findIndex(i => i.id === itemObj.id);
                const totalItem = (itemObj.qtd || 0) * (itemObj.valorUnit || 0);
                totalTabela += totalItem;

                rows += `
                    <tr class="border-b border-gray-50 hover:bg-gray-50 transition">
                        <td class="py-3">
                            <input type="text" value="${itemObj.descricao}" 
                                class="w-full bg-transparent border-none focus:ring-1 focus:ring-blue-500 rounded p-1 text-sm uppercase font-semibold"
                                oninput="window.updateItemField(${globalIndex}, 'descricao', this.value)">
                        </td>
                        <td class="py-3 text-center">
                            <input type="number" value="${Math.floor(itemObj.qtd)}" step="1" min="0"
                                class="w-16 text-center bg-gray-50 border border-gray-200 rounded p-1 text-sm"
                                oninput="window.updateItemField(${globalIndex}, 'qtd', this.value)">
                        </td>
                        <td class="py-3 text-center">
                            <input type="text" value="${formatMoeda(itemObj.valorUnit)}"
                                class="w-36 text-center bg-gray-50 border border-gray-200 rounded p-1 text-sm font-mono"
                                onfocus="window.clearIfZero(this)"
                                oninput="window.handleCurrencyInput(this, ${globalIndex})">
                        </td>
                        <td class="py-3 text-center font-bold text-gray-700 font-mono item-total-cell">
                            ${formatMoeda(totalItem)}
                        </td>
                        <td class="py-3 text-right">
                            <button onclick="window.removeItem(${globalIndex})" class="text-red-400 hover:text-red-600 p-2">
                                <i class="fas fa-trash-alt"></i>
                            </button>
                        </td>
                    </tr>
                `;
            });
        }

        return `
            <div class="mb-8 bg-white border border-gray-200 rounded-lg overflow-hidden">
                ${titulo ? `<div class="bg-gray-100 p-2 text-center font-bold text-xs uppercase text-gray-700 border-b border-gray-200">${titulo}</div>` : ''}
                <table class="w-full text-sm">
                    <thead>
                        <tr class="text-gray-400 uppercase text-[10px] font-bold border-b border-gray-100">
                            <th class="pb-2 pt-2 px-2 text-left">Descrição do Item</th>
                            <th class="pb-2 pt-2 text-center w-20">Qtd</th>
                            <th class="pb-2 pt-2 text-center w-40">Valor Unitário (R$)</th>
                            <th class="pb-2 pt-2 text-center w-40">Total</th>
                            <th class="pb-2 pt-2 text-right w-12"></th>
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                    <tfoot>
                        <tr class="border-t-2 border-gray-100 font-bold">
                            <td colspan="3" class="pt-4 pb-2 text-right uppercase text-gray-500 text-xs">Subtotal:</td>
                            <td class="pt-4 pb-2 text-center text-blue-600 text-base">${formatMoeda(totalTabela)}</td>
                            <td></td>
                        </tr>
                    </tfoot>
                </table>
            </div>
        `;
    };

    if (transicao) {
        const pecasAntigas = state.itensPeças.filter(i => i.contratoAno == transicao.anoAntigo);
        const pecasNovas = state.itensPeças.filter(i => i.contratoAno == transicao.anoNovo);
        
        container.innerHTML += gerarTabelaHTML(`Peças ${transicao.anoAntigo}º Ano Contratual (${transicao.strDataAntigo})`, pecasAntigas);
        container.innerHTML += gerarTabelaHTML(`Peças ${transicao.anoNovo}º Ano Contratual (${transicao.strDataNovo})`, pecasNovas);
        
        container.innerHTML += `
            <div class="text-right pt-4 border-t-2 border-gray-300">
                <span class="text-gray-500 uppercase text-xs font-bold mr-4">Total Geral do Mês:</span>
                <span class="text-2xl font-black text-blue-700" id="total-pecas-display">${formatMoeda(calcularTotalGeralPecas())}</span>
            </div>
        `;
    } else {
        container.innerHTML = gerarTabelaHTML(null, state.itensPeças);
        container.innerHTML += `
            <div class="text-right pt-4">
                <span class="text-gray-500 uppercase text-xs font-bold mr-4">Total Geral do Mês:</span>
                <span class="text-2xl font-black text-blue-700" id="total-pecas-display">${formatMoeda(calcularTotalGeralPecas())}</span>
            </div>
        `;
    }

    calcularTotaisERelatorio();
}

function calcularTotaisERelatorio() {
    const display = document.getElementById('total-pecas-display');
    if (display) display.innerText = formatMoeda(calcularTotalGeralPecas());
    atualizarTabelasRelatorio();
    atualizarCardsControleGastos();
}

function getMaoDeObraCalculada() {
    if (!state.configContrato || state.configContrato.length === 0 || !state.mesRef || !state.anoRef) return [];
    
    const transicao = checkMesTransicao();

    if (transicao) {
        const confAntiga = state.configContrato.find(c => c.ano == transicao.anoAntigo);
        const confNova = state.configContrato.find(c => c.ano == transicao.anoNovo);
        
        const valAntigo = confAntiga ? confAntiga.valorMaoDeObra : 2920;
        const valNovo = confNova ? confNova.valorMaoDeObra : 3073.80;
        
        const diasAntigo = transicao.diaCorte - 1; 
        const diasNovo = 30 - diasAntigo; 
        
        const totalAntigo = (valAntigo / 30) * diasAntigo;
        const totalNovo = (valNovo / 30) * diasNovo;
        
        return [
            { descricao: `Serviço Mensal Manutenção Odontoclínica - ${transicao.anoAntigo}º Ano Contratual (01/06 a ${String(diasAntigo).padStart(2,'0')}/06)`, valor: totalAntigo },
            { descricao: `Serviço Mensal Manutenção Odontoclínica - ${transicao.anoNovo}º Ano Contratual (${String(transicao.diaCorte).padStart(2,'0')}/06 a 30/06)`, valor: totalNovo }
        ];
    } else {
        const dataConsultaStr = `${state.anoRef}-${String(state.mesRef).padStart(2, '0')}-15`;
        let contratoVigente = state.configContrato[0]; 
        
        const ordenados = [...state.configContrato].sort((a,b) => new Date(b.dataInicio) - new Date(a.dataInicio));
        for (let c of ordenados) {
            if (dataConsultaStr >= c.dataInicio) {
                contratoVigente = c; 
                break;
            }
        }
        
        return [{
            descricao: `Serviço Mensal Manutenção Odontoclínica - ${contratoVigente?.ano || 1}º Ano Contratual`,
            valor: contratoVigente?.valorMaoDeObra || 2920
        }];
    }
}

function calcularControleGastos(anoContratualAlvo) {
    if (!state.configContrato || state.configContrato.length === 0 || !state.anoRef || !state.mesRef) return null;

    const configAlvo = state.configContrato.find(c => c.ano == anoContratualAlvo);
    if (!configAlvo) return null;

    const historico = [];
    let gastoAcumuladoPrevio = 0;
    
    // MODIFICAÇÃO: Pegando também o dia para calcular os 13 meses e gerar os textos dinâmicos corretos
    const [anoInicStr, mesInicStr, diaInicStr] = configAlvo.dataInicio.split('-');
    let currentYear = parseInt(anoInicStr);
    let currentMonth = parseInt(mesInicStr);
    let diaInicio = parseInt(diaInicStr);
    
    const limiteAno = parseInt(state.anoRef);
    const limiteMes = parseInt(state.mesRef);
    const meses = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
    const isTransiting = checkMesTransicao();

    // ITEM 1 DA SUA LISTA: Se o contrato começa depois do dia 1, ele precisa de 13 meses na tabela para fechar 1 ano completo!
    const totalMesesLoop = diaInicio > 1 ? 13 : 12;

    for (let i = 0; i < totalMesesLoop; i++) {
        if (currentYear > limiteAno || (currentYear === limiteAno && currentMonth > limiteMes)) break;

        let gastoNoMes = 0;
        const isCurrentMonth = (currentYear === limiteAno && currentMonth === limiteMes);

        if (isCurrentMonth) {
            if (isTransiting) {
                gastoNoMes = state.itensPeças
                    .filter(item => item.contratoAno == anoContratualAlvo)
                    .reduce((acc, item) => acc + (item.qtd * item.valorUnit), 0);
            } else {
                gastoNoMes = calcularTotalGeralPecas();
            }
        } else {
            // Busca o histórico priorizando a ID do documento para evitar bugs de tipagem (Texto vs Número)
            const mesFormatado = String(currentMonth).padStart(2, '0');
            const docIdAlvo = `${currentYear}-${mesFormatado}`;
            
            const fechamentoSalvo = state.historicoFechamentos.find(f => 
                f.docId === docIdAlvo || 
                (f.ano_ref == currentYear && f.mes_ref == currentMonth)
            );

            if (fechamentoSalvo) {
                if (currentMonth === 6 && fechamentoSalvo.itens && fechamentoSalvo.itens.length > 0) {
                     gastoNoMes = fechamentoSalvo.itens
                        .filter(item => item.contratoAno == anoContratualAlvo || (!item.contratoAno && anoContratualAlvo == 1))
                        .reduce((acc, item) => acc + (item.qtd * item.valorUnit), 0);
                } else {
                    gastoNoMes = fechamentoSalvo.valor_total || 0;
                }
            }
        }

        // ITENS 2, 3 e 4 DA SUA LISTA: Criação dos rótulos dinâmicos baseados na configuração
        let textoLabel = `${meses[currentMonth - 1]}/${currentYear}`;
        
        if (i === 0 && diaInicio > 1) {
            // Primeiro mês de um contrato novo (Ex: Junho/2026 - a partir de 18/06)
            textoLabel = `${meses[currentMonth - 1]}/${currentYear} - a partir de ${String(diaInicio).padStart(2, '0')}/${String(currentMonth).padStart(2, '0')}`;
        } else if (i === totalMesesLoop - 1 && diaInicio > 1) {
            // Último mês do contrato (O mês 13 - Ex: Junho/2026 - 01/06 a 17/06)
            textoLabel = `${meses[currentMonth - 1]}/${currentYear} - 01/${String(currentMonth).padStart(2, '0')} a ${String(diaInicio - 1).padStart(2, '0')}/${String(currentMonth).padStart(2, '0')}`;
        }

        historico.push({
            mesAnoTexto: textoLabel,
            gasto: gastoNoMes,
            isCurrentMonth: isCurrentMonth
        });

        if (!isCurrentMonth) gastoAcumuladoPrevio += gastoNoMes;

        currentMonth++;
        if (currentMonth > 12) {
            currentMonth = 1;
            currentYear++;
        }
    }

    return {
        limiteAnual: configAlvo.tetoPecas,
        gastoAcumuladoPrevio: gastoAcumuladoPrevio,
        historico: historico,
        configAlvo: configAlvo
    };
}


function atualizarCardsControleGastos() {
    const dataAlvoStr = `${state.anoRef}-${String(state.mesRef).padStart(2, '0')}-15`;
    const contratosOrdenados = [...state.configContrato].sort((a,b) => new Date(b.dataInicio) - new Date(a.dataInicio));
    let contratoAtual = contratosOrdenados[0]; // Correção: 'let' adicionado aqui
    for (let c of contratosOrdenados) {
        if (dataAlvoStr >= c.dataInicio) { contratoAtual = c; break; }
    }
    
    const transicao = checkMesTransicao();
    const anoExibicaoCards = transicao ? transicao.anoNovo : (contratoAtual ? contratoAtual.ano : 1);
    const controle = calcularControleGastos(anoExibicaoCards);
    
    if (controle) {
        const lblAnual = document.getElementById('lbl-limite-anual');
        if (lblAnual) lblAnual.innerText = `Limite Anual Contratado (${anoExibicaoCards}º Ano)`;
        
        const elLimite = document.getElementById('limite-anual-display');
        if (elLimite) elLimite.innerText = formatMoeda(controle.limiteAnual);

        const elAcumulado = document.getElementById('acumulado-anterior-display');
        if (elAcumulado) elAcumulado.innerText = formatMoeda(controle.gastoAcumuladoPrevio);

        const gastoMesAtualCards = transicao 
            ? state.itensPeças.filter(item => item.contratoAno == transicao.anoNovo).reduce((acc, item) => acc + (item.qtd * item.valorUnit), 0)
            : calcularTotalGeralPecas();

        const saldoFinal = controle.limiteAnual - (controle.gastoAcumuladoPrevio + gastoMesAtualCards);
        
        const elSaldo = document.getElementById('saldo-final-display');
        if (elSaldo) {
            elSaldo.innerText = formatMoeda(saldoFinal);
            elSaldo.className = saldoFinal < 0 ? "text-xl font-black text-red-600" : "text-xl font-black text-green-800";
        }
    }
}

function atualizarTabelasRelatorio() {
    console.log("[DEBUG FLOW] Desenhando tabelas no Relatório HTML...");
    const containerRelatorioPecas = document.getElementById('relatorio-pecas-container');
    const transicao = checkMesTransicao();
    const totalMesPecas = calcularTotalGeralPecas();

    // --- TEXTO DINÂMICO: ATIVIDADES REALIZADAS ---
    const txtAtividades = document.getElementById('txt-atividades');
    if (txtAtividades) {
        if (transicao) {
            txtAtividades.value = "Durante o mês de referência, período que compreende a conclusão de um ano contratual e o início do subsequente, foram realizados atendimentos de manutenção corretiva e preventiva, bem como a aquisição de peças necessárias. As atividades e valores aplicados a cada período encontram-se detalhados nas Ordens de Serviço - Manutenção, dispostas no Anexo I.";
        } else {
            txtAtividades.value = "Durante o mês de referência do presente relatório, foram realizados atendimentos de manutenção corretiva e preventiva, bem como a aquisição de peças necessárias para a execução dos serviços. As descrições detalhadas das atividades encontram-se registradas nas Ordens de Serviço - Manutenção, dispostas no Anexo I.";
        }
        // Ajusta a altura da caixa automaticamente para o texto não ficar cortado no PDF
        if (typeof autoResize === 'function') autoResize(txtAtividades);
    }

    // --- TEXTOS DINÂMICOS: AQUISIÇÃO E CONTROLE ---
const txtIntroPecas = document.getElementById('txt-intro-pecas');
    const txtIntroControle = document.getElementById('txt-intro-controle');
    const txtIntroFaturamento = document.getElementById('txt-intro-faturamento');

    if (txtIntroPecas) {
        txtIntroPecas.innerText = transicao 
            ? "Nas tabelas abaixo, apresentam-se as peças adquiridas e seus respectivos valores, separadas de acordo com seus respectivos períodos contratuais, para fins de referência." 
            : "Na tabela abaixo, apresentam-se as peças adquiridas e seus respectivos valores para fins de referência.";
    }

    if (txtIntroControle) {
        if (transicao) {
            const confAntiga = state.configContrato.find(c => c.ano == transicao.anoAntigo) || { tetoPecas: 30000 };
            const confNova = state.configContrato.find(c => c.ano == transicao.anoNovo) || { tetoPecas: 31580.16 };
            
            const valGlobalAntigo = formatMoeda(confAntiga.tetoPecas);
            const valMedioAntigo = formatMoeda(confAntiga.tetoPecas / 12);
            const valGlobalNovo = formatMoeda(confNova.tetoPecas);
            const valMedioNovo = formatMoeda(confNova.tetoPecas / 12);

            txtIntroControle.innerText = `Considerando os limites anuais destinados à aquisição de peças, apresentam-se a seguir as tabelas de controle mensal de despesas referentes a cada vigência. O valor global para o ${transicao.anoAntigo}° Ano Contratual foi de ${valGlobalAntigo} (utilizado o valor médio ${valMedioAntigo} para controle mensal), e o valor global reajustado para o ${transicao.anoNovo}º Ano Contratual é de ${valGlobalNovo} (será utilizado o valor médio ${valMedioNovo} para controle mensal). O objetivo é permitir um acompanhamento progressivo da utilização dos recursos, garantindo maior transparência e prevenindo riscos de desequilíbrio financeiro durante a execução contratual.`;
        } else {
            txtIntroControle.innerText = "Considerando o limite anual destinado à aquisição de peças, apresenta-se a seguir a tabela de controle mensal de despesas. O objetivo é permitir um acompanhamento progressivo da utilização dos recursos, garantindo maior transparência e prevenindo riscos de desequilíbrio financeiro durante a execução contratual.";
        }
    }

    if (txtIntroFaturamento) {
        if (transicao) {
            const confAntiga = state.configContrato.find(c => c.ano == transicao.anoAntigo) || { valorMaoDeObra: 2920 };
            const confNova = state.configContrato.find(c => c.ano == transicao.anoNovo) || { valorMaoDeObra: 3073.80 };
            
            const valMaoObraAntigo = formatMoeda(confAntiga.valorMaoDeObra);
            const valMaoObraNovo = formatMoeda(confNova.valorMaoDeObra);

            txtIntroFaturamento.innerText = `Devido à transição entre os anos contratuais ocorrida neste mês, o faturamento referente aos serviços mensais fixos de manutenção foi fracionado. Os valores foram calculados de forma proporcional (pro-rata) aos dias executados sob a vigência do ${transicao.anoAntigo}º Ano Contratual (com valor de ${valMaoObraAntigo}) e aos dias executados sob o ${transicao.anoNovo}º Ano Contratual (com valor reajustado de ${valMaoObraNovo}), acrescidos do fornecimento de peças, conforme demonstrado a seguir:`;
            txtIntroFaturamento.classList.remove('hidden');
        } else {
            txtIntroFaturamento.innerText = "";
            txtIntroFaturamento.classList.add('hidden');
        }
    }

    if (containerRelatorioPecas) {
        const gerarTabelaPDF = (itens, titulo) => {
            if (itens.length === 0) return '';
            const subtotal = itens.reduce((acc, i) => acc + (i.qtd * i.valorUnit), 0);
            return `
                ${titulo ? `<h4 class="text-[11px] font-bold uppercase mt-4 mb-1 text-gray-700">${titulo}</h4>` : ''}
                <table class="w-full border-collapse border border-gray-900 text-[11px] mb-2">
                    <thead>
                        <tr class="bg-gray-100 uppercase font-bold text-center">
                            <th class="border border-gray-900 p-2">Descrição</th>
                            <th class="border border-gray-900 p-2 w-16">Qtd</th>
                            <th class="border border-gray-900 p-2 w-28">Valor Unit.</th>
                            <th class="border border-gray-900 p-2 w-28">Valor Total</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${itens.map(i => `
                            <tr>
                                <td class="border border-gray-900 p-2 text-left uppercase text-[10px]">${i.descricao}</td>
                                <td class="border border-gray-900 p-2 text-center">${i.qtd}</td>
                                <td class="border border-gray-900 p-2 text-center">${formatMoeda(i.valorUnit)}</td>
                                <td class="border border-gray-900 p-2 text-center font-bold">${formatMoeda(i.qtd * i.valorUnit)}</td>
                            </tr>
                        `).join('')}
                        <tr class="bg-gray-100 font-bold text-xs"><td colspan="3" class="border border-gray-900 p-2 text-right uppercase">Subtotal</td><td class="border border-gray-900 p-2 text-center">${formatMoeda(subtotal)}</td></tr>
                    </tbody>
                </table>
            `;
        };

        if (state.itensPeças.length === 0) {
            containerRelatorioPecas.innerHTML = `
                <table class="w-full border-collapse border border-gray-900 text-[11px] mb-6">
                    <tr class="bg-gray-100 uppercase font-bold text-center"><th class="border border-gray-900 p-2">Descrição</th><th class="border border-gray-900 p-2 w-16">Qtd</th><th class="border border-gray-900 p-2 w-28">Valor Unit.</th><th class="border border-gray-900 p-2 w-28">Valor Total</th></tr>
                    <tr><td colspan="4" class="p-4 text-center text-gray-400 italic">Nenhum item registrado neste mês.</td></tr>
                </table>`;
        } else if (transicao) {
            const pecasAntigas = state.itensPeças.filter(i => i.contratoAno == transicao.anoAntigo);
            const pecasNovas = state.itensPeças.filter(i => i.contratoAno == transicao.anoNovo);
            
            let html = '';
            html += gerarTabelaPDF(pecasAntigas, `Peças do ${transicao.anoAntigo}º Ano Contratual (${transicao.strDataAntigo})`);
            html += gerarTabelaPDF(pecasNovas, `Peças do ${transicao.anoNovo}º Ano Contratual (${transicao.strDataNovo})`);
            html += `<div class="bg-total-custom font-bold text-sm border border-gray-900 p-2 flex justify-between mt-2"><span class="uppercase">Total Geral de Peças no Mês</span><span>${formatMoeda(totalMesPecas)}</span></div>`;
            containerRelatorioPecas.innerHTML = html;
        } else {
            let html = gerarTabelaPDF(state.itensPeças, null);
            html = html.replace('bg-gray-100 font-bold text-xs', 'bg-total-custom font-bold text-sm').replace('Subtotal', 'Total de Peças no Mês');
            containerRelatorioPecas.innerHTML = html;
        }
    }

    const tbodyF = document.getElementById('tbody-faturamento');
    if (tbodyF) {
        const servicos = getMaoDeObraCalculada();
        let htmlFaturamento = '';
        let totalFaturamento = 0;
        let indexFaturamento = 1;

        servicos.forEach(serv => {
            htmlFaturamento += `
                <tr>
                    <td class="border border-gray-900 p-2 text-center">${indexFaturamento}</td>
                    <td class="border border-gray-900 p-2 text-left text-[10px]">${serv.descricao}</td>
                    <td class="border border-gray-900 p-2 text-center">${formatMoeda(serv.valor)}</td>
                </tr>
            `;
            totalFaturamento += serv.valor;
            indexFaturamento++;
        });

        htmlFaturamento += `
            <tr>
                <td class="border border-gray-900 p-2 text-center">${indexFaturamento}</td>
                <td class="border border-gray-900 p-2 text-left text-[10px]">Fornecimento de peças conforme discriminado no item 3...</td>
                <td class="border border-gray-900 p-2 text-center">${formatMoeda(totalMesPecas)}</td>
            </tr>
            <tr class="bg-total-custom font-bold text-sm">
                <td colspan="2" class="border border-gray-900 p-2 text-right uppercase">Total do Faturamento</td>
                <td class="border border-gray-900 p-2 text-center">${formatMoeda(totalFaturamento + totalMesPecas)}</td>
            </tr>
        `;
        tbodyF.innerHTML = htmlFaturamento;
    }

    // CORREÇÃO CRÍTICA DO BUG DE DESTRUIÇÃO DO DOM ("outerHTML" Bug)
    let wrapperCG = document.getElementById('controle-gastos-wrapper');
    
    // Se o "envelope" ainda não existe (primeira vez renderizando), ele pega a tabela vazia do HTML original e envolve ela.
    if (!wrapperCG) {
        const tbodyCG = document.getElementById('tbody-controle-gastos');
        if (tbodyCG) {
            const tableCG = tbodyCG.closest('table');
            wrapperCG = document.createElement('div');
            wrapperCG.id = 'controle-gastos-wrapper';
            tableCG.parentNode.insertBefore(wrapperCG, tableCG);
            tableCG.remove(); // Remove a tabela crua original para desenharmos as novas
        }
    }

    // Agora, substituímos APENAS O CONTEÚDO DENTRO DO ENVELOPE. Ele nunca some.
if (wrapperCG) {
        let theHtml = '';
        
        if (transicao) {
            const controleAnoAntigo = calcularControleGastos(transicao.anoAntigo);
            const controleAnoNovo = calcularControleGastos(transicao.anoNovo);
            
            if (controleAnoAntigo && controleAnoAntigo.historico.length > 0) {
                theHtml += `<table class="w-full border-collapse border border-gray-900 text-[11px] mb-6">
                    <tbody>
                        <tr class="bg-gray-200 font-bold"><td colspan="3" class="border border-gray-900 p-2 text-center uppercase text-xs">Controle Mensal - ${transicao.anoAntigo}º Ano Contratual</td></tr>`;
                let saldoAcumulado = controleAnoAntigo.limiteAnual;
                controleAnoAntigo.historico.forEach(linha => {
                    saldoAcumulado -= linha.gasto;
                    const bgClass = linha.isCurrentMonth ? "bg-yellow-50 font-bold" : "";
                    theHtml += `<tr class="${bgClass}"><td class="border border-gray-900 p-2 text-center text-xs w-1/3">${linha.mesAnoTexto}</td><td class="border border-gray-900 p-2 text-center text-xs w-1/3">${formatMoeda(linha.gasto)}</td><td class="border border-gray-900 p-2 text-center text-xs font-bold w-1/3 ${saldoAcumulado < 0 ? 'text-red-600' : ''}">${formatMoeda(saldoAcumulado)}</td></tr>`;
                });
                theHtml += `<tr class="bg-total-custom font-bold text-sm"><td colspan="2" class="border border-gray-900 p-2 text-right uppercase">Saldo Final Restante (${transicao.anoAntigo}º Ano)</td><td class="border border-gray-900 p-2 text-center ${saldoAcumulado < 0 ? 'text-red-600' : ''}">${formatMoeda(saldoAcumulado)}</td></tr></tbody></table>`;
            }

            if (controleAnoNovo && controleAnoNovo.historico.length > 0) {
                theHtml += `<table class="w-full border-collapse border border-gray-900 text-[11px] mb-4">
                    <tbody>
                        <tr class="bg-gray-200 font-bold"><td colspan="3" class="border border-gray-900 p-2 text-center uppercase text-xs">Controle Mensal - ${transicao.anoNovo}º Ano Contratual</td></tr>`;
                let saldoAcumuladoNovo = controleAnoNovo.limiteAnual;
                controleAnoNovo.historico.forEach(linha => {
                    saldoAcumuladoNovo -= linha.gasto;
                    const bgClass = linha.isCurrentMonth ? "bg-yellow-50 font-bold" : "";
                    theHtml += `<tr class="${bgClass}"><td class="border border-gray-900 p-2 text-center text-xs w-1/3">${linha.mesAnoTexto}</td><td class="border border-gray-900 p-2 text-center text-xs w-1/3">${formatMoeda(linha.gasto)}</td><td class="border border-gray-900 p-2 text-center text-xs font-bold w-1/3 ${saldoAcumuladoNovo < 0 ? 'text-red-600' : ''}">${formatMoeda(saldoAcumuladoNovo)}</td></tr>`;
                });
                theHtml += `<tr class="bg-total-custom font-bold text-sm"><td colspan="2" class="border border-gray-900 p-2 text-right uppercase">Valor Contratual Disponível (${transicao.anoNovo}º Ano)</td><td class="border border-gray-900 p-2 text-center ${saldoAcumuladoNovo < 0 ? 'text-red-600' : ''}">${formatMoeda(saldoAcumuladoNovo)}</td></tr></tbody></table>`;
            }
        } else {
            const dataAlvoStr = `${state.anoRef}-${String(state.mesRef).padStart(2, '0')}-15`;
            const contratosOrdenados = [...state.configContrato].sort((a,b) => new Date(b.dataInicio) - new Date(a.dataInicio));
            let contratoAtual = contratosOrdenados[0];
            for (let c of contratosOrdenados) {
                if (dataAlvoStr >= c.dataInicio) { contratoAtual = c; break; }
            }
            
            const anoAtual = contratoAtual ? contratoAtual.ano : 1;
            const controle = calcularControleGastos(anoAtual);
            
            if (controle && controle.historico.length > 0) {
                theHtml = `<table class="w-full border-collapse border border-gray-900 text-[11px] mb-4">
                    <tbody>
                        <tr class="bg-gray-200 font-bold"><td colspan="3" class="border border-gray-900 p-2 text-center uppercase text-xs">Controle Mensal - ${anoAtual}º Ano Contratual</td></tr>`;
                let saldoAcumulado = controle.limiteAnual;
                controle.historico.forEach(linha => {
                    saldoAcumulado -= linha.gasto;
                    const bgClass = linha.isCurrentMonth ? "bg-yellow-50 font-bold" : "";
                    theHtml += `<tr class="${bgClass}"><td class="border border-gray-900 p-2 text-center text-xs w-1/3">${linha.mesAnoTexto}</td><td class="border border-gray-900 p-2 text-center text-xs w-1/3">${formatMoeda(linha.gasto)}</td><td class="border border-gray-900 p-2 text-center text-xs font-bold w-1/3 ${saldoAcumulado < 0 ? 'text-red-600' : ''}">${formatMoeda(saldoAcumulado)}</td></tr>`;
                });
                theHtml += `<tr class="bg-total-custom font-bold text-sm"><td colspan="2" class="border border-gray-900 p-2 text-right uppercase">Valor Contratual Disponível (${anoAtual}º Ano)</td><td class="border border-gray-900 p-2 text-center ${saldoAcumulado < 0 ? 'text-red-600' : ''}">${formatMoeda(saldoAcumulado)}</td></tr></tbody></table>`;
            }
        }
        
        // Injeta as tabelas dentro da div wrapper, sem deletá-la da memória!
        wrapperCG.innerHTML = theHtml;
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
    const transicao = checkMesTransicao();
    const dados = { 
        mesRef: state.mesRef, 
        anoRef: state.anoRef, 
        itens: state.itensPeças,
        transicao: transicao
    };
    gerarPlanilhaPecasExercito(dados, document.getElementById('btn-print-parts'));
}

function handlePrintRelatorio() {
    if (!state.mesRef) return;
    const transicao = checkMesTransicao();
    const dataAlvoStr = `${state.anoRef}-${String(state.mesRef).padStart(2, '0')}-15`;
    const contratosOrdenados = [...state.configContrato].sort((a,b) => new Date(b.dataInicio) - new Date(a.dataInicio));
    
    let contratoParaPrint = contratosOrdenados[0];
    for (let c of contratosOrdenados) {
        if (dataAlvoStr >= c.dataInicio) { contratoParaPrint = c; break; }
    }
    
    let historicoControle = [];
    let historicoControleNovo = [];
    let limiteAnual = 30000;
    let limiteAnualNovo = 30000;

    // Prepara os pacotes de dados dependendo se é mês de renovação ou não
    if (transicao) {
        const controleAntigo = calcularControleGastos(transicao.anoAntigo);
        const controleNovo = calcularControleGastos(transicao.anoNovo);
        if (controleAntigo) { historicoControle = controleAntigo.historico; limiteAnual = controleAntigo.limiteAnual; }
        if (controleNovo) { historicoControleNovo = controleNovo.historico; limiteAnualNovo = controleNovo.limiteAnual; }
    } else {
        const controle = calcularControleGastos(contratoParaPrint ? contratoParaPrint.ano : 1);
        if (controle) {
            historicoControle = controle.historico;
            limiteAnual = controle.limiteAnual;
        }
    }

    const dados = { 
        mesRef: state.mesRef, 
        anoRef: state.anoRef,
        periodoTexto: document.getElementById('periodo-texto').innerText,
        textoObjeto: document.getElementById('txt-objeto').value,
        textoAtividades: document.getElementById('txt-atividades').value,
        textoIntroControle: document.getElementById('txt-intro-controle').innerText,
        textoIntroFaturamento: document.getElementById('txt-intro-faturamento') ? document.getElementById('txt-intro-faturamento').innerText : "",
        itens: state.itensPeças,
        ossImprimir: state.ossCarregadas.filter(os => document.getElementById(`chk-${os.id}`)?.checked),
        historicoControle: historicoControle,
        historicoControleNovo: historicoControleNovo,
        limiteAnual: limiteAnual,
        limiteAnualNovo: limiteAnualNovo,
        transicao: transicao,
        servicosFaturamento: getMaoDeObraCalculada(),
        anoAtual: contratoParaPrint ? contratoParaPrint.ano : 1
    };
    gerarRelatorioExercitoCompleto(dados, document.getElementById('btn-print-full'));
}

function updateUIPeriodo() {
    const last = new Date(state.anoRef, state.mesRef, 0).getDate();
    const el = document.getElementById('periodo-texto');
    if (el) el.innerText = `01/${state.mesRef}/${state.anoRef} - ${last}/${state.mesRef}/${state.anoRef}`;
}

function toggleAllCheckboxes(checked) { 
    document.querySelectorAll('#sidebar-list input').forEach(c => { c.checked = checked; }); 
}

async function salvarFechamento() {
    if (!state.mesRef) return;
    
    const btn = document.getElementById('btn-save-data');
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...';

    try {
        const total = calcularTotalGeralPecas();
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
        atualizarCardsControleGastos();
        
        btn.innerHTML = '<i class="fas fa-check"></i> Salvo!';
        setTimeout(() => { btn.innerHTML = originalText; btn.disabled = false; }, 2000);
    } catch (e) {
        console.error("Erro ao salvar:", e);
        btn.innerHTML = '<i class="fas fa-times"></i> Erro';
        btn.disabled = false;
        alert("Erro ao salvar fechamento no banco.");
    }
}