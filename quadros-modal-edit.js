/**
 * quadros-modal-edit.js
 * Responsável por gerenciar todo o ciclo de EDIÇÃO da OS dentro do modal.
 * Inclui: Formulário, EquipmentSelector, Lógica de Lote (Batch), Peças e Salvamento.
 */
import { doc, updateDoc, collection, query, where, getDocs, deleteField, arrayUnion } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";
import { EquipmentSelector } from './equipment-selector.js';
import { PartsManager } from './modulo-pecas.js';

export class EditModalManager {
    constructor(db, signaturePadManager) {
        this.db = db;
        this.signaturePadManager = signaturePadManager;
        this.activeEquipmentSelector = null;
        this.activePartsManager = null;
        this.currentParts = [];
        
        // Estado para Lote
        this.batchItemsEdit = [];
        this.contractInventoryCache = [];
        this.isBatchMode = false;
        
        // Callbacks externos
        this.onSaveSuccess = () => {};
    }

    /**
     * Inicia o modo de edição no modal.
     * @param {Object} order - Dados da OS.
     * @param {HTMLElement} modalBody - O elemento onde o HTML será injetado.
     */
    async render(order, modalBody) {
        // 1. Detectar modo Lote
        this.isBatchMode = (order.itens && order.itens.length > 0) || 
                           (order.contrato === 'Contrato Nº 138/2024' && order.equipamento && order.equipamento.toUpperCase().includes('ESFIGMO'));
        
        this.batchItemsEdit = order.itens || [];
        // Fallback: Se virou lote agora mas tinha 1 item, converte o item único para lista
        if (this.isBatchMode && this.batchItemsEdit.length === 0 && order.equipamento) {
            this.batchItemsEdit.push({
                nome: order.equipamento,
                marca: order.marca || '',
                modelo: order.modelo || '',
                serial: order.serial || '',
                patrimonio: '',
                local: order.local_atendimento || ''
            });
        }

        // 2. Gerar HTML
        modalBody.innerHTML = this.generateHTML(order);

        // 3. Inicializar Componentes Lógicos
        await this.initializeLogic(order);
    }

    generateHTML(order) {
        const isSigned = order.signature_data && order.signature_data.length > 200;
        let signatureSectionHtml = isSigned 
            ? `<img src="${order.signature_data}" class="signature-thumbnail" alt="Assinatura">` 
            : `<div id="signature-placeholder-details" class="signature-placeholder is-clickable">Adicionar Assinatura</div>`;
        
        let attendanceFields = '', equipmentFields = '';
        let desconsiderarCheckboxHtml = '';

        if (order.contrato === 'Contrato Nº 10/2025') {
            desconsiderarCheckboxHtml = `<div class="checkbox-group mb-5"><input type="checkbox" id="edit-desconsiderar-assinatura-check" ${order.assinaturaDesconsiderada ? 'checked' : ''}><label for="edit-desconsiderar-assinatura-check">Desconsiderar Assinatura</label></div>`;
        }

        // Campos de Data/Local
        if (order.contrato === 'Contrato N° 03/2024') {
             attendanceFields = `<div class="form-group"><label for="edit_data_servico">Data do Serviço:</label><input type="date" id="edit_data_servico" value="${order.data_servico||''}"></div><div class="form-group"><label>Hora de Chegada:</label><input type="time" id="edit_hora_chegada" value="${order.hora_chegada||''}"></div><div class="form-group"><label>Hora de Saída:</label><input type="time" id="edit_hora_saida" value="${order.hora_saida||''}"></div>`;
             equipmentFields = `<div class="bg-gray-100 p-4 rounded-md"><p><strong>Equipamento:</strong> ${order.equipamento}</p><p><strong>Marca:</strong> ${order.marca}</p><p><strong>Modelo:</strong> ${order.modelo}</p><p><strong>Serial:</strong> ${order.serial}</p></div>`;
        } else {
            attendanceFields = `<div class="form-group"><label for="edit_data_retirada">Data da Retirada:</label><input type="date" id="edit_data_retirada" value="${order.data_retirada||''}"></div><div class="form-group"><label for="edit_data_devolucao">Data da Devolução:</label><input type="date" id="edit_data_devolucao" value="${order.data_devolucao||''}"></div>`;
            
            // Definição das opções de local
            let locations = order.contrato && order.contrato.includes('138/2024') ? ['PA','UBS CENTRAL','UBS CASABOM','UBS I - PARQUE FRAGATA','UBS II - JARDIM AMÉRICA','UBS III - JARDIM AMÉRICA','CAPS'] : ['GO1', 'GO2', 'GO3', 'GO4', 'PMGUPEL'];
            
            // Lógica para definir qual local deve aparecer selecionado
            let selectedLocation = order.local_atendimento;

            // --- AJUSTE SOLICITADO ---
            // Se for Modo Lote e contrato 138/2024, força o local para "SECRETARIA DE SAÚDE"
            if (this.isBatchMode && order.contrato && order.contrato.includes('138/2024')) {
                const batchLocation = 'SECRETARIA DE SAÚDE';
                // Garante que a opção existe na lista
                if (!locations.includes(batchLocation)) {
                    locations.push(batchLocation);
                }
                // Força a seleção visual
                selectedLocation = batchLocation;
            }

            attendanceFields += `<div class="form-group"><label for="edit_local_atendimento">Local:</label><select id="edit_local_atendimento">${locations.map(l => `<option value="${l}" ${selectedLocation === l ? 'selected' : ''}>${l}</option>`).join('')}</select></div>`;
            
            if (this.isBatchMode) {
                // HTML LOTE (Batch)
                equipmentFields = `
                <div class="bg-blue-50 p-4 rounded border border-blue-200 mb-4">
                    <h3 class="text-sm font-bold text-blue-800 mb-2">Gerenciar Itens do Lote (Esfigmomanômetros)</h3>
                    <div class="bg-white p-3 rounded border border-gray-300 mb-3 shadow-sm">
                        <label class="block text-xs text-gray-500 mb-1">Adicionar Item:</label>
                        <div class="grid grid-cols-1 md:grid-cols-4 gap-2 mb-2">
                            <input type="text" id="batch-search-name" placeholder="Nome" class="form-input text-sm p-1 border rounded" value="ESFIGMO">
                            <input type="text" id="batch-search-brand" placeholder="Marca/Modelo" class="form-input text-sm p-1 border rounded">
                            <input type="text" id="batch-search-serial" placeholder="Nº Série" class="form-input text-sm p-1 border rounded">
                            <input type="text" id="batch-search-loc" placeholder="Local" class="form-input text-sm p-1 border rounded">
                        </div>
                        <div class="flex justify-between items-center">
                            <span id="cache-status-text-edit" class="text-xs text-gray-400">Pronto.</span>
                            <div class="flex gap-2">
                                <button type="button" id="btn-batch-search-edit" class="bg-blue-600 text-white px-3 py-1 rounded text-xs font-medium">Buscar</button>
                                <button type="button" id="btn-add-manual-batch-edit" class="bg-gray-200 text-gray-700 px-3 py-1 rounded text-xs font-medium">Manual</button>
                                <button type="button" id="btn-reload-inventory-edit" class="bg-gray-100 text-gray-600 px-2 py-1 rounded text-xs hover:bg-gray-200" title="Recarregar Inventário">↻</button>
                            </div>
                        </div>
                    </div>
                    <div id="batch-search-results-edit" class="hidden bg-white border border-gray-200 rounded max-h-40 overflow-y-auto mb-3"></div>
                    <div id="batch-list-edit" class="max-h-60 overflow-y-auto space-y-2 bg-white p-2 rounded border border-gray-200 min-h-[100px]"></div>
                    <div class="mt-1 text-right text-xs text-gray-600">Total: <span id="batch-count-edit" class="font-bold">0</span></div>
                </div>`;
            } else {
                // HTML ITEM ÚNICO (Novo Seletor)
                equipmentFields = `
                    <div id="search-panel_edit" class="mb-4">
                        <p class="text-xs text-gray-500 mb-2">Busque para alterar o equipamento:</p>
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-2 mb-3">
                            <input type="text" id="search-eq_edit" placeholder="Nome" class="form-input text-sm p-2 border rounded">
                            <input type="text" id="search-brand_edit" placeholder="Marca/Modelo" class="form-input text-sm p-2 border rounded">
                            <input type="text" id="search-serial_edit" placeholder="Nº Série" class="form-input text-sm p-2 border rounded">
                            <input type="text" id="search-loc_edit" placeholder="Local" class="form-input text-sm p-2 border rounded">
                        </div>
                        <button type="button" id="btn-search-eq_edit" class="bg-blue-600 text-white px-4 py-2 rounded text-sm w-full">Pesquisar</button>
                    </div>
                    <div id="search-results_edit" class="hidden bg-white border border-gray-200 rounded-lg shadow-sm max-h-60 overflow-y-auto mb-4"></div>
                    <div id="selected-card_edit" class="hidden bg-green-50 border border-green-200 rounded-lg p-4 flex justify-between items-center">
                        <div>
                            <p class="text-sm font-bold text-green-800" id="sel-eq-name_edit">Equipamento</p>
                            <p class="text-xs text-green-700" id="sel-eq-details_edit">Detalhes</p>
                        </div>
                        <button type="button" id="btn-change-eq_edit" class="text-xs bg-white border border-green-300 text-green-700 px-3 py-1 rounded hover:bg-green-100">Alterar</button>
                    </div>
                    <div id="final-inputs-container_edit" class="hidden grid grid-cols-1 gap-2 mt-4 p-4 bg-gray-50 border border-dashed border-gray-300 rounded">
                        <div class="flex justify-between items-center"><h4 class="text-sm font-semibold text-gray-600">Manual</h4><button type="button" id="btn-cancel-manual_edit" class="text-xs text-red-500">Cancelar</button></div>
                        <input type="text" id="final-equipamento_edit" class="p-2 border rounded uppercase-input bg-gray-100" placeholder="Nome" readonly>
                        <input type="text" id="final-marca_edit" class="p-2 border rounded uppercase-input bg-gray-100" placeholder="Marca" readonly>
                        <input type="text" id="final-modelo_edit" class="p-2 border rounded uppercase-input bg-gray-100" placeholder="Modelo" readonly>
                        <input type="text" id="final-serial_edit" class="p-2 border rounded uppercase-input bg-gray-100" placeholder="Serial" readonly>
                    </div>
                    <div class="mt-2 text-right">
                        <button type="button" id="btn-manual-entry_edit" class="text-xs text-gray-500 hover:text-blue-600 underline">Inserir manualmente</button>
                    </div>`;
            }
        }

        return `
            <div class="modal-header-container"><div class="modal-header-top"><h1>Editar OS: ${order.os_numero}</h1></div></div>
            <form id="edit-os-form">
                <input type="hidden" id="edit_signature_data" value="${order.signature_data || ''}">
                <div class="form-section"><h2>Dados do Equipamento</h2>${equipmentFields}</div>
                <div class="form-section"><h2>Atendimento</h2>${attendanceFields}</div>
                <div class="form-section">
                    <h2>Serviços e Peças</h2>
                    <div class="form-group"><label for="edit_servicos_realizados">Serviços Realizados:</label><textarea id="edit_servicos_realizados">${order.servicos_realizados||''}</textarea></div>
                    <div class="form-group"><label>Peças Utilizadas:</label><div id="parts-initial-view-edit"><button type="button" class="btn-edit-parts w-full sm:w-auto px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">Gerenciar Peças</button></div><div id="parts-summary-view-edit" class="hidden"><div id="parts-summary-list-edit" class="mb-4 bg-gray-50 p-3 border rounded-md"></div><button type="button" class="btn-edit-parts w-full sm:w-auto px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700">Editar Peças</button></div></div>
                </div>
                <div class="form-section"><h2>Assinaturas</h2>${desconsiderarCheckboxHtml}<div class="signature-area"><div class="signature-grid"><div class="signature-box"><div id="signature-container-details">${signatureSectionHtml}</div><div class="signature-line">Responsável</div></div><div class="signature-box"><img src="./images/assinatura-tecnico.png" style="max-width:200px;"><div class="signature-line">Responsável Técnico</div></div></div></div></div>
                <div class="modal-footer"><button type="submit" class="btn-action btn-save">Salvar Alterações</button></div>
            </form>`;
    }

    async initializeLogic(order) {
        // --- 1. Equipamento ---
        if (this.isBatchMode) {
            this.setupBatchLogic(order);
        } else if (order.contrato !== 'Contrato N° 03/2024') {
            this.setupSingleLogic(order);
        }

        // --- 2. Peças ---
        this.currentParts = Array.isArray(order.pecas_utilizadas) ? [...order.pecas_utilizadas] : [];
        if (!this.activePartsManager) this.activePartsManager = new PartsManager({});
        this.activePartsManager.updateCallbacks({ onConfirm: (updatedParts) => { this.currentParts = updatedParts; this.updatePartsUI(); } });
        document.querySelectorAll('.btn-edit-parts').forEach(btn => btn.addEventListener('click', () => this.activePartsManager.open(this.currentParts)));
        this.updatePartsUI();

        // --- 3. Assinatura ---
        const signatureContainer = document.getElementById('signature-container-details');
        const desconsiderarCheck = document.getElementById('edit-desconsiderar-assinatura-check');
        
        if (signatureContainer) {
            signatureContainer.addEventListener('click', () => {
                if (desconsiderarCheck && desconsiderarCheck.checked) return;
                const signatureModal = document.getElementById('signature-modal-details');
                if (signatureModal) {
                    signatureModal.style.display = 'flex'; 
                    this.signaturePadManager.open((dataUrl) => {
                        document.getElementById('edit_signature_data').value = dataUrl;
                        signatureContainer.innerHTML = `<img src="${dataUrl}" class="signature-thumbnail" alt="Assinatura">`;
                        if (desconsiderarCheck) {
                            desconsiderarCheck.checked = false;
                            desconsiderarCheck.dispatchEvent(new Event('change'));
                        }
                    });
                }
            });
        }

        if (desconsiderarCheck) {
            const signatureArea = document.querySelector('.signature-area');
            desconsiderarCheck.addEventListener('change', () => {
                const signatureImg = signatureContainer.querySelector('img');
                if (desconsiderarCheck.checked) {
                    signatureArea.style.opacity = '0.5';
                    signatureArea.style.pointerEvents = 'none';
                    if (!signatureImg) signatureContainer.innerHTML = `<div class="signature-placeholder">Assinatura não necessária</div>`;
                } else {
                    signatureArea.style.opacity = '1';
                    signatureArea.style.pointerEvents = 'auto';
                    if (!signatureImg) signatureContainer.innerHTML = `<div class="signature-placeholder is-clickable">Adicionar Assinatura</div>`;
                }
            });
        }

        // --- 4. Submit ---
        document.getElementById('edit-os-form').addEventListener('submit', (e) => {
            e.preventDefault();
            this.saveChanges(order.id);
        });
        
        // Auto grow textareas
        const ta = document.getElementById('edit_servicos_realizados');
        if(ta) {
            ta.addEventListener('input', () => { ta.style.height = 'auto'; ta.style.height = (ta.scrollHeight) + 'px'; });
            ta.style.height = 'auto'; ta.style.height = (ta.scrollHeight) + 'px';
        }
    }

    // --- HELPER: Converter Nome do Contrato para Código do Banco ---
    getContractCode(contractName) {
        if (!contractName) return null;
        if (contractName.includes('138/2024')) return '138/2024';
        if (contractName.includes('10/2025')) return '10/2025';
        if (contractName.includes('03/2024')) return '03/2024';
        return contractName; // Fallback se já estiver no formato correto
    }

    // --- Lógica Single Item ---
    async setupSingleLogic(order) {
        const contractCode = this.getContractCode(order.contrato);
        this.currentContractCode = contractCode; // Salva para uso
        
        this.activeEquipmentSelector = new EquipmentSelector({ 
            contractId: contractCode,
            database: this.db,
            elements: { 
                searchInputs: {
                    name: document.getElementById('search-eq_edit'),
                    brand: document.getElementById('search-brand_edit'),
                    serial: document.getElementById('search-serial_edit'),
                    loc: document.getElementById('search-loc_edit')
                },
                btnSearch: document.getElementById('btn-search-eq_edit'),
                resultsContainer: document.getElementById('search-results_edit'),
                selectedCard: {
                    container: document.getElementById('selected-card_edit'),
                    nameEl: document.getElementById('sel-eq-name_edit'),
                    detailsEl: document.getElementById('sel-eq-details_edit'),
                    btnChange: document.getElementById('btn-change-eq_edit')
                },
                finalInputs: {
                    container: document.getElementById('final-inputs-container_edit'),
                    equipamento: document.getElementById('final-equipamento_edit'),
                    marca: document.getElementById('final-equipamento_edit'),
                    modelo: document.getElementById('final-modelo_edit'),
                    serial: document.getElementById('final-serial_edit')
                },
                manualMode: {
                    btnTrigger: document.getElementById('btn-manual-entry_edit'),
                    btnCancel: document.getElementById('btn-cancel-manual_edit'),
                    searchPanel: document.getElementById('search-panel_edit'),
                    locationSelect: document.getElementById('edit_local_atendimento')
                }
            } 
        });
        await this.activeEquipmentSelector.init();
        this.activeEquipmentSelector.prefill(order);
    }

    // --- Lógica Batch (Lote) ---
    async setupBatchLogic(order) {
        this.renderBatchList();
        
        const contractCode = this.getContractCode(order.contrato);
        const originalName = order.contrato;
        this.currentContractCode = contractCode || originalName;
        
        // Passa ambos: o código calculado e o nome original para tentativa de fallback
        await this.ensureInventoryLoaded(contractCode, originalName);

        document.getElementById('btn-batch-search-edit').addEventListener('click', () => this.performBatchSearch());
        
        // Botão de recarregar manual
        document.getElementById('btn-reload-inventory-edit').addEventListener('click', async () => {
             this.contractInventoryCache = [];
             await this.ensureInventoryLoaded(contractCode, originalName);
        });

        ['batch-search-name', 'batch-search-brand', 'batch-search-serial', 'batch-search-loc'].forEach(id => {
            const el = document.getElementById(id);
            if(el) el.addEventListener('keypress', (e) => { if(e.key === 'Enter') { e.preventDefault(); this.performBatchSearch(); }});
        });

        document.getElementById('btn-add-manual-batch-edit').addEventListener('click', () => {
            const serial = prompt("Digite o Número de Série:");
            if (!serial) return;
            this.batchItemsEdit.push({
                nome: "ESFIGMOMANÔMETRO",
                marca: "GENÉRICO",
                modelo: "",
                serial: serial.toUpperCase(),
                patrimonio: "",
                local: "Manual"
            });
            this.renderBatchList();
        });
        
        window.removeBatchItemEdit = (index) => {
            this.batchItemsEdit.splice(index, 1);
            this.renderBatchList();
        };
    }

    renderBatchList() {
        const listContainer = document.getElementById('batch-list-edit');
        const countDisplay = document.getElementById('batch-count-edit');
        if(!listContainer) return;

        if (this.batchItemsEdit.length === 0) {
            listContainer.innerHTML = '<div class="text-center text-gray-400 py-4 text-xs italic">Lista vazia.</div>';
        } else {
            listContainer.innerHTML = this.batchItemsEdit.map((item, idx) => `
                <div class="batch-item">
                    <div class="flex flex-col">
                        <div class="flex items-center gap-2">
                            <span class="font-mono text-xs font-bold text-gray-800">${item.serial || 'S/N'}</span>
                            ${item.patrimonio ? `<span class="text-[10px] bg-gray-200 px-1 rounded text-gray-600">Pat: ${item.patrimonio}</span>` : ''}
                        </div>
                        <span class="text-[10px] text-gray-500">${item.nome} - ${item.marca}</span>
                    </div>
                    <button type="button" onclick="removeBatchItemEdit(${idx})" class="text-red-500 hover:text-red-700 p-1" title="Remover">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                    </button>
                </div>
            `).join('');
        }
        if(countDisplay) countDisplay.textContent = this.batchItemsEdit.length;
    }

    normalizeStr(str) {
        return String(str || '').normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim();
    }

    async ensureInventoryLoaded(contractCode, originalName = null) {
        if (!contractCode && !originalName) {
            console.error("Código do contrato inválido.");
            document.getElementById('cache-status-text-edit').textContent = "Erro: Sem Contrato";
            return;
        }

        if (this.contractInventoryCache.length > 0) {
             document.getElementById('cache-status-text-edit').textContent = `${this.contractInventoryCache.length} itens (Cache)`;
             return;
        }
        
        const statusEl = document.getElementById('cache-status-text-edit');
        statusEl.textContent = "Carregando...";
        
        try {
            console.log(`Tentativa 1: Buscando inventário para: '${contractCode}'`);
            
            // Tentativa 1: Pelo código curto (ex: 138/2024)
            let q = query(collection(this.db, "inventory_equipment"), where("contract", "==", contractCode));
            let snap = await getDocs(q);
            
            // Tentativa 2: Se vazio, tenta pelo nome original (ex: Contrato Nº 138/2024)
            // Isso cobre casos onde o banco foi salvo com o nome completo
            if (snap.empty && originalName && originalName !== contractCode) {
                console.log(`Tentativa 2 (Fallback): Buscando inventário para: '${originalName}'`);
                q = query(collection(this.db, "inventory_equipment"), where("contract", "==", originalName));
                snap = await getDocs(q);
            }
            
            this.contractInventoryCache = [];
            snap.forEach(doc => {
                const d = doc.data();
                // Mapeamento Robusto (Igual ao EquipmentSelector)
                const name = d.name || d.equipamento || '';
                const brand = d.brand || d.marca || '';
                const model = d.model || d.modelo || '';
                const serial = d.serial || d.serie || d.num_serie || '';
                const patrimonio = d.patrimonio || '';
                const local = d.location || d.localizacao || d.setor || '';

                const fullText = [name, brand, model, serial, patrimonio, local].map(this.normalizeStr).join(' ');
                
                this.contractInventoryCache.push({ 
                    id: doc.id, 
                    ...d, 
                    // Campos normalizados para uso garantido na busca
                    _name: name,
                    _brand: brand,
                    _model: model,
                    _serial: serial,
                    _local: local,
                    _fullSearch: fullText 
                });
            });
            
            console.log(`Inventário carregado: ${this.contractInventoryCache.length} itens.`);
            
            if (this.contractInventoryCache.length === 0) {
                 statusEl.textContent = "Vazio (0 itens).";
                 statusEl.classList.add('text-red-500');
            } else {
                 statusEl.textContent = `${this.contractInventoryCache.length} itens.`;
                 statusEl.classList.remove('text-red-500');
                 statusEl.classList.add('text-green-600');
            }

        } catch (e) { 
            console.error("Erro ao carregar inventário:", e);
            statusEl.textContent = "Erro na busca.";
            statusEl.classList.add('text-red-500');
        }
    }

    performBatchSearch() {
        const container = document.getElementById('batch-search-results-edit');
        container.innerHTML = '';
        container.classList.remove('hidden');
        
        const tName = this.normalizeStr(document.getElementById('batch-search-name').value);
        const tBrand = this.normalizeStr(document.getElementById('batch-search-brand').value);
        const tSerial = this.normalizeStr(document.getElementById('batch-search-serial').value);
        const tLoc = this.normalizeStr(document.getElementById('batch-search-loc').value);

        // Se o cache estiver vazio, avisa o usuário com opção de retry
        if (this.contractInventoryCache.length === 0) {
             container.innerHTML = `
             <div class="p-3 text-center">
                <p class="text-xs text-red-500 font-bold mb-1">Inventário não carregado ou vazio.</p>
                <p class="text-[10px] text-gray-500 mb-2">Código usado: ${this.currentContractCode || '?'}</p>
                <button type="button" id="btn-force-reload-search" class="text-xs bg-gray-200 px-2 py-1 rounded hover:bg-gray-300">
                    Tentar Novamente
                </button>
             </div>`;
             
             setTimeout(() => {
                 document.getElementById('btn-force-reload-search')?.addEventListener('click', () => {
                     document.getElementById('btn-reload-inventory-edit').click();
                 });
             }, 100);
             return;
        }

        const matches = this.contractInventoryCache.filter(item => {
            // Filtro ESPECÍFICO PARA LOTE DE ESFIGMO
            // Agora verifica nos campos mapeados (_fullSearch é seguro agora)
            if (!item._fullSearch.includes('ESFIGMO') && !item._fullSearch.includes('PRESSAO')) return false;
            
            // Compara com os campos normalizados seguros
            if (tName && !this.normalizeStr(item._name).includes(tName)) return false;
            if (tBrand && !this.normalizeStr(item._brand).includes(tBrand) && !this.normalizeStr(item._model).includes(tBrand)) return false;
            if (tSerial && !this.normalizeStr(item._serial).includes(tSerial) && !this.normalizeStr(item.patrimonio).includes(tSerial)) return false;
            if (tLoc && !this.normalizeStr(item._local).includes(tLoc)) return false;
            return true;
        }).slice(0, 30);

        if (matches.length === 0) {
            container.innerHTML = '<div class="p-2 text-xs text-gray-500">Nenhum item encontrado.</div>';
            return;
        }

        matches.forEach(item => {
            const div = document.createElement('div');
            div.className = 'batch-search-result-item';
            // Usa os campos seguros (_name, _serial) para exibição
            div.innerHTML = `<div class="flex justify-between"><span class="font-bold text-xs">${item._name}</span><span class="font-mono text-xs text-blue-700">${item._serial || 'S/N'}</span></div><div class="text-xs text-gray-500">${item._brand} ${item._model} - ${item._local || ''}</div>`;
            div.addEventListener('click', () => {
                const serialCheck = (item._serial || '').toUpperCase();
                // Evita duplicatas pelo serial
                if (this.batchItemsEdit.some(i => i.serial === serialCheck && serialCheck !== '')) {
                    alert('Item já na lista.'); return;
                }
                this.batchItemsEdit.push({ 
                    nome: item._name, 
                    marca: item._brand, 
                    modelo: item._model, 
                    serial: item._serial, 
                    patrimonio: item.patrimonio || '', 
                    local: item._local 
                });
                this.renderBatchList();
                container.classList.add('hidden');
            });
            container.appendChild(div);
        });
    }

    updatePartsUI() {
        const partsInitial = document.getElementById('parts-initial-view-edit');
        const partsSummary = document.getElementById('parts-summary-view-edit');
        const partsList = document.getElementById('parts-summary-list-edit');
        if (this.currentParts.length > 0) {
            partsInitial.classList.add('hidden');
            partsSummary.classList.remove('hidden');
            partsList.innerHTML = `<ul class="list-disc pl-5 space-y-1">${this.currentParts.map(p => `<li><strong>${p.qtd}x</strong> - ${p.descricao}</li>`).join('')}</ul>`;
        } else {
            partsInitial.classList.remove('hidden');
            partsSummary.classList.add('hidden');
        }
    }

    async saveChanges(orderId) {
        const form = document.getElementById('edit-os-form');
        let updatedData = {};

        if (this.isBatchMode) {
            if (this.batchItemsEdit.length === 0) { alert("Lote vazio. Adicione ao menos um item ou arquive a OS."); return; }
            const count = this.batchItemsEdit.length;
            updatedData = {
                equipamento: `${this.batchItemsEdit[0].nome} (LOTE: ${count} un.)`,
                marca: "VÁRIAS", modelo: "VÁRIOS", serial: "VER LISTA",
                itens: this.batchItemsEdit
            };
        } else {
            updatedData = this.activeEquipmentSelector ? this.activeEquipmentSelector.getSelection() : {};
            updatedData.itens = deleteField();
        }
        
        // Campos fixos
        const fields = ['data_servico', 'hora_chegada', 'hora_saida', 'data_retirada', 'data_devolucao', 'local_atendimento'];
        fields.forEach(f => { if(form[f]) updatedData[f] = form[f].value; });
        
        updatedData.servicos_realizados = document.getElementById('edit_servicos_realizados').value;
        updatedData.pecas_utilizadas = this.currentParts;
        updatedData.signature_data = document.getElementById('edit_signature_data').value;
        
        const desconsiderarCheck = form.querySelector('#edit-desconsiderar-assinatura-check');
        if (desconsiderarCheck) {
            updatedData.assinaturaDesconsiderada = desconsiderarCheck.checked;
            if (desconsiderarCheck.checked) updatedData.signature_data = ''; 
        }
        if (updatedData.signature_data) updatedData.assinaturaDesconsiderada = false;

        // Histórico
        const historyEntries = [{ action: 'Editada', details: this.isBatchMode ? 'Lote de equipamentos editado.' : 'Os dados da OS foram alterados.', timestamp: new Date() }];
        updatedData.history = arrayUnion(...historyEntries);

        if (updatedData.signature_data) updatedData.signedAt = new Date(); // Simplificação

        try {
            await updateDoc(doc(this.db, "orders", orderId), updatedData);
            this.onSaveSuccess();
        } catch (error) { console.error("Erro ao salvar:", error); alert("Erro ao salvar."); }
    }
}