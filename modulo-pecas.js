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

        this._createModal();
        this._attachEventListeners();
    }

    _createModal() {
        // Garante que o modal seja criado apenas uma vez
        if (document.getElementById('parts-manager-modal')) return;

        this.modalElement = document.createElement('div');
        this.modalElement.id = 'parts-manager-modal';
        // CORREÇÃO: Aumentado o z-index para que o modal de peças apareça sobre o modal de detalhes.
        this.modalElement.className = 'fixed inset-0 bg-gray-600 bg-opacity-75 overflow-y-auto h-full w-full hidden z-[1050] flex items-center justify-center p-4';
        this.modalElement.innerHTML = `
            <div class="relative mx-auto p-5 border w-full max-w-lg shadow-lg rounded-md bg-white">
                <div class="mt-3">
                    <h3 class="text-lg leading-6 font-medium text-gray-900 mb-4 text-center">Gerenciar Peças Utilizadas</h3>
                    
                    <div class="flex flex-col sm:flex-row items-end space-y-2 sm:space-y-0 sm:space-x-2 mb-4 p-4 border rounded-md bg-gray-50">
                        <div class="w-full sm:w-1/4">
                            <label for="part-quantity" class="block text-sm font-medium text-gray-700 text-left">Qtd.</label>
                            <input type="number" id="part-quantity" min="1" value="1" class="mt-1 block w-full p-2 border border-gray-300 rounded-md shadow-sm">
                        </div>
                        <div class="w-full sm:flex-grow">
                            <label for="part-description" class="block text-sm font-medium text-gray-700 text-left">Descrição da Peça</label>
                            <input type="text" id="part-description" class="uppercase-input mt-1 block w-full p-2 border border-gray-300 rounded-md shadow-sm">
                        </div>
                        <button type="button" id="add-part-btn" class="w-full sm:w-auto px-4 py-2 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 whitespace-nowrap">+ Adicionar</button>
                    </div>

                    <div class="max-h-60 overflow-y-auto border-t border-b">
                        <table class="min-w-full bg-white">
                            <thead class="sticky top-0 bg-gray-100 z-10">
                                <tr>
                                    <th class="px-4 py-2 text-left text-sm font-semibold text-gray-600 w-16">Item</th>
                                    <th class="px-4 py-2 text-center text-sm font-semibold text-gray-600 w-24">Qtd.</th>
                                    <th class="px-4 py-2 text-left text-sm font-semibold text-gray-600">Descrição</th>
                                    <th class="px-4 py-2 w-20"></th>
                                </tr>
                            </thead>
                            <tbody id="parts-table-body"></tbody>
                        </table>
                        <div id="no-parts-message" class="text-center text-gray-500 py-4">Nenhuma peça adicionada.</div>
                    </div>

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
        this.addPartBtn = this.modalElement.querySelector('#add-part-btn');
        this.quantityInput = this.modalElement.querySelector('#part-quantity');
        this.descriptionInput = this.modalElement.querySelector('#part-description');
        this.confirmButton = this.modalElement.querySelector('#confirm-parts-modal-btn');
        this.cancelButton = this.modalElement.querySelector('#cancel-parts-modal-btn');
    }

    _attachEventListeners() {
        this.addPartBtn.addEventListener('click', () => this._addPart());
        this.descriptionInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                this._addPart();
            }
        });

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
    }

    /**
     * Abre o modal, carregando a lista de peças atual.
     * @param {Array<object>} currentParts - A lista de peças para editar.
     */
    open(currentParts = []) {
        this.parts = JSON.parse(JSON.stringify(currentParts)); // Carrega uma cópia das peças atuais
        this._renderParts();
        this.modalElement.classList.remove('hidden');
        this.descriptionInput.focus();
    }

    /**
     * Fecha o modal.
     */
    close() {
        this.modalElement.classList.add('hidden');
    }

    _renderParts() {
        this.tableBody.innerHTML = '';
        const hasParts = this.parts.length > 0;

        // Alterna a visibilidade da mensagem e da tabela
        this.noPartsMessage.style.display = hasParts ? 'none' : 'block';
        this.tableBody.parentElement.style.display = hasParts ? 'table' : 'none';

        if (hasParts) {
            this.parts.forEach((part, index) => {
                const row = this.tableBody.insertRow();
                row.innerHTML = `
                    <td class="px-4 py-2 border-b text-center">${index + 1}</td>
                    <td class="px-4 py-2 border-b text-center">${part.qtd}</td>
                    <td class="px-4 py-2 border-b text-left">${part.descricao}</td>
                    <td class="px-4 py-2 border-b text-center">
                        <button type="button" class="text-red-500 hover:text-red-700 text-sm" data-index="${index}">Remover</button>
                    </td>
                `;
                row.querySelector('button').addEventListener('click', (e) => {
                    const indexToRemove = parseInt(e.target.dataset.index, 10);
                    this._removePart(indexToRemove);
                });
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

    _removePart(index) {
        this.parts.splice(index, 1);
        this._renderParts();
    }

    /**
     * Retorna a lista atual de peças.
     * @returns {Array<object>} A lista de peças no formato [{item, qtd, descricao}, ...].
     */
    getParts() {
        return this.parts.map((part, index) => ({
            item: index + 1,
            qtd: part.qtd,
            descricao: part.descricao
        }));
    }
}

