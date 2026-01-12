/**
 * escala-sobreaviso.js
 * Script principal para a página de Gestão de Escala de Sobreaviso.
 * ATUALIZADO: Passa a lista completa de atendimentos para o gerador de relatório mensal.
 */

// Importa as funções necessárias do Firebase
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-app.js";
import { 
    getFirestore, doc, getDoc, setDoc, collection, addDoc, getDocs, 
    query, onSnapshot, updateDoc, deleteDoc
} from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";

// Importa os novos módulos
import { SignaturePadManager } from './signature-pad-helper.js';
// ATUALIZADO: Importa ambas as funções do módulo de atendimento
import { generateAtendimentoPdf, drawAtendimentoPage } from './pdf-generator-atendimento.js';
// Importa o módulo do relatório mensal
import { generateMonthlyReportPDF } from './pdf-generator-sobreaviso.js';

// Configuração do Firebase
const firebaseConfig = {
    apiKey: "AIzaSyC8L8dTkuL_KxvW_-m7V3c0UmYwV-gbQfE",
    authDomain: "ordem-de-servicos---bm-medical.firebaseapp.com",
    projectId: "ordem-de-servicos---bm-medical",
    storageBucket: "ordem-de-servicos---bm-medical.firebasestorage.app",
    messagingSenderId: "92355637827",
    appId: "1:92355637827:web:850b89afa5054781475af6"
};

// Inicializa o Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// --- CONFIGURAÇÕES E CONSTANTES ---
const TECHNICIANS = ["Jonas da Silva", "Miguel Martins", "Siberi Eslabão"];
const HOLIDAYS_LIST = {}; 

const STANDBY_HOURS = {
    WEEKDAY: 13.75,
    FRIDAY: 14.75,
    WEEKEND_HOLIDAY: 24,
    MONDAY_MORNING: 7.75,
    MONDAY_NIGHT: 6,
    MONDAY_WORKDAY: 10.25,
    ASH_WEDNESDAY_MORNING: 5.25
};

const HOLIDAYS_CONFIG = {
    fixed: {
        '01-01': 'Confraternização Universal', '02-02': 'Nossa Senhora dos Navegantes', '04-21': 'Tiradentes',
        '05-01': 'Dia do Trabalhador', '09-07': 'Independência do Brasil', '09-20': 'Revolução Farroupilha',
        '10-12': 'Nossa Senhora Aparecida', '11-02': 'Dia de Finados', '11-15': 'Proclamação da República',
        '11-20': 'Dia da Consciência Negra', '12-25': 'Natal'
    },
    movable: [
        { id: 'carnival-date', name: 'Carnaval', months: [2, 3] },
        { id: 'good-friday-date', name: 'Paixão de Cristo', months: [4] },
        { id: 'corpus-christi-date', name: 'Corpus Christi', months: [6] }
    ]
};

const REFERENCE_DATE = new Date('2025-09-29T00:00:00');
const REFERENCE_TECHNICIAN_INDEX = 0;

// --- ELEMENTOS DO DOM ---
const monthSelector = document.getElementById('month-selector');
const scheduleBody = document.getElementById('schedule-body');
const summaryBody = document.getElementById('summary-body');
const holidaysListDiv = document.getElementById('holidays-list');
const movableHolidaysManager = document.getElementById('movable-holidays-manager');
const movableHolidayYearSpan = document.getElementById('movable-holiday-year');
const btnGenerateReport = document.getElementById('btn-generate-pdf');
const btnLaunchAtendimento = document.getElementById('btn-launch-atendimento');
const atendimentoModal = document.getElementById('atendimento-modal');
const atendimentoForm = document.getElementById('atendimento-form');
const btnCancelAtendimento = document.getElementById('btn-cancel-atendimento');
const atendimentosListDiv = document.getElementById('atendimentos-list');
const signatureContainer = document.getElementById('signature-container');
const signatureDataInput = document.getElementById('signature-data');
const osNumeroInput = document.getElementById('os_numero');
const executadoPorSelect = document.getElementById('executado_por');
const dataAtendimentoInput = document.getElementById('data');
const semOsCheckbox = document.getElementById('sem_os_checkbox'); 
const deleteModal = document.getElementById('delete-modal');
const btnConfirmDelete = document.getElementById('btn-confirm-delete');
const btnCancelDelete = document.getElementById('btn-cancel-delete');

// --- Variáveis de estado ---
let currentAtendimentoId = null; 
let currentAtendimentoIdToDelete = null;
let atendimentosCache = new Map(); // ATENÇÃO: Este cache contém os dados completos
let unsubscribeAtendimentos = null;
let pdfScheduleData = [];
let pdfSummaryData = [];
let pdfAtendimentosData = []; // Este é apenas para a tabela resumo

// --- INICIALIZAÇÃO DO SIGNATURE PAD ---
const signaturePadManager = new SignaturePadManager({
    modal: document.getElementById('signature-modal'), canvas: document.getElementById('signature-pad'),
    saveButton: document.getElementById('signature-save-button'), clearButton: document.getElementById('signature-clear-button'),
    undoButton: document.getElementById('signature-undo-button'), cancelButton: document.getElementById('signature-cancel-button'),
    errorMessage: document.getElementById('signature-error-message')
});

// --- FUNÇÕES PRINCIPAIS ---

async function generateAndDisplaySchedule(year, month) {
    scheduleBody.innerHTML = '<tr><td colspan="9" class="p-4 text-center text-gray-500">Gerando...</td></tr>';
    
    updateMovableHolidaysUI(year, month);
    Object.keys(HOLIDAYS_LIST).forEach(key => delete HOLIDAYS_LIST[key]); 
    Object.assign(HOLIDAYS_LIST, getHolidaysForMonth(year, month));
    
    displayHolidaysList(HOLIDAYS_LIST);

    const weeks = getWeeksInMonth(year, month);
    scheduleBody.innerHTML = '';
    
    pdfScheduleData = [];

    weeks.forEach((week, weekIndex) => {
        const row = document.createElement('tr');
        const weekLabel = `${weekIndex + 1}ª Sem.`;
        row.innerHTML = `<td class="font-semibold text-xs md:text-sm p-3 border">${weekLabel}</td>`;

        const pdfRowData = [{ content: weekLabel }];

        week.days.forEach(day => {
            const dayCell = document.createElement('td');
            dayCell.className = 'day-cell p-3 border';
            if (day) {
                const dateString = `${year}-${String(month).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
                dayCell.textContent = day.getDate();
                const isHoliday = !!HOLIDAYS_LIST[dateString];
                
                pdfRowData.push({ content: day.getDate().toString(), isHoliday: isHoliday });

                if (isHoliday) {
                    dayCell.classList.add('bg-red-100', 'font-bold', 'text-red-700');
                    dayCell.title = HOLIDAYS_LIST[dateString];
                }
            } else {
                dayCell.classList.add('bg-gray-100');
                pdfRowData.push({ content: '' });
            }
            row.appendChild(dayCell);
        });

        const weekStartDate = week.days.find(d => d instanceof Date);
        const technician = weekStartDate ? getTechnicianForWeek(weekStartDate) : 'N/A';
        row.innerHTML += `<td class="font-medium text-gray-800 text-xs md:text-sm break-words p-3 border">${technician}</td>`; 
        
        pdfRowData.push({ content: technician });
        pdfScheduleData.push(pdfRowData);

        scheduleBody.appendChild(row);
    });
    
    listenToAtendimentos(year, month);
}

function calculateDurationInHours(startTime, endTime) {
    if (!startTime || !endTime) return 0;
    try {
        const [startHour, startMin] = startTime.split(':').map(Number);
        const [endHour, endMin] = endTime.split(':').map(Number);
        const startTotalMinutes = startHour * 60 + startMin;
        const endTotalMinutes = endHour * 60 + endMin;
        
        let diffMinutes = endTotalMinutes - startTotalMinutes;
        
        if (diffMinutes < 0) { diffMinutes += 24 * 60; }
        
        return diffMinutes / 60;
    } catch (e) {
        console.error("Erro ao calcular duração:", e, startTime, endTime);
        return 0;
    }
}

async function calculateAndDisplaySummary(year, month, holidays, overtimeTotals) {
    const summary = {};
    TECHNICIANS.forEach(tech => {
        summary[tech] = { standbyHours: 0 };
    });

    const weeks = getWeeksInMonth(year, month);
    weeks.forEach((week) => {
        const weekStartDate = week.days.find(d => d instanceof Date);
        if (!weekStartDate) return;
        const currentTechnician = getTechnicianForWeek(weekStartDate);

        week.days.forEach(day => {
            if (!day) return;
            const dayOfWeek = day.getDay();
            const dateString = `${year}-${String(month).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
            const isHoliday = !!holidays[dateString];

            if (dayOfWeek === 0 || dayOfWeek === 6) {
                if(summary[currentTechnician]) summary[currentTechnician].standbyHours += STANDBY_HOURS.WEEKEND_HOLIDAY;
            } else if (dayOfWeek === 5) {
                if (isHoliday) {
                    if(summary[currentTechnician]) summary[currentTechnician].standbyHours += STANDBY_HOURS.WEEKEND_HOLIDAY;
                } else {
                    if(summary[currentTechnician]) summary[currentTechnician].standbyHours += STANDBY_HOURS.FRIDAY;
                }
            } else if (dayOfWeek >= 2 && dayOfWeek <= 4) {
                 if (isHoliday) {
                    if (holidays[dateString] === 'Quarta-feira de Cinzas') {
                        if(summary[currentTechnician]) summary[currentTechnician].standbyHours += STANDBY_HOURS.WEEKDAY + STANDBY_HOURS.ASH_WEDNESDAY_MORNING;
                    } else {
                        if(summary[currentTechnician]) summary[currentTechnician].standbyHours += STANDBY_HOURS.WEEKEND_HOLIDAY;
                    }
                } else {
                    if(summary[currentTechnician]) summary[currentTechnician].standbyHours += STANDBY_HOURS.WEEKDAY;
                }
            } else if (dayOfWeek === 1) {
                const sundayBefore = new Date(day);
                sundayBefore.setDate(day.getDate() - 1);
                const previousTechnician = getTechnicianForWeek(sundayBefore);
                if(summary[previousTechnician]) summary[previousTechnician].standbyHours += STANDBY_HOURS.MONDAY_MORNING;
                if (isHoliday) {
                    if(summary[currentTechnician]) summary[currentTechnician].standbyHours += STANDBY_HOURS.MONDAY_NIGHT + STANDBY_HOURS.MONDAY_WORKDAY;
                } else {
                    if(summary[currentTechnician]) summary[currentTechnician].standbyHours += STANDBY_HOURS.MONDAY_NIGHT;
                }
            }
        });
    });

    summaryBody.innerHTML = '';
    pdfSummaryData = [];
    
    let grandTotalStandby = 0;
    let grandTotalOvertime = 0;
    
    TECHNICIANS.forEach(tech => {
        const totalStandby = summary[tech]?.standbyHours || 0;
        const totalOvertime = overtimeTotals[tech] || 0;
        grandTotalStandby += totalStandby;
        grandTotalOvertime += totalOvertime;
        const netHours = totalStandby - totalOvertime;

        const row = document.createElement('tr');
        row.innerHTML = `
            <td class="text-left font-medium p-2 text-xs md:text-sm break-words">${tech}</td> 
            <td class="text-center p-2 text-xs md:text-sm">${formatHours(totalStandby)}</td>
            <td class="text-center p-2 text-red-600 text-xs md:text-sm">${formatHours(totalOvertime)}</td>
            <td class="text-center font-bold p-2 text-xs md:text-sm">${formatHours(netHours)}</td>
        `;
        summaryBody.appendChild(row);

        pdfSummaryData.push([tech, formatHours(totalStandby), formatHours(totalOvertime), formatHours(netHours)]);
    });

    const totalRow = document.createElement('tr');
    totalRow.className = 'border-t-2 font-bold bg-gray-50';
    totalRow.innerHTML = `
        <td class="text-left p-2 text-xs md:text-sm">TOTAL GERAL</td>
        <td class="text-center p-2 text-xs md:text-sm">${formatHours(grandTotalStandby)}</td>
        <td class="text-center p-2 text-red-600 text-xs md:text-sm">${formatHours(grandTotalOvertime)}</td>
        <td class="text-center p-2 text-xs md:text-sm">${formatHours(grandTotalStandby - grandTotalOvertime)}</td>
    `;
    summaryBody.appendChild(totalRow);

    pdfSummaryData.push(['TOTAL GERAL', formatHours(grandTotalStandby), formatHours(grandTotalOvertime), formatHours(grandTotalStandby - grandTotalOvertime)]);
}

// --- FUNÇÕES DE ATENDIMENTO ---

function listenToAtendimentos(year, month) {
    atendimentosCache.clear();
    atendimentosListDiv.innerHTML = '<p class="text-gray-500 text-sm md:text-base">Carregando atendimentos...</p>';

    if (unsubscribeAtendimentos) {
        unsubscribeAtendimentos();
    }

    const docId = `${year}-${String(month).padStart(2, '0')}`;
    const atendimentosCollectionRef = collection(db, "escalaSobreaviso", docId, "atendimentos");
    const q = query(atendimentosCollectionRef); 

    unsubscribeAtendimentos = onSnapshot(q, (snapshot) => {
        const atendimentos = [];
        atendimentosCache.clear(); // Limpa o cache para recarregar

        snapshot.forEach(doc => {
            const data = { id: doc.id, ...doc.data() };
            data.duration = calculateDurationInHours(data.hora_inicio, data.hora_termino);
            atendimentos.push(data);
            atendimentosCache.set(data.id, data); // Armazena os dados completos
        });
        
        atendimentos.sort((a, b) => new Date(a.data) - new Date(b.data));

        renderAtendimentosList(atendimentos);

        const overtimeTotals = {};
        TECHNICIANS.forEach(tech => overtimeTotals[tech] = 0);
        
        atendimentos.forEach(at => {
            if (at.executado_por && overtimeTotals[at.executado_por] !== undefined) {
                overtimeTotals[at.executado_por] += at.duration;
            }
        });
        
        // Prepara os dados apenas para a tabela resumo
        pdfAtendimentosData = atendimentos.map(at => {
             let formattedDate = 'N/A';
             if (at.data) {
                 const [y, m, d] = at.data.split('-');
                 formattedDate = `${d}/${m}`;
             }
             return [
                 formattedDate,
                 at.os_numero,
                 at.executado_por,
                 at.hora_inicio,
                 at.hora_termino,
                 formatHours(at.duration)
             ];
        });

        calculateAndDisplaySummary(year, month, HOLIDAYS_LIST, overtimeTotals);

    }, (error) => {
        console.error("Erro ao buscar atendimentos:", error);
        atendimentosListDiv.innerHTML = '<p class="text-red-500 text-sm md:text-base">Erro ao carregar atendimentos.</p>';
    });
}

function renderAtendimentosList(atendimentos) {
    if (atendimentos.length === 0) {
        atendimentosListDiv.innerHTML = '<p class="text-gray-500 text-sm md:text-base">Nenhum atendimento gerado para este mês.</p>';
        return;
    }

    atendimentosListDiv.innerHTML = '';
    atendimentos.forEach(at => {
        const item = document.createElement('div');
        item.className = 'flex flex-col md:flex-row md:items-center justify-between p-3 md:p-4 bg-white border rounded-lg shadow-sm gap-2 md:gap-4'; 
        
        const formattedDate = at.data ? new Date(at.data + 'T00:00:00').toLocaleDateString('pt-BR') : 'Data inválida';

        item.innerHTML = `
            <div class="flex-grow min-w-0">
                <div class="flex items-center justify-between md:justify-start gap-2 mb-1 md:mb-0">
                    <span class="font-bold text-blue-600 text-sm md:text-base truncate">${at.os_numero}</span>
                    <span class="text-gray-500 text-xs md:text-sm whitespace-nowrap">(${formattedDate})</span>
                </div>
                <p class="text-xs md:text-sm text-gray-800 mb-1 md:mb-0 truncate">${at.motivo_chamado}</p>
                <div class="flex items-center justify-between md:justify-start mt-1 md:mt-0">
                    <p class="text-xs text-gray-500 md:hidden">Téc: ${at.executado_por}</p>
                     <p class="text-xs text-gray-500 hidden md:block">Técnico: ${at.executado_por}</p>
                     <div class="flex gap-2 flex-shrink-0 md:hidden">
                         <button data-id="${at.id}" class="btn-edit-atendimento p-1.5 bg-yellow-500 text-white rounded-md hover:bg-yellow-600" title="Editar">
                             <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>
                         </button>
                         <button data-id="${at.id}" class="btn-pdf-atendimento p-1.5 bg-blue-600 text-white rounded-md hover:bg-blue-700" title="Gerar PDF">
                             <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
                         </button>
                         <button data-id="${at.id}" class="btn-delete-atendimento p-1.5 bg-red-600 text-white rounded-md hover:bg-red-700" title="Excluir">
                             <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                         </button>
                     </div>
                </div>
            </div>
            <div class="hidden md:flex gap-2 flex-shrink-0">
                <button data-id="${at.id}" class="btn-edit-atendimento p-2 bg-yellow-500 text-white rounded-md hover:bg-yellow-600" title="Editar">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>
                </button>
                <button data-id="${at.id}" class="btn-pdf-atendimento p-2 bg-blue-600 text-white rounded-md hover:bg-blue-700" title="Gerar PDF">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
                </button>
                <button data-id="${at.id}" class="btn-delete-atendimento p-2 bg-red-600 text-white rounded-md hover:bg-red-700" title="Excluir">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                </button>
            </div>
        `;
        atendimentosListDiv.appendChild(item);
    });
}


function openAtendimentoModal(atendimentoData = null) {
    atendimentoForm.reset();
    signatureContainer.innerHTML = '<div id="signature-placeholder" class="signature-placeholder">Clique para assinar</div>';
    dataAtendimentoInput.value = new Date().toISOString().split('T')[0];
    semOsCheckbox.checked = false;
    osNumeroInput.disabled = false;
    osNumeroInput.required = true;

    // Reseta campos do equipamento
    document.getElementById('equipamento').value = '';
    document.getElementById('marca').value = '';
    document.getElementById('modelo').value = '';
    document.getElementById('serial').value = '';

    if (atendimentoData) {
        currentAtendimentoId = atendimentoData.id;
        document.getElementById('atendimento-id').value = atendimentoData.id;
        if (atendimentoData.os_numero === 'SEM OS') {
            osNumeroInput.value = 'SEM OS';
            osNumeroInput.disabled = true;
            osNumeroInput.required = false;
            semOsCheckbox.checked = true;
        } else {
            osNumeroInput.value = atendimentoData.os_numero || '';
        }
        dataAtendimentoInput.value = atendimentoData.data || new Date().toISOString().split('T')[0];
        document.getElementById('motivo_chamado').value = atendimentoData.motivo_chamado || '';
        document.getElementById('servico_executado').value = atendimentoData.servico_executado || '';
        executadoPorSelect.value = atendimentoData.executado_por || '';
        document.getElementById('hora_inicio').value = atendimentoData.hora_inicio || '';
        document.getElementById('hora_termino').value = atendimentoData.hora_termino || '';
        
        // Carrega dados do equipamento
        document.getElementById('equipamento').value = atendimentoData.equipamento || '';
        document.getElementById('marca').value = atendimentoData.marca || '';
        document.getElementById('modelo').value = atendimentoData.modelo || '';
        document.getElementById('serial').value = atendimentoData.serial || '';
        
        document.getElementById('nome_solicitante').value = atendimentoData.nome_solicitante || '';
        document.getElementById('siape').value = atendimentoData.siape || '';
        signatureDataInput.value = atendimentoData.signature_data || '';
        if (atendimentoData.signature_data) {
            signatureContainer.innerHTML = `<img src="${atendimentoData.signature_data}" class="signature-thumbnail" alt="Assinatura">`;
        }
    } else {
        currentAtendimentoId = null;
        document.getElementById('atendimento-id').value = '';
    }
    atendimentoModal.classList.add('flex');
}

function closeAtendimentoModal() {
    atendimentoModal.classList.remove('flex');
    atendimentoForm.reset();
    currentAtendimentoId = null;
}

async function saveAtendimento(e) {
    e.preventDefault();
    const btn = document.getElementById('btn-save-atendimento');
    btn.disabled = true;
    btn.textContent = 'Salvando...';

    const formData = new FormData(atendimentoForm);
    const osNumeroValue = semOsCheckbox.checked ? 'SEM OS' : formData.get('os_numero');
    
    const atendimentoData = {
        os_numero: osNumeroValue,
        data: formData.get('data'),
        motivo_chamado: formData.get('motivo_chamado'),
        servico_executado: formData.get('servico_executado'),
        executado_por: formData.get('executado_por'),
        hora_inicio: formData.get('hora_inicio'),
        hora_termino: formData.get('hora_termino'),
        // Salva dados do equipamento
        equipamento: formData.get('equipamento'),
        marca: formData.get('marca'),
        modelo: formData.get('modelo'),
        serial: formData.get('serial'),
        // ---
        nome_solicitante: formData.get('nome_solicitante'),
        siape: formData.get('siape'),
        signature_data: formData.get('signature_data')
    };

    const [year, month] = monthSelector.value.split('-').map(Number);
    const docId = `${year}-${String(month).padStart(2, '0')}`;
    const atendimentosCollectionRef = collection(db, "escalaSobreaviso", docId, "atendimentos");

    try {
        if (currentAtendimentoId) {
            const atendimentoRef = doc(db, "escalaSobreaviso", docId, "atendimentos", currentAtendimentoId);
            await updateDoc(atendimentoRef, atendimentoData);
        } else {
            await addDoc(atendimentosCollectionRef, atendimentoData);
        }
        closeAtendimentoModal();
    } catch (error) {
        console.error("Erro ao salvar atendimento:", error);
        alert("Ocorreu um erro ao salvar o atendimento.");
    } finally {
        btn.disabled = false;
        btn.textContent = 'Salvar';
    }
}

async function handleAtendimentoListClick(e) {
    const editButton = e.target.closest('.btn-edit-atendimento');
    const pdfButton = e.target.closest('.btn-pdf-atendimento');
    const deleteButton = e.target.closest('.btn-delete-atendimento');

    if (editButton) {
        const id = editButton.dataset.id;
        const atendimentoData = atendimentosCache.get(id);
        if (atendimentoData) { openAtendimentoModal(atendimentoData); }
    }

    if (pdfButton) {
        const id = pdfButton.dataset.id;
        const atendimentoData = atendimentosCache.get(id);
        if (atendimentoData) {
            // Passa o elemento do botão para a função
            await generateAtendimentoPdf(atendimentoData, pdfButton);
        }
    }

    if (deleteButton) {
        openDeleteModal(deleteButton.dataset.id);
    }
}

function openDeleteModal(id) {
    currentAtendimentoIdToDelete = id;
    deleteModal.classList.add('flex');
}

function closeDeleteModal() {
    currentAtendimentoIdToDelete = null;
    deleteModal.classList.remove('flex');
}

async function handleConfirmDelete() {
    if (!currentAtendimentoIdToDelete) return;
    const [year, month] = monthSelector.value.split('-').map(Number);
    const docId = `${year}-${String(month).padStart(2, '0')}`;
    const atendimentoRef = doc(db, "escalaSobreaviso", docId, "atendimentos", currentAtendimentoIdToDelete);
    try {
        await deleteDoc(atendimentoRef);
        closeDeleteModal();
    } catch (error) {
        console.error("Erro ao excluir atendimento:", error);
        alert("Erro ao excluir. Tente novamente.");
    }
}

function formatOsNumber(e) {
    if (e.target.disabled) return; 
    let value = e.target.value.replace(/\D/g, '');
    if (value.length > 6) { value = value.substring(0, 6); }
    if (value.length > 2) { value = value.substring(0, 2) + '.' + value.substring(2); }
    e.target.value = value;
}

// --- FUNÇÕES DE FERIADOS ---

function updateMovableHolidaysUI(year, month) {
    let isAnyHolidayVisible = false;
    const firstDayOfMonth = new Date(year, month - 1, 1).toISOString().split('T')[0];
    const lastDayOfMonth = new Date(year, month, 0).toISOString().split('T')[0];

    HOLIDAYS_CONFIG.movable.forEach(holiday => {
        const group = document.getElementById(`${holiday.id.replace('-date', '-group')}`);
        const input = document.getElementById(holiday.id);
        if (group && input) {
            const shouldDisplay = holiday.months.includes(month);
            group.style.display = shouldDisplay ? 'block' : 'none';
            if (shouldDisplay) {
                isAnyHolidayVisible = true;
                input.min = firstDayOfMonth;
                input.max = lastDayOfMonth;
            }
        }
    });

    movableHolidaysManager.style.display = isAnyHolidayVisible ? 'block' : 'none';
    if(isAnyHolidayVisible) movableHolidayYearSpan.textContent = year;
}

function getHolidaysForMonth(year, month) {
    const holidays = {};
    const monthStr = String(month).padStart(2, '0');

    for (const dateKey in HOLIDAYS_CONFIG.fixed) {
        if (dateKey.startsWith(monthStr)) {
            holidays[`${year}-${dateKey}`] = HOLIDAYS_CONFIG.fixed[dateKey];
        }
    }

    const carnivalInput = document.getElementById('carnival-date');
    if (carnivalInput && carnivalInput.value) {
        const carnivalTuesday = new Date(carnivalInput.value + 'T00:00:00');
        if (document.getElementById('include-carnival-monday').checked) {
            const monday = new Date(carnivalTuesday);
            monday.setDate(monday.getDate() - 1);
            if (monday.getFullYear() === year && (monday.getMonth() + 1) === month) {
                holidays[monday.toISOString().split('T')[0]] = 'Carnaval (Segunda-feira)';
            }
        }
        if (carnivalTuesday.getFullYear() === year && (carnivalTuesday.getMonth() + 1) === month) {
            holidays[carnivalTuesday.toISOString().split('T')[0]] = 'Carnaval';
        }
        if (document.getElementById('include-ash-wednesday').checked) {
            const wednesday = new Date(carnivalTuesday);
            wednesday.setDate(wednesday.getDate() + 1);
            if (wednesday.getFullYear() === year && (wednesday.getMonth() + 1) === month) {
                holidays[wednesday.toISOString().split('T')[0]] = 'Quarta-feira de Cinzas';
            }
        }
    }

    HOLIDAYS_CONFIG.movable.forEach(holiday => {
        if (holiday.id === 'carnival-date') return;
        const input = document.getElementById(holiday.id);
        if (input && input.value) {
            const holidayDate = new Date(input.value + 'T00:00:00');
            if (holidayDate.getFullYear() === year && (holidayDate.getMonth() + 1) === month) {
                holidays[input.value] = holiday.name;
            }
        }
    });
    return holidays;
}

function displayHolidaysList(holidays) {
    if (Object.keys(holidays).length === 0) {
        holidaysListDiv.innerHTML = '<p class="text-sm text-gray-500">Nenhum feriado neste mês.</p>';
        return;
    }
    let listHtml = '<ul class="list-disc pl-5 text-sm text-gray-700">';
    const sortedDates = Object.keys(holidays).sort();
    sortedDates.forEach(date => {
        const day = new Date(date + 'T00:00:00').getDate();
        listHtml += `<li><strong>Dia ${day}:</strong> ${holidays[date]}</li>`;
    });
    listHtml += '</ul>';
    holidaysListDiv.innerHTML = listHtml;
}

// --- FUNÇÕES UTILITÁRES ---
function formatHours(hours) {
    return (hours || 0).toFixed(2).replace('.', ',');
}

function getTechnicianForWeek(weekStartDate) {
    const startDate = new Date(weekStartDate.getFullYear(), weekStartDate.getMonth(), weekStartDate.getDate());
    const diffMs = startDate.getTime() - REFERENCE_DATE.getTime();
    const diffWeeks = Math.floor(diffMs / (1000 * 60 * 60 * 24 * 7));
    const newIndex = REFERENCE_TECHNICIAN_INDEX + diffWeeks;
    const finalIndex = (newIndex % TECHNICIANS.length + TECHNICIANS.length) % TECHNICIANS.length;
    return TECHNICIANS[finalIndex];
}

function getWeeksInMonth(year, month) {
    const weeks = [];
    const firstDayOfMonth = new Date(year, month - 1, 1);
    const lastDayOfMonth = new Date(year, month, 0);
    
    let currentDate = new Date(firstDayOfMonth);
    let dayOfWeek = currentDate.getDay();
    if (dayOfWeek === 0) dayOfWeek = 7;
    currentDate.setDate(currentDate.getDate() - (dayOfWeek - 1));

    while (currentDate <= lastDayOfMonth) {
        let week = { days: [] };
        for (let i = 0; i < 7; i++) {
            if (currentDate.getMonth() === month - 1) {
                week.days.push(new Date(currentDate));
            } else {
                week.days.push(null);
            }
            currentDate.setDate(currentDate.getDate() + 1);
        }
        weeks.push(week);
    }
    return weeks;
}

// --- FUNÇÃO DE GERAÇÃO DE PDF ---

async function handleGenerateReportClick() {
    btnGenerateReport.disabled = true;
    btnGenerateReport.textContent = 'Gerando...';

    try {
        const [year, month] = monthSelector.value.split('-').map(Number);
        const monthName = new Date(year, month - 1, 1).toLocaleString('pt-BR', { month: 'long' });
        
        const monthYearStr = `${monthName.charAt(0).toUpperCase() + monthName.slice(1)} de ${year}`;
        const fileName = `Relatorio_Sobreaviso_${year}-${String(month).padStart(2, '0')}.pdf`;

        // Prepara a lista de feriados para o PDF
        let holidaysListForPdf = [];
        const sortedHolidayDates = Object.keys(HOLIDAYS_LIST).sort();
        if (sortedHolidayDates.length > 0) {
            holidaysListForPdf = sortedHolidayDates.map(date => {
                const day = new Date(date + 'T00:00:00').getDate();
                return `Dia ${day}: ${HOLIDAYS_LIST[date]}`;
            });
        } else {
            holidaysListForPdf.push("Nenhum feriado neste mês.");
        }

        // NOVO: Pega os dados completos dos atendimentos do cache
        const fullAtendimentosData = Array.from(atendimentosCache.values())
                                        .sort((a, b) => new Date(a.data) - new Date(b.data));

        // Chama a função do PDF com os dados já processados
        await generateMonthlyReportPDF(
            monthYearStr,
            pdfScheduleData,
            pdfSummaryData,
            pdfAtendimentosData, // Dados da tabela resumo
            holidaysListForPdf,
            fullAtendimentosData, // NOVO: Dados completos para anexar
            fileName
        );

    } catch (error) {
        console.error("Erro ao gerar PDF do relatório:", error);
        alert("Ocorreu um erro ao gerar o relatório em PDF.");
    } finally {
        btnGenerateReport.disabled = false;
        btnGenerateReport.textContent = 'Gerar Relatório PDF';
    }
}


// --- INICIALIZAÇÃO E EVENTOS ---
function initialize() {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    monthSelector.value = `${year}-${String(month).padStart(2, '0')}`;

    generateAndDisplaySchedule(year, month);

    monthSelector.addEventListener('change', () => {
        const [newYear, newMonth] = monthSelector.value.split('-').map(Number);
        generateAndDisplaySchedule(newYear, newMonth);
    });

    document.querySelectorAll('#movable-holidays-manager input').forEach(input => {
        input.addEventListener('change', () => {
            const [year, month] = monthSelector.value.split('-').map(Number);
            generateAndDisplaySchedule(year, month);
        });
    });

    TECHNICIANS.forEach(tech => {
        const option = document.createElement('option');
        option.value = tech;
        option.textContent = tech;
        executadoPorSelect.appendChild(option);
    });
    
    btnLaunchAtendimento.addEventListener('click', () => {
        const [year, month] = monthSelector.value.split('-').map(Number);
        const firstDay = new Date(year, month - 1, 1).toISOString().split('T')[0];
        const lastDay = new Date(year, month, 0).toISOString().split('T')[0];
        dataAtendimentoInput.min = firstDay;
        dataAtendimentoInput.max = lastDay;
        openAtendimentoModal();
    });

    btnCancelAtendimento.addEventListener('click', closeAtendimentoModal);
    atendimentoForm.addEventListener('submit', saveAtendimento);
    osNumeroInput.addEventListener('input', formatOsNumber);
    atendimentosListDiv.addEventListener('click', handleAtendimentoListClick);
    btnGenerateReport.addEventListener('click', handleGenerateReportClick);

    semOsCheckbox.addEventListener('change', (e) => {
        if (e.target.checked) {
            osNumeroInput.value = 'SEM OS';
            osNumeroInput.disabled = true;
            osNumeroInput.required = false;
        } else {
            osNumeroInput.value = '';
            osNumeroInput.disabled = false;
            osNumeroInput.required = true;
            osNumeroInput.focus();
        }
    });

    btnCancelDelete.addEventListener('click', closeDeleteModal);
    btnConfirmDelete.addEventListener('click', handleConfirmDelete);

    signatureContainer.addEventListener('click', () => {
        signaturePadManager.open((dataUrl) => {
            signatureDataInput.value = dataUrl;
            signatureContainer.innerHTML = `<img src="${dataUrl}" class="signature-thumbnail" alt="Assinatura">`;
        });
    });
}

document.addEventListener('DOMContentLoaded', initialize);