import { initializeApp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-app.js";
import { getFirestore, collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js";

// --- CONFIGURAÇÃO DO FIREBASE ---
// Usa a configuração global OU a chave colada manualmente
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

// Estado da Aplicação
const relatorioState = {
    mesSelecionado: null,
    dataInicioStr: null,
    dataFimStr: null,
    ossCarregadas: [],
    modoEdicao: false,
    textosIniciais: { objeto: '', locais: '' },
    usuarioLogado: null,
    authCarregado: false
};

// ============================================================================
// 1. INICIALIZAÇÃO
// ============================================================================

document.addEventListener('DOMContentLoaded', () => {
    // Define mês atual no seletor
    const hoje = new Date();
    const ano = hoje.getFullYear();
    const mes = String(hoje.getMonth() + 1).padStart(2, '0');
    document.getElementById('month-selector').value = `${ano}-${mes}`;

    // Listeners
    document.getElementById('btn-update').addEventListener('click', carregarDadosRelatorio);
    document.getElementById('month-selector').addEventListener('change', () => {
        // Opcional: Auto carregar ao mudar mês
    });

    // Monitora o estado de autenticação (Padrão do sistema)
    onAuthStateChanged(auth, (user) => {
        relatorioState.authCarregado = true;
        if (user) {
            console.log("Usuário detectado:", user.email || user.uid);
            relatorioState.usuarioLogado = user;
        } else {
            console.warn("Nenhum usuário logado.");
            relatorioState.usuarioLogado = null;
            // Se quiser redirecionar automaticamente como o auth-guard:
            // window.location.href = "login.html";
        }
    });

    console.log("Módulo Relatório Capão (138/2024) carregado - Modo Seguro (Sem Auth Anônima).");
});

// ============================================================================
// 2. FUNÇÕES DE BUSCA (MODULAR SDK)
// ============================================================================

async function carregarDadosRelatorio() {
    // 1. Verifica se a verificação de auth já terminou
    if (!relatorioState.authCarregado) {
        alert("Aguarde, verificando credenciais...");
        return;
    }

    // 2. Bloqueia se não estiver logado (Igual ao auth-guard)
    if (!relatorioState.usuarioLogado) {
        const confirmar = confirm("Você não está logado no sistema.\nPara acessar os dados, é necessário fazer login.\n\nDeseja ir para a tela de login agora?");
        if (confirmar) {
            window.location.href = "login.html";
        }
        return;
    }

    const mesInput = document.getElementById('month-selector').value;
    if (!mesInput) { alert("Selecione um mês."); return; }

    const [anoStr, mesStr] = mesInput.split('-');
    
    // Datas em String YYYY-MM-DD
    const dataInicioStr = `${anoStr}-${mesStr}-01`;
    const ultimoDia = new Date(parseInt(anoStr), parseInt(mesStr), 0).getDate();
    const dataFimStr = `${anoStr}-${mesStr}-${String(ultimoDia).padStart(2, '0')}`;

    // Atualiza texto na tela (Formato visual)
    const dataInicioObj = new Date(parseInt(anoStr), parseInt(mesStr) - 1, 1);
    const dataFimObj = new Date(parseInt(anoStr), parseInt(mesStr) - 1, ultimoDia);
    const fmt = { day: '2-digit', month: '2-digit', year: 'numeric' };
    document.getElementById('periodo-texto').innerText = `${dataInicioObj.toLocaleDateString('pt-BR', fmt)} - ${dataFimObj.toLocaleDateString('pt-BR', fmt)}`;

    mostrarCarregando(true);

    try {
        console.log("Iniciando busca de OSs...");

        // Busca TUDO do contrato 138/2024
        const q = query(
            collection(db, "orders"), 
            where("contrato", "==", "Contrato Nº 138/2024")
        );

        const snapshot = await getDocs(q);
        const todasFinalizadas = [];
        const todasPendentes = [];

        snapshot.forEach(doc => {
            const data = doc.data();
            const os = { id: doc.id, ...data };

            // Lógica de Filtro no Cliente
            if (data.status === 'finalizada') {
                // Verifica Data da conclusão
                if (data.data_conclusao && data.data_conclusao >= dataInicioStr && data.data_conclusao <= dataFimStr) {
                    todasFinalizadas.push(os);
                }
            } else if (['novas', 'em_execucao', 'aguardando_pecas', 'pronto_entrega'].includes(data.status)) {
                // É uma pendente
                todasPendentes.push(os);
            }
        });

        console.log(`Encontradas: ${todasFinalizadas.length} finalizadas e ${todasPendentes.length} pendentes.`);

        relatorioState.ossCarregadas = todasFinalizadas;

        // Processar e Renderizar
        const estatisticas = processarEstatisticas(todasFinalizadas, todasPendentes);
        renderizarTabelaResumo(estatisticas);
        renderizarListaOSs(todasFinalizadas);

    } catch (error) {
        console.error("Erro detalhado ao gerar relatório:", error);
        alert(`Erro ao buscar dados: ${error.message}\nVerifique o console.`);
    } finally {
        mostrarCarregando(false);
    }
}

// ============================================================================
// 3. PROCESSAMENTO E RENDERIZAÇÃO
// ============================================================================

function processarEstatisticas(realizadas, pendentes) {
    const stats = {};

    // Função para normalizar nomes de locais
    const normalizar = (str) => {
        if(!str) return "LOCAL NÃO INFORMADO";
        let s = str.toUpperCase().trim();
        // Agrupamentos comuns
        if(s.includes('PRONTO') || s === 'PA') return 'PRONTO ATENDIMENTO';
        if(s.includes('CASABOM')) return 'UBS CASABOM';
        if(s.includes('CENTRAL')) return 'UBS CENTRAL';
        if(s.includes('FRAGATA')) return 'UBS PARQUE FRAGATA';
        if(s.includes('AMÉRICA') || s.includes('AMERICA')) return 'UBS JARDIM AMÉRICA';
        if(s.includes('CAPS')) return 'CAPS';
        if(s.includes('UFPEL')) return 'UBS CAMPUS UFPEL';
        return s;
    };

    // Inicializa Stats com contadores
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
    const locais = Object.keys(stats).sort();

    if (locais.length === 0) {
        tbody.innerHTML = `<tr><td colspan="3" class="border border-gray-900 px-4 py-3 text-center text-gray-500 italic">Nenhum dado encontrado para o período.</td></tr>`;
        return;
    }

    let totalRealizados = 0;
    let totalPendentes = 0;

    locais.forEach(local => {
        const d = stats[local];
        totalRealizados += d.realizados;
        totalPendentes += d.pendentes;
        
        const tr = document.createElement('tr');
        tr.className = "hover:bg-gray-50";
        tr.innerHTML = `
            <td class="border border-gray-900 px-3 py-1 text-left font-semibold text-gray-800 text-xs">${local}</td>
            <td class="border border-gray-900 px-2 py-1 text-center font-bold">${d.realizados}</td>
            <td class="border border-gray-900 px-2 py-1 text-center font-bold text-red-600">${d.pendentes}</td>
        `;
        tbody.appendChild(tr);
    });

    // Linha Total
    const trTotal = document.createElement('tr');
    trTotal.className = "bg-gray-200 font-bold";
    trTotal.innerHTML = `
        <td class="border border-gray-900 px-3 py-1 text-right text-xs uppercase">Total Geral</td>
        <td class="border border-gray-900 px-2 py-1 text-center">${totalRealizados}</td>
        <td class="border border-gray-900 px-2 py-1 text-center text-red-700">${totalPendentes}</td>
    `;
    tbody.appendChild(trTotal);
}

function renderizarListaOSs(listaOSs) {
    const container = document.getElementById('os-list-container');
    container.innerHTML = '';

    // Ordenar por data de conclusão
    listaOSs.sort((a, b) => (a.data_conclusao || '').localeCompare(b.data_conclusao || ''));

    listaOSs.forEach(os => {
        const pageDiv = document.createElement('div');
        pageDiv.className = 'a4-page relative mb-8 print:mb-0 print:shadow-none print:m-0';
        pageDiv.style.pageBreakBefore = 'always';

        // Botão remover (UI apenas)
        const btnRemove = document.createElement('button');
        btnRemove.className = 'no-print absolute top-2 right-2 text-red-400 hover:text-red-600 p-2';
        btnRemove.innerHTML = '<i class="fas fa-trash"></i>';
        btnRemove.onclick = () => {
            if(confirm("Remover esta página da impressão?")) pageDiv.remove();
        };
        pageDiv.appendChild(btnRemove);

        // Renderiza o HTML da OS
        pageDiv.innerHTML += renderOSHTML(os);
        container.appendChild(pageDiv);
    });
}

// ============================================================================
// 4. GERADOR DE HTML DA FICHA DE OS (ANEXO I)
// ============================================================================
function renderOSHTML(os) {
    // Formata datas
    const fmt = (d) => {
        if(!d) return '___/___/____';
        const [y, m, da] = d.split('-');
        return `${da}/${m}/${y}`;
    }

    const isLote = os.equipamento && os.equipamento.includes('(LOTE');
    
    // Tratamento de assinatura
    let assinaturaImg = '';
    if (os.assinaturaDesconsiderada) {
        assinaturaImg = '<div class="text-xs text-gray-500 italic border border-gray-300 p-2 rounded bg-gray-50 text-center">Assinatura Dispensada/Desconsiderada</div>';
    } else if (os.signature_data) {
        assinaturaImg = `<img src="${os.signature_data}" class="h-16 object-contain mx-auto" alt="Assinatura Cliente">`;
    } else {
        assinaturaImg = '<div class="h-16 border-b border-gray-400"></div>';
    }

    // Detalhes do Equipamento
    let detalhesEquipamento = '';
    if (isLote && os.itens && os.itens.length > 0) {
        // Tabela para lote
        const rows = os.itens.map(item => `
            <tr class="text-xs">
                <td class="border px-1">${item.nome}</td>
                <td class="border px-1">${item.marca}/${item.modelo}</td>
                <td class="border px-1 text-center">${item.serial}</td>
                <td class="border px-1 text-center">${item.patrimonio || '-'}</td>
                <td class="border px-1">${item.local || '-'}</td>
            </tr>
        `).join('');
        
        detalhesEquipamento = `
            <div class="mt-2">
                <p class="font-bold text-xs mb-1">Itens do Lote:</p>
                <table class="w-full border-collapse border border-gray-300">
                    <thead class="bg-gray-100">
                        <tr class="text-xs text-left"><th class="px-1">Equip.</th><th class="px-1">Marca/Mod.</th><th class="px-1">Serial</th><th class="px-1">Pat.</th><th class="px-1">Local</th></tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>`;
    } else {
        // Item único
        detalhesEquipamento = `
            <div class="grid grid-cols-2 gap-4 mt-2 text-sm">
                <div><span class="font-bold">Marca:</span> ${os.marca || '-'}</div>
                <div><span class="font-bold">Modelo:</span> ${os.modelo || '-'}</div>
                <div><span class="font-bold">Nº Série:</span> ${os.serial || '-'}</div>
                <div><span class="font-bold">Patrimônio:</span> ${os.patrimonio || '-'}</div>
            </div>`;
    }

    // Peças
    let pecasHtml = 'Nenhuma peça utilizada.';
    if (os.pecas_utilizadas && os.pecas_utilizadas.length > 0) {
        pecasHtml = `<ul class="list-disc pl-4 text-sm">${os.pecas_utilizadas.map(p => `<li>${p.qtd}x ${p.descricao}</li>`).join('')}</ul>`;
    }

    return `
        <div class="border-2 border-gray-800 p-6 h-full flex flex-col justify-between">
            
            <!-- Cabeçalho OS -->
            <div class="flex justify-between items-start border-b-2 border-gray-800 pb-4 mb-4">
                <img src="./images/logo.png" class="h-12 object-contain" alt="Logo">
                <div class="text-right">
                    <h2 class="text-xl font-black text-gray-900">ORDEM DE SERVIÇO</h2>
                    <p class="text-lg text-red-600 font-bold">Nº ${os.os_numero || 'PENDENTE'}</p>
                    <p class="text-xs font-bold mt-1 uppercase bg-gray-200 px-2 py-1 rounded inline-block">${os.tipo_manutencao || 'Manutenção'}</p>
                </div>
            </div>

            <!-- Corpo -->
            <div class="flex-grow space-y-4">
                
                <!-- Info Básica -->
                <div class="grid grid-cols-2 gap-4 text-sm border-b border-gray-300 pb-2">
                    <div>
                        <span class="block font-bold text-xs uppercase text-gray-500">Cliente / Local</span>
                        <div class="font-bold text-gray-900">${os.local_atendimento || 'N/A'}</div>
                        <div class="text-xs text-gray-600">Contrato: ${os.contrato}</div>
                    </div>
                    <div class="text-right">
                        <div class="mb-1"><span class="font-bold">Data Solicitação/Retirada:</span> ${fmt(os.data_retirada || os.data_servico)}</div>
                        <div><span class="font-bold">Data Conclusão/Devolução:</span> ${fmt(os.data_conclusao || os.data_devolucao)}</div>
                    </div>
                </div>

                <!-- Equipamento -->
                <div class="bg-gray-50 p-3 rounded border border-gray-200">
                    <div class="font-bold text-blue-900 border-b border-gray-200 mb-2 uppercase text-xs">Equipamento</div>
                    <div class="text-base font-bold text-gray-800">${os.equipamento || 'NÃO IDENTIFICADO'}</div>
                    ${detalhesEquipamento}
                </div>

                <!-- Defeito / Serviços -->
                <div>
                    <div class="font-bold text-xs uppercase text-gray-500 mb-1">Serviços Realizados</div>
                    <div class="border border-gray-300 p-3 rounded bg-white text-sm min-h-[80px] text-justify whitespace-pre-wrap leading-relaxed">${os.servicos_realizados || 'Nenhum serviço descrito.'}</div>
                </div>

                <!-- Peças -->
                <div>
                    <div class="font-bold text-xs uppercase text-gray-500 mb-1">Peças / Materiais</div>
                    <div class="border border-gray-300 p-3 rounded bg-white text-sm min-h-[40px]">${pecasHtml}</div>
                </div>

            </div>

            <!-- Assinaturas -->
            <div class="mt-6 pt-4 border-t-2 border-gray-800 grid grid-cols-2 gap-8">
                <div class="text-center">
                    <div class="h-16 flex items-end justify-center pb-2">
                        ${assinaturaImg}
                    </div>
                    <div class="border-t border-gray-400 pt-1">
                        <p class="font-bold text-xs uppercase">Responsável pelo Local</p>
                    </div>
                </div>
                <div class="text-center">
                    <div class="h-16 flex items-end justify-center pb-2">
                        <img src="./images/assinatura-tecnico.png" class="h-12 object-contain mx-auto" alt="Técnico">
                    </div>
                    <div class="border-t border-gray-400 pt-1">
                        <p class="font-bold text-xs uppercase">Técnico Responsável</p>
                        <p class="text-[10px] text-gray-500">BM Medical Manutenção</p>
                    </div>
                </div>
            </div>
            
            <!-- Rodapé Página -->
            <div class="text-center mt-4 text-[10px] text-gray-400">
                Documento gerado eletronicamente em ${new Date().toLocaleDateString('pt-BR')} via Sistema BM Medical.
            </div>
        </div>
    `;
}

// Helpers UI
function mostrarCarregando(show) {
    const btn = document.getElementById('btn-update');
    if(show) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> ...';
    } else {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-sync-alt mr-2"></i> Atualizar';
    }
}