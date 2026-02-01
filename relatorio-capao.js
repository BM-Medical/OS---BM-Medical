import { initializeApp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-app.js";
import { getFirestore, collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js";
import { gerarRelatorioPDFCompleto } from './pdf-generator-relatcapao.js';

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

const relatorioState = {
    mesSelecionado: null, dataInicioStr: null, dataFimStr: null,
    ossCarregadas: [], ossPendentes: [], modoEdicao: false,
    textosIniciais: { objeto: '', locais: '' }, usuarioLogado: null, authCarregado: false, periodoTexto: ''
};

const LOCAIS_TABELA_FIXA = [
    "SECRETARIA DE SAÚDE", "PRONTO ATENDIMENTO", "UBS PARQUE FRAGATA",
    "UBS JARDIM AMÉRICA II", "UBS JARDIM AMÉRICA III", "UBS CASABOM",
    "UBS CENTRAL", "UBS CAMPUS UFPEL", "CAPS"
];

document.addEventListener('DOMContentLoaded', () => {
    const hoje = new Date();
    const ano = hoje.getFullYear();
    const mes = String(hoje.getMonth() + 1).padStart(2, '0');
    document.getElementById('month-selector').value = `${ano}-${mes}`;

    document.getElementById('btn-update').addEventListener('click', carregarDadosRelatorio);
    document.getElementById('btn-print-pdf').addEventListener('click', handlePrintPDF);
    document.getElementById('btn-sel-all').addEventListener('click', () => toggleAllCheckboxes(true));
    document.getElementById('btn-sel-none').addEventListener('click', () => toggleAllCheckboxes(false));

    const btnToggle = document.getElementById('btn-toggle-sidebar');
    const sidebar = document.getElementById('os-selection-sidebar');
    if(btnToggle && sidebar) {
        btnToggle.addEventListener('click', () => {
            sidebar.classList.toggle('collapsed');
            const icon = btnToggle.querySelector('i');
            if (sidebar.classList.contains('collapsed')) {
                icon.classList.remove('fa-chevron-right');
                icon.classList.add('fa-chevron-left');
            } else {
                icon.classList.remove('fa-chevron-left');
                icon.classList.add('fa-chevron-right');
            }
        });
    }

    onAuthStateChanged(auth, (user) => {
        relatorioState.authCarregado = true;
        if (user) { relatorioState.usuarioLogado = user; } 
        else { relatorioState.usuarioLogado = null; }
    });

    console.log("Módulo Relatório Capão (138/2024) carregado.");
});

async function handlePrintPDF() {
    const btn = document.getElementById('btn-print-pdf');
    const ossParaImprimir = relatorioState.ossCarregadas.filter(os => {
        const chk = document.getElementById(`chk-${os.id}`);
        return chk && chk.checked;
    });

    if (ossParaImprimir.length === 0) { alert("Selecione ao menos uma OS."); return; }

    const dados = {
        ossImprimir: ossParaImprimir,
        ossPendentes: relatorioState.ossPendentes || [],
        periodoTexto: relatorioState.periodoTexto,
        mesRef: document.getElementById('month-selector').value,
        textoObjeto: document.getElementById('texto-objeto').value,
        textoAtividadesIntro: document.getElementById('texto-atividades-intro').value,
        textoAtividadesFooter: document.getElementById('texto-atividades-footer').value,
        textoLocais: document.getElementById('lista-locais').value.replace(/^[ \t]*•[ \t]*/gm, '')
    };

    await gerarRelatorioPDFCompleto(dados, btn);
}

async function carregarDadosRelatorio() {
    if (!relatorioState.authCarregado) { alert("Aguarde..."); return; }
    if (!relatorioState.usuarioLogado) { if(confirm("Ir para login?")) window.location.href = "login.html"; return; }

    const mesInput = document.getElementById('month-selector').value;
    if (!mesInput) { alert("Selecione um mês."); return; }

    const [anoStr, mesStr] = mesInput.split('-');
    const dataInicioStr = `${anoStr}-${mesStr}-01`;
    const ultimoDia = new Date(parseInt(anoStr), parseInt(mesStr), 0).getDate();
    const dataFimStr = `${anoStr}-${mesStr}-${String(ultimoDia).padStart(2, '0')}`;

    const dataInicioObj = new Date(parseInt(anoStr), parseInt(mesStr) - 1, 1);
    const dataFimObj = new Date(parseInt(anoStr), parseInt(mesStr) - 1, ultimoDia);
    const fmt = { day: '2-digit', month: '2-digit', year: 'numeric' };
    
    relatorioState.periodoTexto = `${dataInicioObj.toLocaleDateString('pt-BR', fmt)} - ${dataFimObj.toLocaleDateString('pt-BR', fmt)}`;
    document.getElementById('periodo-texto').innerText = relatorioState.periodoTexto;

    mostrarCarregando(true);

    try {
        const q = query(collection(db, "orders"), where("contrato", "==", "Contrato Nº 138/2024"));
        const snapshot = await getDocs(q);
        const todasFinalizadas = [];
        const todasPendentes = [];

        snapshot.forEach(doc => {
            const data = doc.data();
            const os = { id: doc.id, ...data };
            if (data.status === 'finalizada') {
                if (data.data_conclusao && data.data_conclusao >= dataInicioStr && data.data_conclusao <= dataFimStr) {
                    todasFinalizadas.push(os);
                }
            } else if (['novas', 'em_execucao', 'aguardando_pecas', 'pronto_entrega'].includes(data.status)) {
                todasPendentes.push(os);
            }
        });

        const extrairNumeroOS = (os) => { const m = (os.os_numero || '').match(/(\d+)$/); return m ? parseInt(m[0], 10) : 0; };
        todasFinalizadas.sort((a, b) => extrairNumeroOS(a) - extrairNumeroOS(b));

        relatorioState.ossCarregadas = todasFinalizadas;
        relatorioState.ossPendentes = todasPendentes;

        const estatisticas = processarEstatisticas(todasFinalizadas, todasPendentes);
        renderizarTabelaResumo(estatisticas);
        
        renderizarListaOSs(todasFinalizadas);
        renderizarMenuLateral(todasFinalizadas);

    } catch (error) { console.error("Erro:", error); alert(`Erro: ${error.message}`); } 
    finally { mostrarCarregando(false); }
}

function renderizarMenuLateral(listaOSs) {
    const sidebar = document.getElementById('os-selection-sidebar');
    const listContainer = document.getElementById('sidebar-list');
    listContainer.innerHTML = '';

    if (listaOSs.length === 0) { sidebar.classList.add('hidden'); return; }
    sidebar.classList.remove('hidden');
    updateCounter(listaOSs.length, listaOSs.length);

    listaOSs.forEach(os => {
        const row = document.createElement('div');
        row.className = "flex items-start p-2 border-b border-gray-100 hover:bg-gray-100 transition rounded cursor-pointer";
        const num = os.os_numero || 'S/N';
        const data = os.data_conclusao ? os.data_conclusao.split('-').reverse().join('/') : '-';
        const equip = os.equipamento ? (os.equipamento.length > 20 ? os.equipamento.substring(0, 18) + '...' : os.equipamento) : 'Equipamento';

        row.innerHTML = `
            <input type="checkbox" id="chk-${os.id}" checked class="mt-1 mr-2 cursor-pointer h-4 w-4 text-blue-600 rounded">
            <label for="chk-${os.id}" class="cursor-pointer flex-grow">
                <div class="flex justify-between items-center"><span class="font-bold text-gray-800 text-xs">${num}</span><span class="text-[10px] text-gray-500">${data}</span></div>
                <div class="text-[10px] text-gray-600 truncate w-48" title="${os.equipamento}">${equip}</div>
            </label>`;
        
        const checkbox = row.querySelector('input');
        checkbox.addEventListener('change', (e) => {
            const pageId = `page-os-${os.id}`;
            const pageElement = document.getElementById(pageId);
            if (pageElement) {
                if (e.target.checked) { pageElement.classList.remove('hidden'); pageElement.classList.add('flex'); } 
                else { pageElement.classList.add('hidden'); pageElement.classList.remove('flex'); }
            }
            const total = listaOSs.length;
            const checked = listContainer.querySelectorAll('input:checked').length;
            updateCounter(checked, total);
        });
        listContainer.appendChild(row);
    });
}

function updateCounter(checked, total) { document.getElementById('count-selected').textContent = `${checked}/${total}`; }
function toggleAllCheckboxes(state) {
    document.querySelectorAll('#sidebar-list input[type="checkbox"]').forEach(chk => { chk.checked = state; chk.dispatchEvent(new Event('change')); });
}

function processarEstatisticas(realizadas, pendentes) {
    const stats = {};
    const normalizar = (str) => {
        if(!str) return "OUTROS";
        const s = str.toUpperCase().trim();
        if(s.includes("SECRETARIA")) return "SECRETARIA DE SAÚDE";
        if(s.includes("PRONTO") || s === "PA") return "PRONTO ATENDIMENTO";
        if(s.includes("FRAGATA")) return "UBS PARQUE FRAGATA";
        if(s.includes("AMÉRICA III") || s.includes("AMERICA III") || (s.includes("AMÉRICA") && s.includes("III"))) return "UBS JARDIM AMÉRICA III";
        if(s.includes("AMÉRICA II") || s.includes("AMERICA II") || (s.includes("AMÉRICA") && s.includes("II"))) return "UBS JARDIM AMÉRICA II";
        if(s.includes("CASABOM") || s.includes("CASA BOM")) return "UBS CASABOM";
        if(s.includes("CENTRAL")) return "UBS CENTRAL";
        if(s.includes("UFPEL")) return "UBS CAMPUS UFPEL";
        if(s.includes("CAPS")) return "CAPS";
        return "OUTROS";
    };

    const registrar = (lista, tipo) => {
        lista.forEach(os => {
            const local = normalizar(os.local_atendimento);
            if (!stats[local]) stats[local] = { realizados: 0, pendentes: 0 };
            stats[local][tipo]++;
        });
    };
    registrar(realizadas, 'realizados');
    registrar(pendentes, 'pendentes');
    return stats;
}

function renderizarTabelaResumo(stats) {
    const tbody = document.getElementById('tabela-resumo-body');
    tbody.innerHTML = '';
    
    LOCAIS_TABELA_FIXA.forEach(local => {
        const d = stats[local] || { realizados: 0, pendentes: 0 };
        const tr = document.createElement('tr');
        tr.className = "hover:bg-gray-50";
        tr.innerHTML = `
            <td class="border border-gray-900 px-3 py-1 text-left font-semibold text-gray-800 text-xs">${local}</td>
            <td class="border border-gray-900 px-2 py-1 text-center font-bold">${d.realizados}</td>
            <td class="border border-gray-900 px-2 py-1 text-center font-bold text-gray-900">${d.pendentes}</td>
        `;
        tbody.appendChild(tr);
    });
}

function renderizarListaOSs(listaOSs) {
    const container = document.getElementById('os-list-container');
    container.innerHTML = '';
    listaOSs.forEach(os => {
        const pageDiv = document.createElement('div');
        pageDiv.className = 'a4-page relative mb-8 print:mb-0 print:shadow-none print:m-0 flex flex-col';
        pageDiv.style.pageBreakBefore = 'always';
        pageDiv.id = `page-os-${os.id}`;
        
        pageDiv.innerHTML += renderOSHTML(os);
        container.appendChild(pageDiv);
    });
}

function renderOSHTML(os) {
    const fmt = (d) => { if(!d) return ''; const [y, m, da] = d.split('-'); return `${da}/${m}/${y}`; }
    const isLote = os.equipamento && os.equipamento.includes('(LOTE');
    let assinaturaImg = '';
    if (os.assinaturaDesconsiderada) { assinaturaImg = '<div class="text-[10px] text-gray-500 italic p-2 text-center">Assinatura Desconsiderada</div>'; }
    else if (os.signature_data) { assinaturaImg = `<img src="${os.signature_data}" class="h-16 object-contain mx-auto" alt="Assinatura Cliente">`; }
    else { assinaturaImg = '<div class="h-16"></div>'; }
    const tipoManutencao = os.tipo_manutencao === 'preventiva' ? 'MP - Manutenção Preventiva' : 'MC - Manutenção Corretiva';
    let linhasPecas = '';
    if (os.pecas_utilizadas && os.pecas_utilizadas.length > 0) {
        os.pecas_utilizadas.forEach((peca, idx) => {
            linhasPecas += `<div class="grid grid-cols-12 text-xs py-1 border-t border-gray-300"><div class="col-span-1 text-center font-bold">${idx + 1}</div><div class="col-span-2 text-center">${peca.qtd}</div><div class="col-span-9 pl-2">${peca.descricao}</div></div>`;
        });
    } else { linhasPecas = '<div class="text-xs text-gray-500 italic py-2 text-center border-t border-gray-300">Nenhuma peça utilizada.</div>'; }
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
                <h2 class="text-xl font-bold text-gray-800 mb-1">OS ${os.os_numero || 'PENDENTE'}</h2>
                <p class="text-sm font-bold text-gray-700 uppercase tracking-wide">${tipoManutencao}</p>
            </div>
            <div class="space-y-4 flex-grow">
                <div class="${boxClass}"><h3 class="${titleClass}">Dados do Cliente</h3><div class="${lineClass}"></div><div class="text-xs space-y-1 pl-1"><p><span class="font-bold w-20 inline-block">Contrato:</span> ${os.contrato || '-'}</p><p><span class="font-bold w-20 inline-block">Cliente:</span> Secretaria Municipal de Saúde De Capão Do Leão</p><p><span class="font-bold w-20 inline-block">Endereço:</span> Av. Narciso Silva, 2360, Capão Do Leão - RS</p></div></div>
                <div class="${boxClass}"><h3 class="${titleClass}">Dados do Equipamento</h3><div class="${lineClass}"></div><div class="text-xs grid grid-cols-2 gap-x-8 gap-y-1 pl-1"><div class="flex"><span class="font-bold w-24 inline-block">Equipamento:</span> <span>${os.equipamento || '-'}</span></div><div class="flex"><span class="font-bold w-24 inline-block">Marca:</span> <span>${os.marca || '-'}</span></div><div class="flex"><span class="font-bold w-24 inline-block">Modelo:</span> <span>${os.modelo || '-'}</span></div><div class="flex"><span class="font-bold w-24 inline-block">Serial:</span> <span>${os.serial || '-'}</span></div></div>${isLote ? `<div class="text-[10px] text-gray-500 italic mt-1 pl-1">(Ver anexo para lista completa do lote)</div>` : ''}</div>
                <div class="${boxClass}"><h3 class="${titleClass}">Atendimento</h3><div class="${lineClass}"></div><div class="text-xs grid grid-cols-2 gap-x-8 gap-y-1 pl-1"><div><span class="font-bold w-28 inline-block">Data da Retirada:</span> ${fmt(os.data_retirada || os.data_servico)}</div><div><span class="font-bold w-28 inline-block">Data da Devolução:</span> ${fmt(os.data_conclusao || os.data_devolucao)}</div><div class="col-span-2"><span class="font-bold w-28 inline-block">Local:</span> ${os.local_atendimento || '-'}</div></div></div>
                <div class="${boxClass}"><h3 class="${titleClass}">Descrição dos Serviços Realizados</h3><div class="${lineClass}"></div><div class="text-xs text-justify leading-relaxed p-1 min-h-[60px]">${os.servicos_realizados || 'Nenhum serviço descrito.'}</div></div>
                <div class="${boxClass}"><h3 class="${titleClass}">Peças Utilizadas</h3><div class="${lineClass}"></div><div class="border border-gray-300 rounded overflow-hidden mt-1"><div class="grid grid-cols-12 bg-gray-100 text-[10px] font-bold py-1 border-b border-gray-300 text-black"><div class="col-span-1 text-center">Item</div><div class="col-span-2 text-center">Qtd.</div><div class="col-span-9 pl-2">Descrição</div></div>${linhasPecas}</div></div>
            </div>
            <div class="mt-auto grid grid-cols-2 gap-12 pt-2">
                <div class="text-center relative"><div class="flex justify-center items-end h-16 pb-1">${assinaturaImg}</div><div class="border-t border-gray-400 w-3/4 mx-auto pt-1"><p class="font-bold text-xs uppercase text-gray-800">Responsável do Setor</p></div></div>
                <div class="text-center relative"><div class="flex justify-center items-end h-16 pb-1"><img src="./images/assinatura-tecnico.png" class="h-16 object-contain" alt="Técnico"></div><div class="border-t border-gray-400 w-3/4 mx-auto pt-1"><p class="font-bold text-xs uppercase text-gray-800">Responsável Técnico</p><p class="text-[10px] text-gray-500 font-medium">BM Medical Manutenção</p></div></div>
            </div>
        </div>`;
}

function mostrarCarregando(show) {
    const btn = document.getElementById('btn-update');
    if(show) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> ...'; } 
    else { btn.disabled = false; btn.innerHTML = '<i class="fas fa-sync-alt mr-2"></i> Atualizar'; }
}