/**
 * modulo-pecas.js
 * Módulo para gerenciar a interface de adição e remoção de peças em um modal.
 * Exporta a classe PartsManager.
 */
export class PartsManager {
    /**
     * @param {object} options - Opções de configuração.
     * @param {Array<object>} options.initialParts - A lista inicial de peças.
     * @param {function} options.onConfirm - Callback executado ao confirmar. Recebe a lista de peças.
     * @param {function} options.onCancel - Callback executado ao cancelar/fechar.
     */
    constructor({ initialParts = [], onConfirm = () => {}, onCancel = () => {} }) {
        this.parts = JSON.parse(JSON.stringify(initialParts)); // Cópia profunda para evitar mutação
        this.onConfirm = onConfirm;
        this.onCancel = onCancel;
        this.modalElement = null;
        this.editingIndex = null; // Rastreia o índice da peça sendo editada

        this._createModal();
        this._attachEventListeners();
    }

    /**
     * Updates the callback functions for the manager instance.
     * @param {object} callbacks - The new callback functions.
     * @param {function} [callbacks.onConfirm] - The new onConfirm callback.
     * @param {function} [callbacks.onCancel] - The new onCancel callback.
     */
    updateCallbacks({ onConfirm, onCancel }) {
        if (onConfirm) {
            this.onConfirm = onConfirm;
        }
        if (onCancel) {
            this.onCancel = onCancel;
        }
    }

    _createModal() {
        // Garante que o modal seja criado apenas uma vez
        if (document.getElementById('parts-manager-modal')) return;

        this.modalElement = document.createElement('div');
        this.modalElement.id = 'parts-manager-modal';
        this.modalElement.className = 'fixed inset-0 bg-gray-600 bg-opacity-75 overflow-y-auto h-full w-full hidden z-[1050] flex items-center justify-center p-4';
        this.modalElement.innerHTML = `
            <style>
                /* Remove a borda de foco laranja/azul dos botões de ícone */
                .btn-edit:focus, .btn-remove:focus {
                    outline: none;
                    box-shadow: none;
                }

                /* Estilos para a tabela de peças */
                .parts-table-row {
                    display: table-row; /* Layout padrão para desktop */
                }

                /* Media Query para telas de celular (até 640px) */
                @media (max-width: 640px) {
                    .parts-table-row {
                        display: flex;
                        flex-wrap: wrap;
                        justify-content: space-between;
                        align-items: center;
                        border-bottom: 1px solid #e5e7eb;
                        padding: 0.75rem 0.5rem;
                    }
                    .parts-table-row td {
                        border: none;
                        padding: 0.25rem;
                    }
                    .part-info {
                        display: flex;
                        align-items: center;
                        flex-grow: 1;
                    }
                    .part-quantity {
                        font-weight: bold;
                        font-size: 1.1rem;
                        margin-right: 0.75rem;
                    }
                    .part-description {
                        flex-basis: 100%;
                        order: 1; 
                        margin-bottom: 0.5rem;
                        padding-left: 0 !important;
                    }
                    .part-actions {
                        flex-basis: 100%;
                        order: 2;
                        padding-top: 0.25rem;
                    }
                    .part-actions > div {
                        justify-content: flex-end;
                    }
                }
            </style>
            <div class="relative mx-auto p-5 border w-full max-w-lg shadow-lg rounded-md bg-white">
                <div class="mt-3">
                    <h3 class="text-lg leading-6 font-medium text-gray-900 mb-4 text-center">Gerenciar Peças Utilizadas</h3>
                    
                    <!-- Formulário de Adição/Edição -->
                    <div id="part-form" class="p-4 border rounded-md bg-gray-50 mb-4">
                        <div class="flex flex-col sm:flex-row items-start sm:items-end space-y-2 sm:space-y-0 sm:space-x-2 mb-3">
                            <!-- Seletor de Quantidade -->
                            <div class="w-full sm:w-auto">
                                <label for="part-quantity" class="block text-sm font-medium text-gray-700 text-left">Qtd.</label>
                                <div class="flex items-center mt-1">
                                    <button type="button" id="part-quantity-decrement" class="px-3 py-2 bg-gray-200 text-lg font-bold rounded-l-md hover:bg-gray-300 leading-none">-</button>
                                    <input type="text" id="part-quantity" value="1" min="1" class="w-16 text-center border-t border-b p-2 outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none">
                                    <button type="button" id="part-quantity-increment" class="px-3 py-2 bg-gray-200 text-lg font-bold rounded-r-md hover:bg-gray-300 leading-none">+</button>
                                </div>
                            </div>
                            <!-- Descrição -->
                            <div class="w-full sm:flex-grow">
                                <label for="part-description" class="block text-sm font-medium text-gray-700 text-left">Descrição da Peça</label>
                                <input type="text" id="part-description" class="uppercase-input mt-1 block w-full p-2 border border-gray-300 rounded-md shadow-sm">
                            </div>
                        </div>
                         <!-- Linha dos Botões -->
                        <div class="flex justify-end space-x-2">
                            <div id="add-mode-btns">
                                <button type="button" id="add-part-btn" class="px-4 py-2 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 whitespace-nowrap">+ Adicionar</button>
                            </div>
                            <div id="edit-mode-btns" class="hidden flex space-x-2">
                                <button type="button" id="update-part-btn" class="px-4 py-2 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700 whitespace-nowrap">Atualizar</button>
                                <button type="button" id="cancel-edit-btn" class="px-4 py-2 bg-gray-500 text-white font-semibold rounded-lg hover:bg-gray-600 whitespace-nowrap">Cancelar</button>
                            </div>
                        </div>
                    </div>

                    <!-- Tabela de Peças -->
                    <div class="max-h-60 overflow-y-auto border-t border-b">
                        <table class="min-w-full bg-white">
                            <thead class="sticky top-0 bg-gray-100 z-10 hidden sm:table-header-group">
                                <tr>
                                    <th class="px-4 py-2 text-center text-sm font-semibold text-gray-600 w-20">Qtd.</th>
                                    <th class="px-4 py-2 text-left text-sm font-semibold text-gray-600">Descrição</th>
                                    <th class="px-4 py-2 w-32 text-center">Ações</th>
                                </tr>
                            </thead>
                            <tbody id="parts-table-body"></tbody>
                        </table>
                        <div id="no-parts-message" class="text-center text-gray-500 py-4">Nenhuma peça adicionada.</div>
                    </div>

                    <!-- Rodapé do Modal -->
                    <div class="items-center px-4 py-3 mt-4 flex justify-end gap-3">
                        <button id="cancel-parts-modal-btn" class="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300 font-semibold">Cancelar</button>
                        <button id="confirm-parts-modal-btn" class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 font-semibold">Confirmar</button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(this.modalElement);

        // Mapeia os elementos internos do modal para fácil acesso
        this.tableBody = this.modalElement.querySelector('#parts-table-body');
        this.noPartsMessage = this.modalElement.querySelector('#no-parts-message');
        this.quantityInput = this.modalElement.querySelector('#part-quantity');
        this.descriptionInput = this.modalElement.querySelector('#part-description');
        
        // Botões de ação do formulário
        this.addModeBtns = this.modalElement.querySelector('#add-mode-btns');
        this.editModeBtns = this.modalElement.querySelector('#edit-mode-btns');
        this.addPartBtn = this.modalElement.querySelector('#add-part-btn');
        this.updatePartBtn = this.modalElement.querySelector('#update-part-btn');
        this.cancelEditBtn = this.modalElement.querySelector('#cancel-edit-btn');
        
        // Botões do rodapé
        this.confirmButton = this.modalElement.querySelector('#confirm-parts-modal-btn');
        this.cancelButton = this.modalElement.querySelector('#cancel-parts-modal-btn');

        // Botões do seletor de quantidade
        this.decrementBtn = this.modalElement.querySelector('#part-quantity-decrement');
        this.incrementBtn = this.modalElement.querySelector('#part-quantity-increment');
    }

    _attachEventListeners() {
        // Ações principais
        this.addPartBtn.addEventListener('click', () => this._addPart());
        this.updatePartBtn.addEventListener('click', () => this._updatePart());
        this.cancelEditBtn.addEventListener('click', () => this._cancelEdit());

        // Entrada por teclado
        this.descriptionInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                if (this.editingIndex !== null) {
                    this._updatePart();
                } else {
                    this._addPart();
                }
            }
        });

        // Rodapé do modal
        this.confirmButton.addEventListener('click', () => {
            this.onConfirm(this.getParts());
            this.close();
        });
        
        this.cancelButton.addEventListener('click', () => {
            this.onCancel();
            this.close();
        });

        // Fecha o modal se o usuário clicar fora da área de conteúdo
        this.modalElement.addEventListener('click', (e) => {
            if (e.target === this.modalElement) {
                this.onCancel();
                this.close();
            }
        });

        // Seletor de quantidade
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
    
    open(currentParts = []) {
        this.parts = JSON.parse(JSON.stringify(currentParts)); 
        this._cancelEdit();
        this._renderParts();
        this.modalElement.classList.remove('hidden');
        this.descriptionInput.focus();
    }

    close() {
        this.modalElement.classList.add('hidden');
    }

    _renderParts() {
        this.tableBody.innerHTML = '';
        const hasParts = this.parts.length > 0;

        this.noPartsMessage.style.display = hasParts ? 'none' : 'block';
        this.tableBody.parentElement.style.display = hasParts ? 'table' : 'none';

        if (hasParts) {
            this.parts.forEach((part, index) => {
                const row = this.tableBody.insertRow();
                row.className = 'parts-table-row';
                row.innerHTML = `
                    <td class="part-quantity sm:text-center">${part.qtd}</td>
                    <td class="part-description">${part.descricao}</td>
                    <td class="part-actions">
                        <div class="flex justify-center items-center space-x-3">
                            <button type="button" class="p-1 text-gray-500 hover:text-blue-600 btn-edit" data-index="${index}" title="Editar">
                                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg>
                            </button>
                            <button type="button" class="p-1 text-gray-500 hover:text-red-600 btn-remove" data-index="${index}" title="Remover">
                                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                            </button>
                        </div>
                    </td>
                `;
                row.querySelector('.btn-edit').addEventListener('click', (e) => this._startEdit(parseInt(e.currentTarget.dataset.index, 10)));
                row.querySelector('.btn-remove').addEventListener('click', (e) => this._removePart(parseInt(e.currentTarget.dataset.index, 10)));
            });
        }
    }

    _addPart() {
        const qtd = parseInt(this.quantityInput.value, 10);
        const descricao = this.descriptionInput.value.trim().toUpperCase();

        if (descricao && qtd > 0) {
            this.parts.push({ qtd, descricao });
            this._renderParts();
            this.quantityInput.value = 1;
            this.descriptionInput.value = '';
            this.descriptionInput.focus();
        }
    }
    
    _startEdit(index) {
        this.editingIndex = index;
        const part = this.parts[index];
        this.quantityInput.value = part.qtd;
        this.descriptionInput.value = part.descricao;

        this.addModeBtns.classList.add('hidden');
        this.editModeBtns.classList.remove('hidden');
        this.descriptionInput.focus();
    }

    _updatePart() {
        if (this.editingIndex === null) return;

        const qtd = parseInt(this.quantityInput.value, 10);
        const descricao = this.descriptionInput.value.trim().toUpperCase();

        if (descricao && qtd > 0) {
            this.parts[this.editingIndex] = { qtd, descricao };
            this._renderParts();
            this._cancelEdit();
        }
    }
    
    _cancelEdit() {
        this.editingIndex = null;
        this.quantityInput.value = 1;
        this.descriptionInput.value = '';
        this.addModeBtns.classList.remove('hidden');
        this.editModeBtns.classList.add('hidden');
    }

    _removePart(index) {
        this.parts.splice(index, 1);
        if (this.editingIndex === index) {
            this._cancelEdit();
        }
        this._renderParts();
    }
    
    getParts() {
        return this.parts;
    }
}

