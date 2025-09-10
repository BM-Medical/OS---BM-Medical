/**
 * equipment-selector.js
 * Módulo para gerenciar a seleção de equipamentos em cascata (Equipamento -> Marca -> Modelo -> Serial).
 * Exporta a classe EquipmentSelector.
 */
import { getFirestore, collection, getDocs, query, where } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";

export class EquipmentSelector {
    /**
     * @param {object} config - Objeto de configuração.
     * @param {string} config.contractId - O ID do contrato para filtrar o inventário.
     * @param {object} config.elements - Os elementos do DOM a serem controlados.
     */
    constructor({ contractId, elements }) {
        if (!contractId || !elements) {
            throw new Error("ID do Contrato e elementos do DOM são obrigatórios.");
        }
        this.contractId = contractId;
        this.elements = elements;
        this.db = getFirestore();
        this.inventory = [];

        this.init();
    }

    async init() {
        this.attachEventListeners();
        await this.loadInventory();
    }

    async loadInventory() {
        const { equipmentSelect } = this.elements;
        const cacheKey = `inventory_${this.contractId}`;
        try {
            // Prioriza o cache da sessão para evitar múltiplas leituras do DB
            const cachedInventory = sessionStorage.getItem(cacheKey);
            if (cachedInventory && cachedInventory !== '[]') {
                this.inventory = JSON.parse(cachedInventory);
            } else {
                const q = query(collection(this.db, "inventory_equipment"), where("contract", "==", this.contractId));
                const querySnapshot = await getDocs(q);
                this.inventory = querySnapshot.docs.map(doc => doc.data());
                if (this.inventory.length > 0) {
                    sessionStorage.setItem(cacheKey, JSON.stringify(this.inventory));
                }
            }
            this.populateEquipmentSelect();
        } catch (error) {
            console.error("Erro ao carregar inventário: ", error);
            if (equipmentSelect) {
                equipmentSelect.innerHTML = `<option value="" disabled selected>Erro ao carregar</option>`;
            }
        }
    }

    populateSelectWithOptions(selectElement, options, defaultText) {
        selectElement.innerHTML = `<option value="" disabled selected>${defaultText}</option>`;
        options.forEach(opt => {
            const option = document.createElement('option');
            option.value = opt;
            option.textContent = opt;
            selectElement.appendChild(option);
        });
        const otherOption = document.createElement('option');
        otherOption.value = 'Outro';
        otherOption.textContent = 'Outro (Digitar Manualmente)';
        selectElement.appendChild(otherOption);
    }

    populateEquipmentSelect() {
        if (!this.elements.equipmentSelect) return;
        const equipmentNames = [...new Set(this.inventory.map(item => item.name))].sort();
        this.populateSelectWithOptions(this.elements.equipmentSelect, equipmentNames, "Selecione um equipamento");
    }
    
    resetAndDisable(select, manualDiv, manualInput) {
        if (select) {
            select.innerHTML = '';
            select.disabled = true;
        }
        if (manualDiv) manualDiv.style.display = 'none';
        if (manualInput) {
            manualInput.value = '';
            manualInput.required = false;
        }
    }

    attachEventListeners() {
        const {
            equipmentSelect, brandSelect, modelSelect, serialSelect,
            manualEquipmentDiv, manualBrandDiv, manualModelDiv, manualSerialDiv,
            equipmentManualInput, brandManualInput, modelManualInput, serialManualInput,
            locationSelect
        } = this.elements;

        if (equipmentSelect) {
            equipmentSelect.addEventListener('change', () => {
                const selected = equipmentSelect.value;
                this.resetAndDisable(brandSelect, manualBrandDiv, brandManualInput);
                this.resetAndDisable(modelSelect, manualModelDiv, modelManualInput);
                this.resetAndDisable(serialSelect, manualSerialDiv, serialManualInput);
                if(locationSelect) {
                    locationSelect.disabled = false;
                    locationSelect.value = '';
                }

                if (selected === 'Outro') {
                    if (manualEquipmentDiv) manualEquipmentDiv.style.display = 'block';
                    if (equipmentManualInput) equipmentManualInput.required = true;
                    if (brandSelect) {
                       brandSelect.innerHTML = `<option value="Outro" selected>Outro (Digitar Manualmente)</option>`;
                       brandSelect.disabled = false;
                       brandSelect.dispatchEvent(new Event('change'));
                    }
                } else {
                    if (manualEquipmentDiv) manualEquipmentDiv.style.display = 'none';
                    if (equipmentManualInput) equipmentManualInput.required = false;
                    const brands = [...new Set(this.inventory.filter(item => item.name === selected).map(item => item.brand))].sort();
                    this.populateSelectWithOptions(brandSelect, brands, "Selecione a marca");
                    if (brandSelect) brandSelect.disabled = false;
                }
            });
        }

        if (brandSelect) {
            brandSelect.addEventListener('change', () => {
                const selected = brandSelect.value;
                this.resetAndDisable(modelSelect, manualModelDiv, modelManualInput);
                this.resetAndDisable(serialSelect, manualSerialDiv, serialManualInput);
                 if(locationSelect) {
                    locationSelect.disabled = false;
                    locationSelect.value = '';
                }

                if (selected === 'Outro') {
                    if(manualBrandDiv) manualBrandDiv.style.display = 'block';
                    if(brandManualInput) brandManualInput.required = true;
                    if(modelSelect) {
                        modelSelect.innerHTML = `<option value="Outro" selected>Outro (Digitar Manualmente)</option>`;
                        modelSelect.disabled = false;
                        modelSelect.dispatchEvent(new Event('change'));
                    }
                } else {
                    if(manualBrandDiv) manualBrandDiv.style.display = 'none';
                    if(brandManualInput) brandManualInput.required = false;
                    const models = [...new Set(this.inventory.filter(item => item.name === equipmentSelect.value && item.brand === selected).map(item => item.model))].sort();
                    this.populateSelectWithOptions(modelSelect, models, "Selecione o modelo");
                    if (modelSelect) modelSelect.disabled = false;
                }
            });
        }

        if (modelSelect) {
            modelSelect.addEventListener('change', () => {
                const selected = modelSelect.value;
                this.resetAndDisable(serialSelect, manualSerialDiv, serialManualInput);
                 if(locationSelect) {
                    locationSelect.disabled = false;
                    locationSelect.value = '';
                }
                if (selected === 'Outro') {
                    if(manualModelDiv) manualModelDiv.style.display = 'block';
                    if(modelManualInput) modelManualInput.required = true;
                    if(serialSelect) {
                        serialSelect.innerHTML = `<option value="Outro" selected>Outro (Digitar Manualmente)</option>`;
                        serialSelect.disabled = false;
                        serialSelect.dispatchEvent(new Event('change'));
                    }
                } else {
                    if(manualModelDiv) manualModelDiv.style.display = 'none';
                    if(modelManualInput) modelManualInput.required = false;
                    const serials = [...new Set(this.inventory.filter(item => item.name === equipmentSelect.value && item.brand === brandSelect.value && item.model === selected).map(item => item.serial))].sort();
                    this.populateSelectWithOptions(serialSelect, serials, "Selecione o N/S");
                    if (serialSelect) serialSelect.disabled = false;
                }
            });
        }

        if (serialSelect) {
            serialSelect.addEventListener('change', () => {
                const selectedSerial = serialSelect.value;
                if(locationSelect){
                    locationSelect.value = '';
                    locationSelect.disabled = false;
                }
                if (selectedSerial === 'Outro') {
                    if(manualSerialDiv) manualSerialDiv.style.display = 'block';
                    if(serialManualInput) serialManualInput.required = true;
                    return;
                }
                if(manualSerialDiv) manualSerialDiv.style.display = 'none';
                if(serialManualInput) serialManualInput.required = false;
                
                if (!selectedSerial || !locationSelect) return;
                
                const uniqueItem = this.inventory.find(item =>
                    item.name === equipmentSelect.value &&
                    item.brand === brandSelect.value &&
                    item.model === modelSelect.value &&
                    item.serial === selectedSerial
                );
                if (uniqueItem && uniqueItem.location) {
                    locationSelect.value = uniqueItem.location;
                }
            });
        }

        // Garante que todos os inputs manuais fiquem em maiúsculas
        [equipmentManualInput, brandManualInput, modelManualInput, serialManualInput].forEach(input => {
            if (input) {
                input.addEventListener('input', () => {
                    input.value = input.value.toUpperCase();
                });
            }
        });
    }

    /**
     * Retorna os valores selecionados ou inseridos manualmente.
     * @returns {object} Um objeto com os dados do equipamento.
     */
    getSelection() {
        const {
            equipmentSelect, brandSelect, modelSelect, serialSelect,
            equipmentManualInput, brandManualInput, modelManualInput, serialManualInput
        } = this.elements;

        const isManual = (select, input) => select && select.value === 'Outro' && input;

        return {
            equipamento: isManual(equipmentSelect, equipmentManualInput) ? equipmentManualInput.value : (equipmentSelect ? equipmentSelect.value : ''),
            marca: isManual(brandSelect, brandManualInput) ? brandManualInput.value : (brandSelect ? brandSelect.value : ''),
            modelo: isManual(modelSelect, modelManualInput) ? modelManualInput.value : (modelSelect ? modelSelect.value : ''),
            serial: isManual(serialSelect, serialManualInput) ? serialManualInput.value : (serialSelect ? serialSelect.value : '')
        };
    }
}
