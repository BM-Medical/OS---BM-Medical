/**
 * modulo-pecas.js
 * Módulo para gerenciar a interface de adição e remoção de peças utilizadas em uma OS.
 * Exporta a classe PartsManager.
 */

export class PartsManager {
    /**
     * @param {HTMLElement} containerElement - O elemento do DOM onde o gerenciador de peças será inserido.
     * @param {Array<object>} initialParts - A lista inicial de peças para renderizar.
     */
    constructor(containerElement, initialParts = []) {
        if (!containerElement) {
            throw new Error("O container para o gerenciador de peças não foi fornecido.");
        }
        this.container = containerElement;
        this.parts = [...initialParts]; // Cria uma cópia para evitar mutação direta
        this.render();
    }

    /**
     * Renderiza a estrutura completa do gerenciador de peças no container.
     */
    render() {
        this.container.innerHTML = `
            <div class="space-y-4">
                <!-- Tabela para exibir as peças adicionadas -->
                <table class="min-w-full bg-white border border-gray-200">
                    <thead>
                        <tr>
                            <th class="px-4 py-2 border-b text-left text-sm font-semibold text-gray-600 w-16">Item</th>
                            <th class="px-4 py-2 border-b text-left text-sm font-semibold text-gray-600 w-24">Qtd.</th>
                            <th class="px-4 py-2 border-b text-left text-sm font-semibold text-gray-600">Descrição</th>
                            <th class="px-4 py-2 border-b w-20"></th>
                        </tr>
                    </thead>
                    <tbody id="parts-table-body">
                        <!-- As linhas de peças serão inseridas aqui -->
                    </tbody>
                </table>
                <div id="no-parts-message" class="text-center text-gray-500 py-4" style="display: none;">Nenhuma peça adicionada.</div>

                <!-- Formulário para adicionar nova peça -->
                <div class="flex items-end space-x-2 border-t pt-4">
                    <div class="flex-shrink-0 w-24">
                        <label for="part-quantity" class="block text-sm font-medium text-gray-700">Quantidade</label>
                        <input type="number" id="part-quantity" min="1" value="1" class="mt-1 block w-full p-2 border border-gray-300 rounded-md shadow-sm">
                    </div>
                    <div class="flex-grow">
                        <label for="part-description" class="block text-sm font-medium text-gray-700">Descrição da Peça</label>
                        <input type="text" id="part-description" class="uppercase-input mt-1 block w-full p-2 border border-gray-300 rounded-md shadow-sm">
                    </div>
                    <button type="button" id="add-part-btn" class="px-4 py-2 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 whitespace-nowrap">+ Adicionar</button>
                </div>
            </div>
        `;

        this.tableBody = this.container.querySelector('#parts-table-body');
        this.noPartsMessage = this.container.querySelector('#no-parts-message');
        this.addPartBtn = this.container.querySelector('#add-part-btn');
        this.quantityInput = this.container.querySelector('#part-quantity');
        this.descriptionInput = this.container.querySelector('#part-description');

        this.addPartBtn.addEventListener('click', () => this.addPart());
        this.descriptionInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                this.addPart();
            }
        });

        this.renderParts();
    }

    /**
     * Renderiza as linhas da tabela com base na lista de peças atual.
     */
    renderParts() {
        this.tableBody.innerHTML = '';
        if (this.parts.length === 0) {
            this.noPartsMessage.style.display = 'block';
        } else {
            this.noPartsMessage.style.display = 'none';
        }

        this.parts.forEach((part, index) => {
            const row = this.tableBody.insertRow();
            row.innerHTML = `
                <td class="px-4 py-2 border-b text-center">${index + 1}</td>
                <td class="px-4 py-2 border-b text-center">${part.qtd}</td>
                <td class="px-4 py-2 border-b">${part.descricao}</td>
                <td class="px-4 py-2 border-b text-center">
                    <button type="button" class="text-red-500 hover:text-red-700" data-index="${index}">Remover</button>
                </td>
            `;
            row.querySelector('button').addEventListener('click', (e) => {
                const indexToRemove = parseInt(e.target.dataset.index, 10);
                this.removePart(indexToRemove);
            });
        });
    }

    /**
     * Adiciona uma nova peça à lista e atualiza a tabela.
     */
    addPart() {
        const qtd = parseInt(this.quantityInput.value, 10);
        const descricao = this.descriptionInput.value.trim().toUpperCase();

        if (descricao && qtd > 0) {
            this.parts.push({ qtd, descricao });
            this.renderParts();

            // Limpa os campos para a próxima inserção
            this.quantityInput.value = 1;
            this.descriptionInput.value = '';
            this.descriptionInput.focus();
        }
    }

    /**
     * Remove uma peça da lista pelo seu índice e atualiza a tabela.
     * @param {number} index - O índice da peça a ser removida.
     */
    removePart(index) {
        this.parts.splice(index, 1);
        this.renderParts();
    }

    /**
     * Retorna a lista atual de peças.
     * @returns {Array<object>} A lista de peças no formato [{qtd, descricao}, ...].
     */
    getParts() {
        // Reatribui o número do item para garantir a sequência correta
        return this.parts.map((part, index) => ({
            item: index + 1,
            qtd: part.qtd,
            descricao: part.descricao
        }));
    }
}
