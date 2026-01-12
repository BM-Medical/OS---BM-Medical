/**
 * modulo-pecas-orcamento.js
 * Módulo para gerenciar Peças de um orçamento (com quantidade, descrição e valor).
 * Exporta a classe QuotePartsManager.
 */
export class QuotePartsManager {
    /**
     * @param {object} options - Opções de configuração.
     * @param {Array<object>} options.initialItems - A lista inicial de itens.
     * @param {function} options.onConfirm - Callback executado ao confirmar. Recebe a lista de itens.
     * @param {function} options.onCancel - Callback executado ao cancelar/fechar.
     */
    constructor({ initialItems = [], onConfirm = () => {}, onCancel = () => {} }) {
        this.items = JSON.parse(JSON.stringify(initialItems));
        this.onConfirm = onConfirm;
        this.onCancel = onCancel;
        this.modalElement = null;
        this.editingIndex = null;

        this._createModal();
        this._attachEventListeners();
    }

    // --- Funções Utilitárias de Moeda ---
    _parseCurrency(value) {
        if (typeof value !== 'string') return 0;
        const number = parseFloat(value.replace(/\./g, '').replace(',', '.').replace('R$', '').trim());
        return isNaN(number) ? 0 : number;
    }

    _formatCurrency(value) {
        if (isNaN(value)) value = 0;
        return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
    }

    _applyCurrencyMask(input) {
        let value = input.value.replace(/\D/g, '');
        value = (value / 100).toFixed(2) + '';
        value = value.replace(".", ",");
        value = value.replace(/(\d)(?=(\d{3})+(?!\d))/g, '$1.');
        input.value = value;
    }

    _createModal() {
        if (document.getElementById('quote-parts-manager-modal')) return;

        this.modalElement = document.createElement('div');
        this.modalElement.id = 'quote-parts-manager-modal';
        this.modalElement.className = 'fixed inset-0 bg-gray-600 bg-opacity-75 overflow-y-auto h-full w-full hidden z-[1050] flex items-center justify-center p-4';
        this.modalElement.innerHTML = `
            <style>
                .parts-table-row-desktop { display: none; }
                .parts-table-head { display: none; }
                .parts-table-row-mobile {
                    display: block;
                    border-bottom: 1px solid #e5e7eb;
                    padding: 0.75rem 0.5rem;
                }
                .part-description-mobile {
                    font-weight: 600;
                    color: #1f2937;
                    display: block;
                    margin-bottom: 0.5rem;
                }
                .part-details-mobile {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    font-size: 0.875rem;
                    color: #4b5563;
                }
                .part-info-mobile { display: flex; gap: 1rem; }
                .part-actions-mobile { display: flex; gap: 0.5rem; }

                @media (min-width: 641px) {
                    .parts-table-row-desktop { display: table-row; }
                    .parts-table-head { display: table-header-group; }
                    .parts-table-row-mobile { display: none; }
                }
            </style>
            <div class="relative mx-auto p-5 border w-full max-w-2xl shadow-lg rounded-md bg-white">
                <div class="mt-3">
                    <h3 class="text-lg leading-6 font-medium text-gray-900 mb-4 text-center">Gerir Peças do Orçamento</h3>
                    
                    <div id="item-form-parts" class="p-4 border rounded-md bg-gray-50 mb-4">
                        <div class="flex flex-col sm:flex-row items-start sm:items-end space-y-2 sm:space-y-0 sm:space-x-2 mb-3">
                            <div class="w-full sm:w-auto">
                                <label for="part-quantity" class="block text-sm font-medium text-gray-700 text-left">Qtd.</label>
                                <div class="flex items-center mt-1">
                                    <button type="button" id="part-quantity-decrement" class="px-3 py-2 bg-gray-200 text-lg font-bold rounded-l-md hover:bg-gray-300 leading-none">-</button>
                                    <input type="text" id="part-quantity" value="1" min="1" class="w-16 text-center border-t border-b p-2 outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none">
                                    <button type="button" id="part-quantity-increment" class="px-3 py-2 bg-gray-200 text-lg font-bold rounded-r-md hover:bg-gray-300 leading-none">+</button>
                                </div>
                            </div>
                            <div class="w-full sm:flex-grow">
                                <label for="part-description" class="block text-sm font-medium text-gray-700 text-left">Descrição da Peça</label>
                                <input type="text" id="part-description" class="uppercase-input mt-1 block w-full p-2 border border-gray-300 rounded-md shadow-sm">
                            </div>
                        </div>
                        <div class="form-group mt-2">
                                <label for="part-value" class="block text-sm font-medium text-gray-700">Valor Unitário (R$)</label>
                                <input type="text" id="part-value" class="mt-1 block w-full p-2 border border-gray-300 rounded-md shadow-sm" placeholder="0,00">
                        </div>
                        <div class="flex justify-end space-x-2 mt-3">
                            <div id="add-mode-btns-parts">
                                <button type="button" id="add-part-btn" class="px-4 py-2 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700">+ Adicionar</button>
                            </div>
                            <div id="edit-mode-btns-parts" class="hidden">
                                <button type="button" id="update-part-btn" class="px-4 py-2 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700">Atualizar</button>
                                <button type="button" id="cancel-edit-btn-parts" class="px-4 py-2 bg-gray-500 text-white font-semibold rounded-lg hover:bg-gray-600">Cancelar</button>
                            </div>
                        </div>
                    </div>

                    <div class="max-h-60 overflow-y-auto border-t border-b">
                        <table class="min-w-full bg-white">
                            <thead class="sticky top-0 bg-gray-100 z-10 parts-table-head">
                                <tr>
                                    <th class="px-4 py-2 text-center text-sm font-semibold text-gray-600 w-20">Qtd.</th>
                                    <th class="px-4 py-2 text-left text-sm font-semibold text-gray-600">Descrição</th>
                                    <th class="px-4 py-2 text-right text-sm font-semibold text-gray-600 w-32">Valor Unit.</th>
                                    <th class="px-4 py-2 w-24 text-center">Ações</th>
                                </tr>
                            </thead>
                            <tbody id="parts-table-body-quote"></tbody>
                        </table>
                        <div id="no-parts-message-quote" class="text-center text-gray-500 py-4">Nenhuma peça adicionada.</div>
                    </div>

                    <div class="items-center px-4 py-3 mt-4 flex justify-end gap-3">
                        <button id="cancel-parts-modal-btn-quote" class="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300 font-semibold">Cancelar</button>
                        <button id="confirm-parts-modal-btn-quote" class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 font-semibold">Confirmar</button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(this.modalElement);

        this.tableBody = this.modalElement.querySelector('#parts-table-body-quote');
        this.noItemsMessage = this.modalElement.querySelector('#no-parts-message-quote');
        this.quantityInput = this.modalElement.querySelector('#part-quantity');
        this.descriptionInput = this.modalElement.querySelector('#part-description');
        this.valueInput = this.modalElement.querySelector('#part-value');
        
        this.addModeBtns = this.modalElement.querySelector('#add-mode-btns-parts');
        this.editModeBtns = this.modalElement.querySelector('#edit-mode-btns-parts');
        this.addItemBtn = this.modalElement.querySelector('#add-part-btn');
        this.updateItemBtn = this.modalElement.querySelector('#update-part-btn');
        this.cancelEditBtn = this.modalElement.querySelector('#cancel-edit-btn-parts');
        
        this.confirmButton = this.modalElement.querySelector('#confirm-parts-modal-btn-quote');
        this.cancelButton = this.modalElement.querySelector('#cancel-parts-modal-btn-quote');

        this.decrementBtn = this.modalElement.querySelector('#part-quantity-decrement');
        this.incrementBtn = this.modalElement.querySelector('#part-quantity-increment');
    }

    _attachEventListeners() {
        this.addItemBtn.addEventListener('click', () => this._addItem());
        this.updateItemBtn.addEventListener('click', () => this._updateItem());
        this.cancelEditBtn.addEventListener('click', () => this._cancelEdit());

        this.valueInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                if (this.editingIndex !== null) this._updateItem();
                else this._addItem();
            }
        });
        
        this.valueInput.addEventListener('input', () => this._applyCurrencyMask(this.valueInput));

        this.confirmButton.addEventListener('click', () => {
            this.onConfirm(this.getItems());
            this.close();
        });
        
        this.cancelButton.addEventListener('click', () => {
            this.onCancel();
            this.close();
        });

        this.modalElement.addEventListener('click', (e) => {
            if (e.target === this.modalElement) {
                this.onCancel();
                this.close();
            }
        });

        this.incrementBtn.addEventListener('click', () => {
            this.quantityInput.value = parseInt(this.quantityInput.value, 10) + 1;
        });
        this.decrementBtn.addEventListener('click', () => {
            const currentVal = parseInt(this.quantityInput.value, 10);
            if (currentVal > 1) {
                this.quantityInput.value = currentVal - 1;
            }
        });
        this.quantityInput.addEventListener('input', () => {
            this.quantityInput.value = this.quantityInput.value.replace(/[^0-9]/g, '');
            if (this.quantityInput.value === '' || parseInt(this.quantityInput.value, 10) < 1) {
                setTimeout(() => {
                    if (this.quantityInput.value === '' || parseInt(this.quantityInput.value, 10) < 1) {
                        this.quantityInput.value = 1;
                    }
                }, 100);
            }
        });
    }
    
    open(currentItems = []) {
        this.items = JSON.parse(JSON.stringify(currentItems)); 
        this._cancelEdit();
        this._renderItems();
        this.modalElement.classList.remove('hidden');
        this.descriptionInput.focus();
    }

    close() {
        this.modalElement.classList.add('hidden');
    }

    _renderItems() {
        this.tableBody.innerHTML = '';
        const hasItems = this.items.length > 0;

        this.noItemsMessage.style.display = hasItems ? 'none' : 'block';
        this.tableBody.parentElement.style.display = hasItems ? 'table' : 'none';

        if (hasItems) {
            this.items.forEach((item, index) => {
                const valorUnit = this._parseCurrency(item.valorUnit);

                //--- VERSÃO DESKTOP ---
                const rowDesktop = this.tableBody.insertRow();
                rowDesktop.className = 'parts-table-row-desktop';
                rowDesktop.innerHTML = `
                    <td class="text-center p-2">${item.qtd}</td>
                    <td class="p-2">${item.descricao}</td>
                    <td class="text-right p-2">${this._formatCurrency(valorUnit)}</td>
                    <td class="p-2">
                        <div class="flex justify-center items-center space-x-2">
                            <button type="button" class="p-1 text-gray-500 hover:text-blue-600 btn-edit-item" data-index="${index}" title="Editar">
                                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg>
                            </button>
                            <button type="button" class="p-1 text-gray-500 hover:text-red-600 btn-remove-item" data-index="${index}" title="Remover">
                                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                            </button>
                        </div>
                    </td>
                `;

                //--- VERSÃO MOBILE ---
                const rowMobile = this.tableBody.insertRow();
                rowMobile.className = 'parts-table-row-mobile';
                rowMobile.innerHTML = `
                    <td colspan="4">
                        <div class="part-description-mobile">${item.descricao}</div>
                        <div class="part-details-mobile">
                            <div class="part-info-mobile">
                               <span><strong>Qtd:</strong> ${item.qtd}</span>
                               <span><strong>Valor:</strong> ${this._formatCurrency(valorUnit)}</span>
                            </div>
                            <div class="part-actions-mobile">
                                <button type="button" class="p-1 text-gray-500 hover:text-blue-600 btn-edit-item" data-index="${index}" title="Editar">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg>
                                </button>
                                <button type="button" class="p-1 text-gray-500 hover:text-red-600 btn-remove-item" data-index="${index}" title="Remover">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                                </button>
                            </div>
                        </div>
                    </td>
                `;

                // Adiciona os event listeners aos botões em ambas as versões
                this.tableBody.querySelectorAll(`.btn-edit-item[data-index="${index}"]`).forEach(btn => btn.addEventListener('click', (e) => this._startEdit(parseInt(e.currentTarget.dataset.index, 10))));
                this.tableBody.querySelectorAll(`.btn-remove-item[data-index="${index}"]`).forEach(btn => btn.addEventListener('click', (e) => this._removeItem(parseInt(e.currentTarget.dataset.index, 10))));
            });
        }
    }

    _addItem() {
        const qtd = parseInt(this.quantityInput.value, 10);
        const descricao = this.descriptionInput.value.trim().toUpperCase();
        const valorUnit = this.valueInput.value.trim();

        if (descricao && valorUnit && qtd > 0) {
            this.items.push({ qtd, descricao, valorUnit });
            this._renderItems();
            this._clearForm();
            this.descriptionInput.focus();
        }
    }
    
    _startEdit(index) {
        this.editingIndex = index;
        const item = this.items[index];
        this.quantityInput.value = item.qtd;
        this.descriptionInput.value = item.descricao;
        this.valueInput.value = item.valorUnit;

        this.addModeBtns.classList.add('hidden');
        this.editModeBtns.classList.remove('hidden');
        this.descriptionInput.focus();
    }

    _updateItem() {
        if (this.editingIndex === null) return;

        const qtd = parseInt(this.quantityInput.value, 10);
        const descricao = this.descriptionInput.value.trim().toUpperCase();
        const valorUnit = this.valueInput.value.trim();

        if (descricao && valorUnit && qtd > 0) {
            this.items[this.editingIndex] = { qtd, descricao, valorUnit };
            this._renderItems();
            this._cancelEdit();
        }
    }
    
    _cancelEdit() {
        this.editingIndex = null;
        this._clearForm();
        this.addModeBtns.classList.remove('hidden');
        this.editModeBtns.classList.add('hidden');
    }

    _removeItem(index) {
        this.items.splice(index, 1);
        if (this.editingIndex === index) {
            this._cancelEdit();
        }
        this._renderItems();
    }

    _clearForm() {
        this.quantityInput.value = 1;
        this.descriptionInput.value = '';
        this.valueInput.value = '';
    }
    
    getItems() {
        return this.items;
    }
}

