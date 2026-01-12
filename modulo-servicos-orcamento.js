/**
 * modulo-servicos-orcamento.js
 * Módulo para gerenciar Serviços de um orçamento (com descrição e valor).
 * Exporta a classe QuoteServicesManager.
 */
export class QuoteServicesManager {
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
        if (document.getElementById('quote-services-manager-modal')) return;

        this.modalElement = document.createElement('div');
        this.modalElement.id = 'quote-services-manager-modal';
        this.modalElement.className = 'fixed inset-0 bg-gray-600 bg-opacity-75 overflow-y-auto h-full w-full hidden z-[1050] flex items-center justify-center p-4';
        this.modalElement.innerHTML = `
            <style>
                 .services-table-row-desktop { display: none; }
                 .services-table-head { display: none; }
                 .services-table-row-mobile {
                    display: block;
                    border-bottom: 1px solid #e5e7eb;
                    padding: 0.75rem 0.5rem;
                 }
                 .service-description-mobile {
                    font-weight: 600;
                    color: #1f2937;
                    display: block;
                    margin-bottom: 0.5rem;
                 }
                 .service-details-mobile {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    font-size: 0.875rem;
                    color: #4b5563;
                 }
                 .service-actions-mobile { display: flex; gap: 0.5rem; }

                @media (min-width: 641px) {
                    .services-table-row-desktop { display: table-row; }
                    .services-table-head { display: table-header-group; }
                    .services-table-row-mobile { display: none; }
                }
            </style>
            <div class="relative mx-auto p-5 border w-full max-w-2xl shadow-lg rounded-md bg-white">
                <div class="mt-3">
                    <h3 class="text-lg leading-6 font-medium text-gray-900 mb-4 text-center">Gerir Serviços do Orçamento</h3>
                    
                    <div id="item-form-services" class="p-4 border rounded-md bg-gray-50 mb-4">
                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
                            <div class="form-group sm:col-span-1">
                                <label for="service-description" class="block text-sm font-medium text-gray-700">Descrição do Serviço</label>
                                <input type="text" id="service-description" class="uppercase-input mt-1 block w-full p-2 border border-gray-300 rounded-md shadow-sm">
                            </div>
                            <div class="form-group sm:col-span-1">
                                <label for="service-value" class="block text-sm font-medium text-gray-700">Valor (R$)</label>
                                <input type="text" id="service-value" class="mt-1 block w-full p-2 border border-gray-300 rounded-md shadow-sm" placeholder="0,00">
                            </div>
                        </div>
                        <div class="flex justify-end space-x-2 mt-3">
                            <div id="add-mode-btns-services">
                                <button type="button" id="add-service-btn" class="px-4 py-2 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700">+ Adicionar</button>
                            </div>
                            <div id="edit-mode-btns-services" class="hidden">
                                <button type="button" id="update-service-btn" class="px-4 py-2 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700">Atualizar</button>
                                <button type="button" id="cancel-edit-btn-services" class="px-4 py-2 bg-gray-500 text-white font-semibold rounded-lg hover:bg-gray-600">Cancelar</button>
                            </div>
                        </div>
                    </div>

                    <div class="max-h-60 overflow-y-auto border-t border-b">
                        <table class="min-w-full bg-white">
                            <thead class="sticky top-0 bg-gray-100 z-10 services-table-head">
                                <tr>
                                    <th class="px-4 py-2 text-left text-sm font-semibold text-gray-600">Descrição</th>
                                    <th class="px-4 py-2 text-right text-sm font-semibold text-gray-600 w-32">Valor</th>
                                    <th class="px-4 py-2 w-24 text-center">Ações</th>
                                </tr>
                            </thead>
                            <tbody id="services-table-body-quote"></tbody>
                        </table>
                        <div id="no-services-message-quote" class="text-center text-gray-500 py-4">Nenhum serviço adicionado.</div>
                    </div>

                    <div class="items-center px-4 py-3 mt-4 flex justify-end gap-3">
                        <button id="cancel-services-modal-btn-quote" class="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300 font-semibold">Cancelar</button>
                        <button id="confirm-services-modal-btn-quote" class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 font-semibold">Confirmar</button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(this.modalElement);

        this.tableBody = this.modalElement.querySelector('#services-table-body-quote');
        this.noItemsMessage = this.modalElement.querySelector('#no-services-message-quote');
        this.descriptionInput = this.modalElement.querySelector('#service-description');
        this.valueInput = this.modalElement.querySelector('#service-value');
        
        this.addModeBtns = this.modalElement.querySelector('#add-mode-btns-services');
        this.editModeBtns = this.modalElement.querySelector('#edit-mode-btns-services');
        this.addItemBtn = this.modalElement.querySelector('#add-service-btn');
        this.updateItemBtn = this.modalElement.querySelector('#update-service-btn');
        this.cancelEditBtn = this.modalElement.querySelector('#cancel-edit-btn-services');
        
        this.confirmButton = this.modalElement.querySelector('#confirm-services-modal-btn-quote');
        this.cancelButton = this.modalElement.querySelector('#cancel-services-modal-btn-quote');
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
                const valor = this._parseCurrency(item.valor);

                //--- VERSÃO DESKTOP ---
                const rowDesktop = this.tableBody.insertRow();
                rowDesktop.className = 'services-table-row-desktop';
                rowDesktop.innerHTML = `
                    <td class="p-2">${item.descricao}</td>
                    <td class="text-right p-2">${this._formatCurrency(valor)}</td>
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
                rowMobile.className = 'services-table-row-mobile';
                rowMobile.innerHTML = `
                    <td colspan="3">
                        <div class="service-description-mobile">${item.descricao}</div>
                        <div class="service-details-mobile">
                            <span><strong>Valor:</strong> ${this._formatCurrency(valor)}</span>
                            <div class="service-actions-mobile">
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
        const descricao = this.descriptionInput.value.trim().toUpperCase();
        const valor = this.valueInput.value.trim();
        if (descricao && valor) {
            this.items.push({ descricao, valor });
            this._renderItems();
            this._clearForm();
            this.descriptionInput.focus();
        }
    }
    
    _startEdit(index) {
        this.editingIndex = index;
        const item = this.items[index];
        this.descriptionInput.value = item.descricao;
        this.valueInput.value = item.valor;
        this.addModeBtns.classList.add('hidden');
        this.editModeBtns.classList.remove('hidden');
        this.descriptionInput.focus();
    }

    _updateItem() {
        if (this.editingIndex === null) return;
        const descricao = this.descriptionInput.value.trim().toUpperCase();
        const valor = this.valueInput.value.trim();
        if (descricao && valor) {
            this.items[this.editingIndex] = { descricao, valor };
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
        this.descriptionInput.value = '';
        this.valueInput.value = '';
    }
    
    getItems() {
        return this.items;
    }
}

