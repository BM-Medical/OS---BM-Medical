/**
 * equipment-selector.js
 * Módulo para gerenciar a seleção de equipamentos via BUSCA FLEXÍVEL.
 * ATUALIZADO:
 * 1. Busca ignora acentos (Normalization NFD).
 * 2. Compatibilidade v9.15.0 mantida.
 */
import { collection, getDocs, query, where } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";

// Log para confirmar carregamento
console.log("Módulo equipment-selector.js carregado (v9.15.0 - Accent Insensitive)!");

export class EquipmentSelector {
    constructor({ contractId, database, elements }) {
        this.isBroken = false;

        if (!elements) {
            console.error("❌ ERRO NO SELETOR: Objeto 'elements' não fornecido.");
            this.isBroken = true;
            this.elements = {}; 
        } else {
            this.elements = elements;
        }

        if (!database) {
            console.error("❌ ERRO CRÍTICO: Instância 'database' (db) não foi passada para o seletor.");
            this.isBroken = true;
        } else {
            this.db = database;
        }

        this.contractId = contractId || null;
        this.inventory = [];
        this.isManualMode = false;
    }

    setContractId(id) {
        if (this.isBroken) return;
        this.contractId = id;
        this.inventory = [];
    }

    async init() {
        if (this.isBroken) return;
        if (!this.contractId) {
            this.attachEventListeners();
            return;
        }
        await this.loadInventory();
        this.attachEventListeners();
    }

    async loadInventory() {
        if (this.isBroken || !this.contractId || !this.db) return;

        const cacheKey = `inventory_${this.contractId}`;
        try {
            const cachedInventory = sessionStorage.getItem(cacheKey);
            if (cachedInventory && cachedInventory !== '[]') {
                this.inventory = JSON.parse(cachedInventory);
                console.log(`📦 Inventário (Cache): ${this.inventory.length} itens.`);
            } else {
                console.log(`☁️ Buscando inventário no Firebase...`);
                const q = query(collection(this.db, "inventory_equipment"), where("contract", "==", this.contractId));
                const querySnapshot = await getDocs(q);
                this.inventory = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                
                if (this.inventory.length > 0) {
                    sessionStorage.setItem(cacheKey, JSON.stringify(this.inventory));
                }
            }
        } catch (error) {
            console.error("Erro ao carregar inventário: ", error);
        }
    }

    attachEventListeners() {
        if (this.isBroken) return;

        const { btnSearch, searchInputs, manualMode, selectedCard } = this.elements;

        if (btnSearch) {
            const newBtn = btnSearch.cloneNode(true);
            btnSearch.parentNode.replaceChild(newBtn, btnSearch);
            this.elements.btnSearch = newBtn;
            newBtn.addEventListener('click', () => this.performSearch());
        }

        if (searchInputs) {
            Object.values(searchInputs).forEach(input => {
                if(input) {
                    input.addEventListener('keypress', (e) => {
                        if (e.key === 'Enter') {
                            e.preventDefault();
                            this.performSearch();
                        }
                    });
                }
            });
        }

        selectedCard?.btnChange?.addEventListener('click', () => this.resetSelection());
        manualMode?.btnTrigger?.addEventListener('click', () => this.enableManualMode());
        manualMode?.btnCancel?.addEventListener('click', () => this.disableManualMode());
    }

    // --- FUNÇÃO AUXILIAR DE NORMALIZAÇÃO ---
    // Remove acentos e caracteres especiais para comparação
    normalizeStr(str) {
        if (!str) return "";
        return str.toString()
            .normalize("NFD") // Separa acentos das letras
            .replace(/[\u0300-\u036f]/g, "") // Remove os acentos
            .toLowerCase()
            .trim();
    }

    performSearch() {
        if (this.isBroken) return;
        
        if (!this.contractId) {
            alert("Selecione um contrato/cliente primeiro.");
            return;
        }

        const { searchInputs, resultsContainer } = this.elements;
        if (!searchInputs || !resultsContainer) return;

        // Normaliza os termos de busca digitados
        const criteria = {
            name: this.normalizeStr(searchInputs.name?.value),
            brand: this.normalizeStr(searchInputs.brand?.value),
            serial: this.normalizeStr(searchInputs.serial?.value),
            loc: this.normalizeStr(searchInputs.loc?.value)
        };

        const hasCriteria = Object.values(criteria).some(val => val.length > 0);
        if (!hasCriteria) {
            alert("Digite algo para pesquisar.");
            return;
        }

        resultsContainer.innerHTML = '<p class="p-4 text-gray-500 text-center">Pesquisando...</p>';
        resultsContainer.classList.remove('hidden');

        // Filtra usando a normalização
        const results = this.inventory.filter(item => {
            // Normaliza os dados do item para comparação
            const iName = this.normalizeStr(item.name || item.equipamento);
            const iBrand = this.normalizeStr(item.brand || item.marca);
            const iModel = this.normalizeStr(item.model || item.modelo);
            const iSerial = this.normalizeStr(item.serial || item.num_serie || item.serie);
            const iLoc = this.normalizeStr(item.location || item.localizacao || item.setor);

            const matchName = !criteria.name || iName.includes(criteria.name);
            // Marca busca em Marca E Modelo
            const matchBrand = !criteria.brand || iBrand.includes(criteria.brand) || iModel.includes(criteria.brand);
            const matchSerial = !criteria.serial || iSerial.includes(criteria.serial);
            const matchLoc = !criteria.loc || iLoc.includes(criteria.loc);

            return matchName && matchBrand && matchSerial && matchLoc;
        });

        this.renderResults(results);
    }

    renderResults(results) {
        const { resultsContainer } = this.elements;
        if (!resultsContainer) return;
        
        resultsContainer.innerHTML = '';

        if (results.length === 0) {
            resultsContainer.innerHTML = `
                <div class="p-4 text-center">
                    <p class="text-red-500 font-medium">Nenhum equipamento encontrado.</p>
                    <p class="text-xs text-gray-400 mt-1">Tente a inserção manual.</p>
                </div>
            `;
            return;
        }

        results.forEach(item => {
            const row = document.createElement('div');
            row.className = 'flex justify-between items-center p-3 border-b hover:bg-gray-50 transition-colors last:border-b-0 cursor-pointer';
            
            // Tratamento de campos híbridos (inglês/português)
            const name = item.name || item.equipamento || 'Sem Nome';
            const brand = item.brand || item.marca || '';
            const model = item.model || item.modelo || '';
            const serial = item.serial || item.serie || item.num_serie || 'N/A';
            const location = item.location || item.localizacao || item.setor || 'Sem Local';

            row.innerHTML = `
                <div>
                    <p class="font-bold text-sm text-gray-800">${name}</p>
                    <p class="text-xs text-gray-500">
                        ${brand} ${model} - S/N: ${serial}
                    </p>
                    <p class="text-xs text-blue-600 font-medium">${location}</p>
                </div>
                <button type="button" class="bg-blue-100 text-blue-700 px-3 py-1 rounded text-xs font-bold hover:bg-blue-200">
                    Selecionar
                </button>
            `;
            
            row.addEventListener('click', () => this.selectItem(item));
            resultsContainer.appendChild(row);
        });
    }

    selectItem(item) {
        const { finalInputs, selectedCard, resultsContainer, manualMode } = this.elements;
        if (!finalInputs) return;

        // Mapeamento inteligente de campos
        const name = item.name || item.equipamento || '';
        const brand = item.brand || item.marca || '';
        const model = item.model || item.modelo || '';
        const serial = item.serial || item.serie || item.num_serie || '';
        const location = item.location || item.localizacao || item.setor || '';

        if (finalInputs.equipamento) {
            finalInputs.equipamento.value = name;
            finalInputs.equipamento.dispatchEvent(new Event('input', { bubbles: true }));
        }
        if (finalInputs.marca) finalInputs.marca.value = brand;
        if (finalInputs.modelo) finalInputs.modelo.value = model;
        if (finalInputs.serial) finalInputs.serial.value = serial;

        if (location && manualMode?.locationSelect) {
            manualMode.locationSelect.value = location;
        }

        if (selectedCard) {
            if (selectedCard.nameEl) {
                selectedCard.nameEl.textContent = name || 'Equipamento Selecionado';
            }
            if (selectedCard.detailsEl) {
                selectedCard.detailsEl.textContent = `${brand} ${model} - S/N: ${serial}`;
            }
            if (selectedCard.container) selectedCard.container.classList.remove('hidden');
        }
        
        manualMode?.searchPanel?.classList.add('hidden');
        resultsContainer?.classList.add('hidden');
        finalInputs.container?.classList.add('hidden');
    }

    resetSelection() {
        const { selectedCard, manualMode, finalInputs } = this.elements;

        if (finalInputs) {
            if (finalInputs.equipamento) {
                finalInputs.equipamento.value = '';
                finalInputs.equipamento.dispatchEvent(new Event('input'));
            }
            if (finalInputs.marca) finalInputs.marca.value = '';
            if (finalInputs.modelo) finalInputs.modelo.value = '';
            if (finalInputs.serial) finalInputs.serial.value = '';
            finalInputs.container?.classList.add('hidden');
        }

        selectedCard?.container?.classList.add('hidden');
        // Importante: Limpar o texto para disparar o MutationObserver corretamente na página pai
        if (selectedCard?.nameEl) selectedCard.nameEl.textContent = ''; 
        
        manualMode?.searchPanel?.classList.remove('hidden');
    }

    enableManualMode() {
        const { manualMode, selectedCard, resultsContainer, finalInputs } = this.elements;
        
        manualMode?.searchPanel?.classList.add('hidden');
        resultsContainer?.classList.add('hidden');
        selectedCard?.container?.classList.add('hidden');
        
        if(manualMode?.btnTrigger?.parentElement) {
            manualMode.btnTrigger.parentElement.classList.add('hidden');
        }

        if (finalInputs?.container) {
            finalInputs.container.classList.remove('hidden');
            
            [finalInputs.equipamento, finalInputs.marca, finalInputs.modelo, finalInputs.serial].forEach(input => {
                if(input) {
                    input.removeAttribute('readonly');
                    input.classList.remove('bg-gray-100');
                    input.classList.add('bg-white');
                    input.value = '';
                }
            });
        }

        manualMode?.btnCancel?.classList.remove('hidden');
        this.isManualMode = true;
    }

    disableManualMode() {
        const { manualMode, finalInputs } = this.elements;

        finalInputs?.container?.classList.add('hidden');
        manualMode?.btnCancel?.classList.add('hidden');

        if (finalInputs) {
            [finalInputs.equipamento, finalInputs.marca, finalInputs.modelo, finalInputs.serial].forEach(input => {
                if(input) {
                    input.setAttribute('readonly', true);
                    input.classList.add('bg-gray-100');
                    input.classList.remove('bg-white');
                }
            });
        }

        manualMode?.searchPanel?.classList.remove('hidden');
        if(manualMode?.btnTrigger?.parentElement) {
            manualMode.btnTrigger.parentElement.classList.remove('hidden');
        }
        this.isManualMode = false;
    }
}