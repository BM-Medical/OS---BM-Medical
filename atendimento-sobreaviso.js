import { initializeApp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-app.js";
import { getFirestore, doc, getDoc, runTransaction } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";
import { SignaturePadManager } from './signature-pad-helper.js';
import { generateAtendimentoPdf } from './pdf-generator-atendimento.js';

// --- CONFIGURAÇÃO ---
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
const TECHNICIANS = ["Jonas da Silva", "Miguel Martins", "Siberi Eslabão"];

// --- ELEMENTOS DO DOM ---
const form = document.getElementById('atendimento-form');
const osNumeroInput = document.getElementById('os_numero');
const dataInput = document.getElementById('data');
const executadoPorSelect = document.getElementById('executado_por');
const signatureContainer = document.getElementById('signature-container');
const signatureDataInput = document.getElementById('signature-data');

// --- INICIALIZAÇÃO DO SIGNATURE PAD ---
const signaturePadManager = new SignaturePadManager({
    modal: document.getElementById('signature-modal'),
    canvas: document.getElementById('signature-pad'),
    saveButton: document.getElementById('signature-save-button'),
    clearButton: document.getElementById('signature-clear-button'),
    undoButton: document.getElementById('signature-undo-button'),
    cancelButton: document.getElementById('signature-cancel-button'),
    errorMessage: document.getElementById('signature-error-message')
});

// --- FUNÇÕES ---

// ATUALIZAÇÃO: Removida a função fetchAndSetOsNumber

function populateTechnicians() {
    TECHNICIANS.forEach(tech => {
        const option = document.createElement('option');
        option.value = tech;
        option.textContent = tech;
        executadoPorSelect.appendChild(option);
    });
}

/**
 * ATUALIZAÇÃO: Adicionada máscara de formatação para OS (AA.XXXX)
 */
function formatOsNumber(e) {
    let value = e.target.value.replace(/\D/g, ''); // Remove tudo que não é dígito
    if (value.length > 6) {
        value = value.substring(0, 6); // Limita a 6 dígitos (2 ano + 4 seq)
    }
    
    if (value.length > 2) {
        value = value.substring(0, 2) + '.' + value.substring(2);
    }
    
    e.target.value = value;
}

async function handleFormSubmit(e) {
    e.preventDefault();
    const btn = document.getElementById('btn-generate-pdf');
    btn.disabled = true;
    btn.textContent = 'Gerando...';

    const formData = new FormData(form);
    const atendimentoData = {
        os_numero: formData.get('os_numero'),
        data: formData.get('data'),
        // ATUALIZAÇÃO: Removido campo "equipamento"
        motivo_chamado: formData.get('motivo_chamado'),
        servico_executado: formData.get('servico_executado'),
        executado_por: formData.get('executado_por'),
        hora_inicio: formData.get('hora_inicio'),
        hora_termino: formData.get('hora_termino'),
        nome_solicitante: formData.get('nome_solicitante'),
        siape: formData.get('siape'),
        signature_data: formData.get('signature_data')
    };

    try {
        // Gera o PDF
        await generateAtendimentoPdf(atendimentoData);
        
        // ATUALIZAÇÃO: Removida a lógica de atualização do contador
        
        // Limpa o formulário e busca um novo número de OS
        form.reset();
        signatureContainer.innerHTML = '<div id="signature-placeholder" class="signature-placeholder">Clique para assinar</div>';
        dataInput.value = new Date().toISOString().split('T')[0];
        // ATUALIZAÇÃO: Removida a chamada fetchAndSetOsNumber()

    } catch (error) {
        console.error("Erro no processo de geração do documento:", error);
        alert("Ocorreu um erro ao gerar o documento. Tente novamente.");
    } finally {
        btn.disabled = false;
        btn.textContent = 'Gerar Documento';
    }
}

// --- INICIALIZAÇÃO E EVENTOS ---
document.addEventListener('DOMContentLoaded', () => {
    populateTechnicians();
    // ATUALIZAÇÃO: Removida a chamada fetchAndSetOsNumber()
    dataInput.value = new Date().toISOString().split('T')[0];

    // ATUALIZAÇÃO: Adicionado listener para a máscara
    osNumeroInput.addEventListener('input', formatOsNumber);

    signatureContainer.addEventListener('click', () => {
        signaturePadManager.open((dataUrl) => {
            signatureDataInput.value = dataUrl;
            signatureContainer.innerHTML = `<img src="${dataUrl}" class="signature-thumbnail" alt="Assinatura">`;
        });
    });

    form.addEventListener('submit', handleFormSubmit);
});

