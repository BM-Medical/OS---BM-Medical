// relatorio-capao.js

// Configuração Global (Assume que firebase foi inicializado em outro script comum ou no html)
// Se não houver inicialização global, adicione aqui o firebase.initializeApp(config);
const db = firebase.firestore();

// Estado da Aplicação
const relatorioState = {
    mesSelecionado: null, // Objeto Date
    dataInicio: null,     // Objeto Date
    dataFim: null,        // Objeto Date
    ossCarregadas: [],
    modoEdicao: false,
    textosIniciais: {
        objeto: '',
        locais: ''
    }
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

    // Salva textos iniciais para referência
    relatorioState.textosIniciais.objeto = document.getElementById('texto-objeto').value;
    relatorioState.textosIniciais.locais = document.getElementById('lista-locais').value;

    console.log("Módulo Relatório Capão (138/2024) carregado.");
});

// ============================================================================
// 2. CONTROLE DE INTERFACE (UI)
// ============================================================================

function alternarModoEdicao() {
    const chk = document.getElementById('toggle-edit');
    const body = document.body;
    const inputs = document.querySelectorAll('.editable-field');
    
    relatorioState.modoEdicao = chk.checked;

    if (relatorioState.modoEdicao) {
        body.classList.add('editing');
        // Remove readonly para permitir digitação
        inputs.forEach(el => el.removeAttribute('readonly'));
    } else {
        body.classList.remove('editing');
        // Adiciona readonly de volta
        inputs.forEach(el => el.setAttribute('readonly', true));
    }
}

function mostrarCarregando(show) {
    const btn = document.getElementById('btn-update');
    const icon = btn.querySelector('i');
    
    if (show) {
        btn.disabled = true;
        btn.classList.add('opacity-75', 'cursor-not-allowed');
        icon.className = 'fas fa-spinner fa-spin mr-2';
        btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> Buscando...';
    } else {
        btn.disabled = false;
        btn.classList.remove('opacity-75', 'cursor-not-allowed');
        btn.innerHTML = '<i class="fas fa-sync-alt mr-2"></i> Buscar Dados';
    }
}

// ============================================================================
// 3. BUSCA DE DADOS (FIREBASE)
// ============================================================================

async function carregarDadosRelatorio() {
    const mesInput = document.getElementById('month-selector').value;
    if (!mesInput) {
        alert("Por favor, selecione um mês de referência.");
        return;
    }

    // 1. Calcular Datas (Início e Fim do Mês)
    const [anoStr, mesStr] = mesInput.split('-');
    const ano = parseInt(anoStr);
    const mes = parseInt(mesStr); // 1 a 12

    // Data Início: 1º dia do mês às 00:00:00
    relatorioState.dataInicio = new Date(ano, mes - 1, 1, 0, 0, 0);
    
    // Data Fim: Último dia do mês às 23:59:59
    // (new Date(ano, mes, 0) pega o último dia do mês anterior ao índice 'mes', que é o atual)
    relatorioState.dataFim = new Date(ano, mes, 0, 23, 59, 59);

    // 2. Atualizar Texto do Período na Capa
    const formatoData = { day: '2-digit', month: '2-digit', year: 'numeric' };
    const txtPeriodo = `${relatorioState.dataInicio.toLocaleDateString('pt-BR', formatoData)} - ${relatorioState.dataFim.toLocaleDateString('pt-BR', formatoData)}`;
    document.getElementById('periodo-texto').innerText = txtPeriodo;

    mostrarCarregando(true);

    try {
        // 3. Buscar OSs Finalizadas no Período
        const ossRealizadas = await buscarOSsFinalizadas(relatorioState.dataInicio, relatorioState.dataFim);
        relatorioState.ossCarregadas = ossRealizadas;

        // 4. Buscar OSs Pendentes (Abertas até o fim do mês)
        const ossPendentes = await buscarOSsPendentes();

        // 5. Processar Estatísticas para Tabela
        const estatisticas = processarEstatisticas(ossRealizadas, ossPendentes);

        // 6. Renderizar Tabela Resumo
        renderizarTabelaResumo(estatisticas);

        // 7. Renderizar Fichas das OSs (Anexo)
        await renderizarListaOSs(ossRealizadas);

    } catch (error) {
        console.error("Erro fatal ao gerar relatório:", error);
        alert("Ocorreu um erro ao buscar os dados. Verifique o console.");
    } finally {
        mostrarCarregando(false);
    }
}

// --- Funções Auxiliares de Banco de Dados ---

async function buscarOSsFinalizadas(inicio, fim) {
    console.log(`Buscando OSs entre ${inicio.toISOString()} e ${fim.toISOString()}`);
    
    // ATENÇÃO: Verifique se o campo no seu Firestore é 'date_finished', 'date_completed' ou 'date_withdrawal'.
    // Assumindo 'date_finished' (ISO String ou Timestamp)
    
    // Nota: Firestore requer Index Composto para queries com range + order. 
    // Se der erro, verifique o link no console.
    const snapshot = await db.collection('service_orders')
        .where('contract_id', '==', '138/2024') // Opcional: Filtra pelo contrato se houver campo
        .where('status', 'in', ['finished', 'completed', 'delivered']) // Ajuste conforme seus status reais
        .where('date_finished', '>=', inicio.toISOString())
        .where('date_finished', '<=', fim.toISOString())
        .get();

    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

async function buscarOSsPendentes() {
    // Busca tudo que está pendente hoje. 
    // Para histórico perfeito, precisaríamos de logs de status, mas vamos simplificar.
    const snapshot = await db.collection('service_orders')
        .where('contract_id', '==', '138/2024') // Opcional
        .where('status', 'in', ['pending', 'waiting_parts', 'open'])
        .get();

    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

// ============================================================================
// 4. PROCESSAMENTO E RENDERIZAÇÃO
// ============================================================================

function processarEstatisticas(realizadas, pendentes) {
    const stats = {};

    // Helper para normalizar nome do local
    const normalizarLocal = (loc) => loc ? loc.trim().toUpperCase() : "LOCAL NÃO INFORMADO";

    // Contar Realizadas
    realizadas.forEach(os => {
        const local = normalizarLocal(os.location || os.unity); // Ajuste campo 'location' ou 'unity'
        if (!stats[local]) stats[local] = { realizados: 0, pendentes: 0 };
        stats[local].realizados++;
    });

    // Contar Pendentes
    pendentes.forEach(os => {
        const local = normalizarLocal(os.location || os.unity);
        if (!stats[local]) stats[local] = { realizados: 0, pendentes: 0 };
        stats[local].pendentes++;
    });

    return stats;
}

function renderizarTabelaResumo(stats) {
    const tbody = document.getElementById('tabela-resumo-body');
    tbody.innerHTML = '';

    const locaisOrdenados = Object.keys(stats).sort();

    if (locaisOrdenados.length === 0) {
        tbody.innerHTML = `<tr><td colspan="3" class="border border-gray-400 px-4 py-3 text-center text-gray-500 italic">Nenhuma atividade encontrada neste período.</td></tr>`;
        return;
    }

    locaisOrdenados.forEach(local => {
        const dados = stats[local];
        const tr = document.createElement('tr');
        tr.className = "hover:bg-gray-50 transition-colors";

        tr.innerHTML = `
            <td class="border-r border-b border-gray-400 px-4 py-2 text-left font-semibold text-gray-700 text-xs">
                ${local}
            </td>
            <td class="border-r border-b border-gray-400 px-2 py-2 text-center">
                <input type="number" value="${dados.realizados}" readonly 
                       class="editable-field text-center w-full font-bold text-gray-800">
            </td>
            <td class="border-b border-gray-400 px-2 py-2 text-center">
                <input type="number" value="${dados.pendentes}" readonly 
                       class="editable-field text-center w-full text-red-600 font-medium">
            </td>
        `;
        tbody.appendChild(tr);
    });
}

async function renderizarListaOSs(listaOSs) {
    const container = document.getElementById('os-list-container');
    container.innerHTML = ''; // Limpa lista anterior

    if (listaOSs.length === 0) return;

    // Ordenar OSs por número (Ex: OS 2025081 antes de 2025082)
    // Tenta extrair número se for string "CT138.24-2025081"
    listaOSs.sort((a, b) => {
        const getNum = (str) => {
            if (!str) return 0;
            const match = str.toString().match(/(\d+)$/); // Pega últimos digitos
            return match ? parseInt(match[0]) : 0;
        };
        return getNum(a.osNumber) - getNum(b.osNumber);
    });

    // Loop de renderização
    for (const os of listaOSs) {
        // Cria container da página A4
        const pageDiv = document.createElement('div');
        pageDiv.className = 'a4-page relative mb-8 print:mb-0'; 
        pageDiv.style.pageBreakBefore = 'always';

        // Botão de Remover (Apenas Visual)
        const removeBtn = document.createElement('button');
        removeBtn.className = 'no-print absolute top-2 right-2 bg-red-100 hover:bg-red-200 text-red-600 p-2 rounded-full shadow transition z-50';
        removeBtn.title = "Remover esta OS da impressão";
        removeBtn.innerHTML = '<i class="fas fa-trash-alt"></i>';
        removeBtn.onclick = () => {
            if(confirm('Ocultar esta OS do relatório? (Ela continuará existindo no banco de dados)')) {
                pageDiv.remove();
            }
        };
        pageDiv.appendChild(removeBtn);

        // Container Interno da OS
        const contentDiv = document.createElement('div');
        contentDiv.className = 'h-full w-full'; // Ocupa toda a página
        pageDiv.appendChild(contentDiv);

        // INTEGRACAO: Chama o gerador de HTML do PDF-Generator
        if (typeof window.generateOSHTML === 'function') {
            // Se a função existir no pdf-generator.js
            const osHtml = await window.generateOSHTML(os); 
            contentDiv.innerHTML = osHtml;
        } else {
            // Fallback caso o pdf-generator.js não esteja atualizado ainda
            console.warn("Função generateOSHTML não encontrada em pdf-generator.js");
            contentDiv.innerHTML = `
                <div class="flex flex-col items-center justify-center h-full border-2 border-dashed border-gray-300 p-10">
                    <h3 class="text-xl font-bold text-gray-400">Placeholder de OS</h3>
                    <p class="text-gray-500 mt-2">OS Nº: <strong>${os.osNumber || 'S/N'}</strong></p>
                    <p class="text-gray-400 text-sm mt-4 text-center">
                        O arquivo <code>pdf-generator.js</code> precisa ser atualizado para exportar a função <code>generateOSHTML(osData)</code>.
                    </p>
                </div>
            `;
        }

        container.appendChild(pageDiv);
    }
}