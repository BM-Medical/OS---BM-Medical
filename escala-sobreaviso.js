/**
 * escala-sobreaviso.js
 * Script para a página de Gestão de Escala de Sobreaviso - Contrato 14/2024.
 * Versão: 6.8 - Fix: Cálculo da 2ª feira na virada do mês baseado no mês anterior + Salvamento manual.
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-app.js";
import { 
    getFirestore, doc, getDoc, setDoc, collection, addDoc, 
    query, onSnapshot, updateDoc, deleteDoc
} from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";

import { SignaturePadManager } from './signature-pad-helper.js';
import { generateAtendimentoPdf } from './pdf-generator-atendimento.js';
import { generateMonthlyReportPDF } from './pdf-generator-sobreaviso.js';

const firebaseConfig = {
    apiKey: "AIzaSyC8L8dTkuL_KxvW_-m7V3c0UmYwV-gbQfE",
    authDomain: "ordem-de-servicos---bm-medical.firebaseapp.com",
    projectId: "ordem-de-servicos---bm-medical",
    storageBucket: "ordem-de-servicos---bm-medical.firebasestorage.app",
    messagingSenderId: "92355637827",
    appId: "1:92355637827:web:850b89afa5054781475af6"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// --- CONFIGURAÇÕES ---
const TECHNICIANS = ["Siberi Eslabão", "Jonas da Silva", "Renan Correa"];
const REFERENCE_DATE = new Date('2025-09-29T00:00:00');

const STANDBY_HOURS = {
    WEEKDAY: 13.75, FRIDAY: 14.75, WEEKEND_HOLIDAY: 24,
    MONDAY_MORNING: 7.75, MONDAY_NIGHT: 6, MONDAY_WORKDAY: 10.25,
    ASH_WEDNESDAY_MORNING: 5.25 
};

const FIXED_HOLIDAYS = {
    '01-01': 'Confraternização Universal', '02-02': 'Nossa Senhora dos Navegantes (Pelotas)',
    '04-21': 'Tiradentes', '05-01': 'Dia do Trabalhador', '07-07': 'Aniversário de Pelotas',
    '09-07': 'Independência do Brasil', '09-20': 'Revolução Farroupilha',
    '10-12': 'Nossa Senhora Aparecida', '11-02': 'Finados', '11-15': 'Proclamação da República',
    '11-20': 'Consciência Negra', '12-25': 'Natal'
};

// --- ESTADO GLOBAL ---
let currentAtendimentos = [];
let HOLIDAYS_LIST = {};
let currentYear, currentMonth;
let technicianOverrides = {}; 
let holidayOverrides = {}; 
let weeklyAssignmentRecord = [];
let prevMonthLastWeekTech = null; // Guarda o técnico da última semana do mês anterior
let signaturePadManager;
let editingAtendimentoId = null;

// --- UTILITÁRIOS ---

function showModal(modalElement) {
    if (!modalElement) return;
    modalElement.classList.remove('hidden');
    modalElement.style.display = 'flex'; 
}

function hideModal(modalElement) {
    if (!modalElement) return;
    modalElement.classList.add('hidden');
    modalElement.style.display = 'none';
}

function formatHours(h) { return (h || 0).toFixed(2).replace('.', ','); }

function formatDateBR(dateStr, shortYear = false) {
    if(!dateStr) return "";
    const [y, m, d] = dateStr.split('-');
    const yearDisplay = shortYear ? y.substring(2) : y;
    return `${d}/${m}/${yearDisplay}`;
}

function calculateDurationInHours(startTime, endTime) {
    if (!startTime || !endTime) return 0;
    const [sH, sM] = startTime.split(':').map(Number);
    const [eH, eM] = endTime.split(':').map(Number);
    let diff = (eH * 60 + eM) - (sH * 60 + sM);
    if (diff < 0) diff += 1440;
    return diff / 60;
}

// --- LÓGICA DE CALENDÁRIO ---

function getWeeksInMonth(year, month) {
    const weeks = [];
    let date = new Date(year, month - 1, 1);
    const last = new Date(year, month, 0);
    let day = date.getDay() === 0 ? 7 : date.getDay();
    date.setDate(date.getDate() - (day - 1));
    while (date <= last) {
        let week = { days: [] };
        for (let i = 0; i < 7; i++) {
            week.days.push(date.getMonth() === month - 1 ? new Date(date) : null);
            date.setDate(date.getDate() + 1);
        }
        weeks.push(week);
    }
    return weeks;
}

function getAllHolidays(year) {
    const holidays = {};
    for (const [key, name] of Object.entries(FIXED_HOLIDAYS)) { holidays[`${year}-${key}`] = name; }
    const getEaster = (y) => {
        const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
        const mo = Math.floor((h + l - 7 * m + 114) / 31), da = ((h + l - 7 * m + 114) % 31) + 1;
        return new Date(y, mo - 1, da);
    };
    const e = getEaster(year);
    const fmt = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const carn = new Date(e); carn.setDate(e.getDate() - 47); holidays[fmt(carn)] = 'Carnaval';
    const ash = new Date(e); ash.setDate(e.getDate() - 46); holidays[fmt(ash)] = 'Quarta-feira de Cinzas';
    const good = new Date(e); good.setDate(e.getDate() - 2); holidays[fmt(good)] = 'Paixão de Cristo';
    const corp = new Date(e); corp.setDate(e.getDate() + 60); holidays[fmt(corp)] = 'Corpus Christi';
    return holidays;
}

function getBaselineTechnician(date) {
    if (!date) return TECHNICIANS[0];
    const startDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const diffMs = startDate.getTime() - REFERENCE_DATE.getTime();
    const diffWeeks = Math.floor(diffMs / (1000 * 60 * 60 * 24 * 7));
    const index = ((diffWeeks % TECHNICIANS.length) + TECHNICIANS.length) % TECHNICIANS.length;
    return TECHNICIANS[index];
}

// NOVA FUNÇÃO: Simula o mês passado para descobrir quem foi o último técnico
async function determinePrevMonthLastTech(year, month) {
    let prevMonth = month - 1;
    let prevYear = year;
    
    if (prevMonth === 0) {
        prevMonth = 12;
        prevYear--;
    }
    
    const docId = `${prevYear}-${String(prevMonth).padStart(2, '0')}`;
    let prevOverrides = {};
    
    try {
        const snap = await getDoc(doc(db, "escalaSobreaviso", docId));
        if (snap.exists()) prevOverrides = snap.data().overrides || {};
    } catch(e) { console.error("Erro ao buscar mês anterior:", e); }

    const prevWeeks = getWeeksInMonth(prevYear, prevMonth);
    let currentTech = "";
    
    for (let i = 0; i < prevWeeks.length; i++) {
        const weekKey = `week_${i}`;
        if (prevOverrides[weekKey]) {
            currentTech = prevOverrides[weekKey];
        } else {
            if (i === 0) {
                const firstValidDay = prevWeeks[i].days.find(d => d instanceof Date);
                currentTech = getBaselineTechnician(firstValidDay);
            } else {
                const prevIdx = TECHNICIANS.indexOf(currentTech);
                currentTech = TECHNICIANS[(prevIdx + 1) % TECHNICIANS.length];
            }
        }
    }
    return currentTech;
}

// --- RENDERIZAÇÃO ---

function renderScheduleTable() {
    const scheduleBody = document.getElementById('schedule-body');
    const weeks = getWeeksInMonth(currentYear, currentMonth);
    if (scheduleBody) scheduleBody.innerHTML = '';
    
    weeklyAssignmentRecord = [];

    weeks.forEach((week, weekIndex) => {
        const row = document.createElement('tr');
        const weekKey = `week_${weekIndex}`;
        const labelCell = document.createElement('td');
        labelCell.className = 'font-semibold text-xs p-3 border bg-gray-50';
        labelCell.textContent = `${weekIndex + 1}ª Sem.`;
        row.appendChild(labelCell);

        week.days.forEach(day => {
            const dayCell = document.createElement('td');
            dayCell.className = 'day-cell p-3 border text-center cursor-pointer select-none';
            if (day) {
                const d = day.getDate();
                const dateString = `${currentYear}-${String(currentMonth).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                dayCell.textContent = d;
                if (HOLIDAYS_LIST[dateString] || holidayOverrides[dateString]) {
                    dayCell.classList.add('bg-red-100', 'font-bold', 'text-red-700');
                }
                dayCell.onclick = (e) => {
                    e.stopPropagation();
                    toggleHolidayExemption(dateString, !!HOLIDAYS_LIST[dateString]);
                };
            } else {
                dayCell.classList.add('bg-gray-100');
            }
            row.appendChild(dayCell);
        });

        let techToDisplay = "";
        if (technicianOverrides[weekKey]) {
            techToDisplay = technicianOverrides[weekKey];
        } else {
            if (weekIndex === 0) {
                const firstValidDay = week.days.find(d => d instanceof Date);
                techToDisplay = getBaselineTechnician(firstValidDay);
            } else {
                const prevTech = weeklyAssignmentRecord[weekIndex - 1];
                const prevIdx = TECHNICIANS.indexOf(prevTech);
                techToDisplay = TECHNICIANS[(prevIdx + 1) % TECHNICIANS.length];
            }
        }

        weeklyAssignmentRecord[weekIndex] = techToDisplay;

        const techCell = document.createElement('td');
        techCell.className = 'p-2 border';
        const select = document.createElement('select');
        select.className = 'w-full p-1 text-xs border rounded bg-white focus:ring-2 focus:ring-blue-400 outline-none';
        
        TECHNICIANS.forEach(t => {
            const opt = document.createElement('option');
            opt.value = t; opt.textContent = t;
            if (t === techToDisplay) opt.selected = true;
            select.appendChild(opt);
        });
        
        // Agora altera apenas LOCALMENTE
        select.onchange = (e) => updateLocalTechnicianOverride(weekKey, e.target.value);
        techCell.appendChild(select);
        row.appendChild(techCell);
        if (scheduleBody) scheduleBody.appendChild(row);
    });
}

function displayHolidaysList() {
    const listDiv = document.getElementById('holidays-list');
    if (!listDiv) return;
    const combined = { ...HOLIDAYS_LIST, ...holidayOverrides };
    const sortedKeys = Object.keys(combined).sort();
    
    if (sortedKeys.length === 0) {
        listDiv.innerHTML = '<p class="text-sm text-gray-500 italic">Nenhum feriado registrado para este mês.</p>';
        return;
    }

    let html = '<ul class="list-disc pl-5 space-y-1">';
    sortedKeys.forEach(dateStr => {
        const dayNum = dateStr.split('-')[2];
        html += `<li class="text-sm"><strong>Dia ${parseInt(dayNum)}:</strong> ${combined[dateStr]}</li>`;
    });
    html += '</ul>';
    listDiv.innerHTML = html;
}

function renderAtendimentosList() {
    const listContainer = document.getElementById('atendimentos-list');
    if (!listContainer) return;
    listContainer.innerHTML = '';
    if (currentAtendimentos.length === 0) {
        listContainer.innerHTML = '<p class="text-gray-500 text-sm italic">Nenhum atendimento lançado neste mês.</p>';
        return;
    }
    const sorted = [...currentAtendimentos].sort((a, b) => a.data.localeCompare(b.data));
    sorted.forEach(at => {
        const card = document.createElement('div');
        card.className = "bg-white border rounded-lg p-4 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4 hover:border-blue-300 transition-colors";
        card.innerHTML = `
            <div class="flex-grow">
                <div class="flex items-center gap-2 mb-1">
                    <span class="text-blue-600 font-bold">${at.os_numero || 'SEM OS'}</span>
                    <span class="text-gray-400 text-sm">(${formatDateBR(at.data)})</span>
                </div>
                <p class="text-gray-700 text-sm mb-1">${at.motivo_chamado || 'Sem descrição'}</p>
                <p class="text-gray-500 text-xs italic">Técnico: ${at.executado_por}</p>
            </div>
            <div class="flex gap-2 shrink-0">
                <button title="Editar" class="btn-edit p-2 bg-yellow-500 text-white rounded hover:bg-yellow-600 transition-colors">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>
                </button>
                <button title="Gerar PDF" class="btn-pdf p-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"></path></svg>
                </button>
                <button title="Excluir" class="btn-delete p-2 bg-red-600 text-white rounded hover:bg-red-700 transition-colors">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                </button>
            </div>
        `;
        card.querySelector('.btn-edit').onclick = () => fillFormForEdit(at);
        card.querySelector('.btn-pdf').onclick = () => generateAtendimentoPdf(at);
        card.querySelector('.btn-delete').onclick = () => confirmDeletion(at.id);
        listContainer.appendChild(card);
    });
}

function fillFormForEdit(at) {
    editingAtendimentoId = at.id;
    const form = document.getElementById('atendimento-form');
    if (!form) return;
    form.os_numero.value = at.os_numero === "SEM OS" ? "" : at.os_numero;
    form.executado_por.value = at.executado_por;
    form.data.value = at.data;
    form.hora_inicio.value = at.hora_inicio;
    form.hora_termino.value = at.hora_termino;
    form.equipamento.value = at.equipamento || "";
    form.marca.value = at.marca || "";
    form.modelo.value = at.modelo || "";
    form.serial.value = at.serial || "";
    form.motivo_chamado.value = at.motivo_chamado || "";
    form.servico_executado.value = at.servico_executado || "";
    form.nome_solicitante.value = at.nome_solicitante || "";
    form.siape.value = at.siape || "";
    const chk = document.getElementById('sem_os_checkbox');
    if (chk) {
        chk.checked = at.os_numero === "SEM OS";
        const inputNumOS = document.getElementById('os_numero');
        if (inputNumOS) {
            inputNumOS.disabled = chk.checked;
            if(chk.checked) inputNumOS.removeAttribute('required');
        }
    }
    const hiddenSig = document.getElementById('signature-data');
    const placeholder = document.getElementById('signature-placeholder');
    if (at.signature) {
        hiddenSig.value = at.signature;
        placeholder.innerHTML = `<img src="${at.signature}" class="signature-thumbnail" style="max-height: 80px; margin: auto;">`;
    }
    showModal(document.getElementById('atendimento-modal'));
}

function confirmDeletion(id) {
    const modal = document.getElementById('delete-modal');
    showModal(modal);
    document.getElementById('btn-confirm-delete').onclick = async () => {
        const docId = document.getElementById('month-selector').value;
        try {
            await deleteDoc(doc(db, "escalaSobreaviso", docId, "atendimentos", id));
            hideModal(modal);
        } catch (e) { alert("Erro ao excluir: " + e.message); }
    };
    document.getElementById('btn-cancel-delete').onclick = () => hideModal(modal);
}

async function loadAndDisplaySchedule(year, month) {
    currentYear = year; currentMonth = month;
    const allHolidaysYear = getAllHolidays(year);
    HOLIDAYS_LIST = {};
    const monthPrefix = `${year}-${String(month).padStart(2, '0')}`;
    
    for (const [date, name] of Object.entries(allHolidaysYear)) { 
        if (date.startsWith(monthPrefix)) HOLIDAYS_LIST[date] = name; 
    }
    
    try {
        const configSnap = await getDoc(doc(db, "escalaSobreaviso", monthPrefix));
        if (configSnap.exists()) {
            technicianOverrides = configSnap.data().overrides || {};
            holidayOverrides = configSnap.data().holidayOverrides || {};
        } else { 
            technicianOverrides = {}; 
            holidayOverrides = {}; 
        }
    } catch (e) { console.error("Erro Firebase:", e); }
    
    // Calcula o técnico da última semana do mês anterior ANTES de renderizar
    prevMonthLastWeekTech = await determinePrevMonthLastTech(year, month);
    
    renderScheduleTable();
    displayHolidaysList();
    updateSummary();
    listenToAtendimentos(year, month);
}

function calculateSummaryTotals() {
    const overtimeTotals = {};
    TECHNICIANS.forEach(t => overtimeTotals[t] = 0);
    currentAtendimentos.forEach(at => {
        if (overtimeTotals[at.executado_por] !== undefined) {
            const duration = calculateDurationInHours(at.hora_inicio, at.hora_termino);
            overtimeTotals[at.executado_por] += duration;
        }
    });
    
    const summary = {};
    TECHNICIANS.forEach(tech => summary[tech] = { standbyHours: 0 });
    const weeks = getWeeksInMonth(currentYear, currentMonth);
    
    weeks.forEach((week, weekIndex) => {
        const currentTechnician = weeklyAssignmentRecord[weekIndex];
        if (!currentTechnician) return;
        
        week.days.forEach(day => {
            if (!day) return;
            const dateString = `${currentYear}-${String(currentMonth).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
            const isHoliday = !!(HOLIDAYS_LIST[dateString] || holidayOverrides[dateString]);
            const dayOfWeek = day.getDay();
            
            if (dayOfWeek === 0 || dayOfWeek === 6) {
                summary[currentTechnician].standbyHours += STANDBY_HOURS.WEEKEND_HOLIDAY;
            }
            else if (dayOfWeek === 5) {
                summary[currentTechnician].standbyHours += isHoliday ? STANDBY_HOURS.WEEKEND_HOLIDAY : STANDBY_HOURS.FRIDAY;
            }
            else if (dayOfWeek >= 2 && dayOfWeek <= 4) {
                summary[currentTechnician].standbyHours += isHoliday ? STANDBY_HOURS.WEEKEND_HOLIDAY : STANDBY_HOURS.WEEKDAY;
            }
            else if (dayOfWeek === 1) {
                // LOGICA CORRIGIDA AQUI
                let prevTech;
                if (weekIndex === 0) {
                    // Pega o técnico validado do mês anterior
                    prevTech = prevMonthLastWeekTech; 
                    
                    // Fallback de segurança
                    if (!prevTech) {
                        prevTech = getBaselineTechnician(new Date(day.getTime() - 86400000));
                    }
                } else {
                    prevTech = weeklyAssignmentRecord[weekIndex - 1];
                }
                
                if(summary[prevTech]) summary[prevTech].standbyHours += STANDBY_HOURS.MONDAY_MORNING;
                
                summary[currentTechnician].standbyHours += isHoliday ? (STANDBY_HOURS.MONDAY_NIGHT + STANDBY_HOURS.MONDAY_WORKDAY) : STANDBY_HOURS.MONDAY_NIGHT;
            }
        });
    });
    return { summary, overtimeTotals };
}

function updateSummary() {
    const summaryBody = document.getElementById('summary-body');
    if (!summaryBody) return;
    const { summary, overtimeTotals } = calculateSummaryTotals();
    summaryBody.innerHTML = '';
    TECHNICIANS.forEach(tech => {
        const sb = summary[tech].standbyHours;
        const ot = overtimeTotals[tech] || 0;
        summaryBody.innerHTML += `<tr><td class="text-left p-2 border-b text-sm">${tech}</td><td class="text-center p-2 border-b text-sm">${formatHours(sb)}</td><td class="text-center p-2 border-b text-sm text-red-600">${formatHours(ot)}</td><td class="text-center p-2 border-b text-sm font-bold">${formatHours(sb - ot)}</td></tr>`;
    });
}

function listenToAtendimentos(year, month) {
    if (window.unsubscribeAtendimentos) window.unsubscribeAtendimentos();
    const docId = `${year}-${String(month).padStart(2, '0')}`;
    const q = query(collection(db, "escalaSobreaviso", docId, "atendimentos"));
    window.unsubscribeAtendimentos = onSnapshot(q, (snapshot) => {
        currentAtendimentos = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        renderAtendimentosList();
        updateSummary();
    }, (err) => console.error("Erro atendimentos:", err));
}

// NOVA FUNÇÃO: Atualiza apenas localmente, não envia pro Firebase
function updateLocalTechnicianOverride(weekKey, techName) {
    technicianOverrides[weekKey] = techName;
    renderScheduleTable();
    updateSummary();
}

// MODIFICADA: Atualiza apenas localmente, não envia pro Firebase
function toggleHolidayExemption(dateString, isAutoHoliday) {
    if (holidayOverrides[dateString]) {
        delete holidayOverrides[dateString];
    } else {
        const name = prompt("Nome do Feriado:", isAutoHoliday ? HOLIDAYS_LIST[dateString] : "Folga");
        if (name) holidayOverrides[dateString] = name; else return;
    }
    renderScheduleTable();
    displayHolidaysList();
    updateSummary();
}

// NOVA FUNÇÃO: Salva tudo no Firebase quando clica no botão "Salvar Escala"
async function saveScheduleToFirebase() {
    const docId = document.getElementById('month-selector')?.value;
    if (!docId) return;

    const btnSave = document.getElementById('btn-save-schedule');
    const originalText = btnSave ? btnSave.innerHTML : '';
    
    if (btnSave) {
        btnSave.disabled = true;
        btnSave.innerHTML = "Salvando...";
    }

    try {
        await setDoc(doc(db, "escalaSobreaviso", docId), { 
            overrides: technicianOverrides,
            holidayOverrides: holidayOverrides
        }, { merge: true });
        
        // Criar um pequeno toast de notificação ou alert discreto
        alert("Escala salva com sucesso!");
    } catch (e) { 
        console.error("Erro ao salvar escala:", e);
        alert("Erro ao salvar a escala no banco de dados.");
    } finally {
        if (btnSave) {
            btnSave.disabled = false;
            btnSave.innerHTML = originalText;
        }
    }
}

// --- INICIALIZAÇÃO ---

document.addEventListener('DOMContentLoaded', () => {
    console.log("Módulo Escala Sobreaviso v6.8 Iniciado.");
    
    const monthSelector = document.getElementById('month-selector');
    const atendimentoModal = document.getElementById('atendimento-modal');
    const signatureModal = document.getElementById('signature-modal');
    const signaturePlaceholder = document.getElementById('signature-placeholder');
    const hiddenSigInput = document.getElementById('signature-data');
    const atendimentoForm = document.getElementById('atendimento-form');
    const inputNumOS = document.getElementById('os_numero');
    const chkSemOS = document.getElementById('sem_os_checkbox');
    const selectExecutadoPor = document.getElementById('executado_por');
    const btnGenerateReport = document.getElementById('btn-generate-pdf');
    const btnSaveSchedule = document.getElementById('btn-save-schedule'); // NOVO BOTAO

    // Conectar o botão Salvar
    if (btnSaveSchedule) {
        btnSaveSchedule.onclick = saveScheduleToFirebase;
    }

    if (atendimentoForm) atendimentoForm.setAttribute('novalidate', '');

    if (selectExecutadoPor) {
        selectExecutadoPor.innerHTML = '<option value="" disabled selected>Selecione o técnico</option>';
        TECHNICIANS.forEach(tech => {
            const opt = document.createElement('option');
            opt.value = tech; opt.textContent = tech;
            selectExecutadoPor.appendChild(opt);
        });
    }

    if (monthSelector) {
        const now = new Date();
        monthSelector.value = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2, '0')}`;
        loadAndDisplaySchedule(now.getFullYear(), now.getMonth() + 1);
        monthSelector.onchange = () => {
            const [y, m] = monthSelector.value.split('-').map(Number);
            loadAndDisplaySchedule(y, m);
        };
    }

    if (btnGenerateReport) {
        btnGenerateReport.onclick = async () => {
            const currentSelection = monthSelector.value;
            if (!currentSelection) return alert("Selecione um mês primeiro.");
            
            const [year, month] = currentSelection.split('-').map(Number);
            
            const weeks = getWeeksInMonth(year, month);
            const localAssignmentRecord = [];
            const scheduleTable = [];

            weeks.forEach((week, i) => {
                const row = [];
                row.push({ content: `${i + 1}ª Sem.`, isHoliday: false });
                
                week.days.forEach(day => {
                    if (day) {
                        const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
                        const isHoliday = !!(HOLIDAYS_LIST[dateStr] || holidayOverrides[dateStr]);
                        row.push({ content: String(day.getDate()), isHoliday: isHoliday });
                    } else {
                        row.push({ content: "", isHoliday: false });
                    }
                });

                const weekKey = `week_${i}`;
                let techName = "";
                if (technicianOverrides && technicianOverrides[weekKey]) {
                    techName = technicianOverrides[weekKey];
                } else {
                    if (i === 0) {
                        const firstValidDay = week.days.find(d => d instanceof Date);
                        techName = getBaselineTechnician(firstValidDay);
                    } else {
                        const prevTech = localAssignmentRecord[i - 1];
                        const prevIdx = TECHNICIANS.indexOf(prevTech);
                        techName = TECHNICIANS[(prevIdx + 1) % TECHNICIANS.length];
                    }
                }
                localAssignmentRecord[i] = techName;
                row.push({ content: techName, isHoliday: false });
                
                scheduleTable.push(row);
            });

            const combinedHolidays = { ...HOLIDAYS_LIST, ...holidayOverrides };
            const holidaysArrayList = Object.keys(combinedHolidays).sort().map(dateStr => {
                const day = dateStr.split('-')[2];
                return `Dia ${parseInt(day)}: ${combinedHolidays[dateStr]}`;
            });

            const { summary, overtimeTotals } = calculateSummaryTotals();
            const summaryTable = TECHNICIANS.map(tech => {
                const sb = summary[tech].standbyHours;
                const ot = overtimeTotals[tech] || 0;
                return [tech, formatHours(sb), formatHours(ot), formatHours(sb - ot)];
            });

            const attendanceTable = currentAtendimentos
                .sort((a, b) => a.data.localeCompare(b.data))
                .map(at => [
                    formatDateBR(at.data, true).trim(), 
                    at.os_numero,
                    at.executado_por,
                    at.hora_inicio,
                    at.hora_termino,
                    formatHours(calculateDurationInHours(at.hora_inicio, at.hora_termino))
                ]);

            const fileName = `Relatorio-Sobreaviso-${currentSelection}.pdf`;

            console.log(`Gerando relatório completo para ${currentSelection} (v6.8)...`);
            try {
                await generateMonthlyReportPDF(
                    currentSelection,   
                    scheduleTable,      
                    summaryTable,        
                    attendanceTable,    
                    holidaysArrayList,  
                    currentAtendimentos, 
                    fileName             
                );
            } catch (err) {
                console.error("Erro no motor de PDF:", err);
                alert("Erro ao processar PDF: " + err.message);
            }
        };
    }

    try {
        const sigConfig = {
            modal: signatureModal, canvas: document.getElementById('signature-pad'),
            saveButton: document.getElementById('signature-save-button'),
            clearButton: document.getElementById('signature-clear-button'),
            undoButton: document.getElementById('signature-undo-button'),
            cancelButton: document.getElementById('signature-cancel-button'),
            errorMessage: document.getElementById('signature-error-message'),
            orientationMessage: document.getElementById('orientation-message')
        };
        if (sigConfig.canvas && sigConfig.modal) signaturePadManager = new SignaturePadManager(sigConfig);
    } catch (e) { console.error("Erro SignaturePad:", e); }

    if (signaturePlaceholder) {
        signaturePlaceholder.onclick = (e) => {
            e.preventDefault();
            signaturePadManager.open((dataUrl) => {
                if (dataUrl) {
                    signaturePlaceholder.innerHTML = `<img src="${dataUrl}" class="signature-thumbnail" style="max-height: 80px; margin: auto;">`;
                    if (hiddenSigInput) hiddenSigInput.value = dataUrl;
                }
            });
        };
    }

    const btnLaunch = document.getElementById('btn-launch-atendimento');
    if (btnLaunch) btnLaunch.onclick = () => {
        editingAtendimentoId = null; atendimentoForm.reset();
        signaturePlaceholder.innerHTML = "Clique para assinar"; hiddenSigInput.value = "";
        showModal(atendimentoModal);
    };
    
    const btnCancelAtendimento = document.getElementById('btn-cancel-atendimento');
    if (btnCancelAtendimento) btnCancelAtendimento.onclick = (e) => { e.preventDefault(); hideModal(atendimentoModal); };

    if (chkSemOS && inputNumOS) {
        chkSemOS.addEventListener('change', () => {
            inputNumOS.disabled = chkSemOS.checked;
            if (chkSemOS.checked) {
                inputNumOS.removeAttribute('required'); inputNumOS.value = ""; inputNumOS.classList.add('bg-gray-100');
            } else {
                inputNumOS.setAttribute('required', 'required'); inputNumOS.classList.remove('bg-gray-100');
            }
        });
    }

    if (atendimentoForm) {
        atendimentoForm.onsubmit = async (e) => {
            e.preventDefault();
            const formData = new FormData(atendimentoForm);
            const data = Object.fromEntries(formData.entries());
            const isSemOS = chkSemOS.checked;
            if (!isSemOS && (!data.os_numero || data.os_numero.trim() === "")) return alert("Informe a OS ou marque SEM OS.");
            if (!data.executado_por) return alert("Selecione o técnico.");
            if (calculateDurationInHours(data.hora_inicio, data.hora_termino) <= 0) return alert("Horário inválido.");
            if (!hiddenSigInput.value) return alert("A assinatura é obrigatória.");
            try {
                const docId = monthSelector.value;
                const finalData = { ...data, os_numero: isSemOS ? "SEM OS" : data.os_numero, signature: hiddenSigInput.value, timestamp: new Date() };
                if (editingAtendimentoId) await updateDoc(doc(db, "escalaSobreaviso", docId, "atendimentos", editingAtendimentoId), finalData);
                else await addDoc(collection(db, "escalaSobreaviso", docId, "atendimentos"), finalData);
                hideModal(atendimentoModal); atendimentoForm.reset();
            } catch (err) { alert("Erro ao salvar: " + err.message); }
        };
    }
});