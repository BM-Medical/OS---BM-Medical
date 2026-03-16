/**
 * quadros-modal-info.js
 * Responsável apenas pela geração do HTML de visualização (Leitura) da OS.
 */

export class InfoModalManager {
    constructor() {
        // Nada a inicializar por enquanto
    }

    /**
     * Gera o HTML completo para o corpo do modal de detalhes.
     * @param {Object} order - O objeto da Ordem de Serviço.
     * @returns {string} HTML string.
     */
    generateView(order) {
        const isSigned = (order.signature_data && order.signature_data.length > 200) || order.assinaturaDesconsiderada;
        
        let signatureSectionHtml = isSigned
            ? (order.signature_data && order.signature_data.length > 200 
                ? `<img src="${order.signature_data}" class="signature-thumbnail" style="max-height: 100px; object-fit: contain;" alt="Assinatura">`
                : `<div class="signature-placeholder bg-gray-100 text-gray-500 italic p-4 border dashed rounded text-sm w-full">Assinatura Dispensada</div>`)
            : `<div class="signature-placeholder p-4 border dashed rounded text-sm text-gray-400 w-full" style="display: flex; align-items: center; justify-content: center; min-height: 80px;">Sem Assinatura</div>`;
        
        let servicosDisplayHtml = (order.servicos_realizados === "Recebimento de equipamento para análise.")
            ? `<p><strong>Serviços Realizados:</strong></p><p style="font-style: italic; color: #7f8c8d;">Equipamento recebido para análise.</p>`
            : `<p><strong>Serviços Realizados:</strong><br>${this.escapeHTML(order.servicos_realizados || 'Não informado.').replace(/\n/g, '<br>')}</p>`;

        let pecasHtml = '<p>Nenhuma peça utilizada.</p>';
        if (order.pecas_utilizadas && Array.isArray(order.pecas_utilizadas) && order.pecas_utilizadas.length > 0) {
            pecasHtml = '<ul class="list-disc pl-5 space-y-1">' + order.pecas_utilizadas.map(part => `<li><strong>${part.qtd}x</strong> - ${this.escapeHTML(part.descricao)}</li>`).join('') + '</ul>';
        }

        const formattedRetirada = this.formatDate(order.data_servico || order.data_retirada);
        const formattedDevolucao = this.formatDate(order.data_devolucao);
        
        let maintenanceTypeHtml = '';
        if (order.tipo_manutencao === 'preventiva') maintenanceTypeHtml = `<p class="maintenance-type-modal type-mp">MP - Manutenção Preventiva</p>`;
        else if (order.tipo_manutencao === 'corretiva') maintenanceTypeHtml = `<p class="maintenance-type-modal type-mc">MC - Manutenção Corretiva</p>`;
        
        // --- CORREÇÃO 1: Datas Dinâmicas ---
        let attendanceHtml = '';
        if (order.contrato && order.contrato.includes('03/2024')) {
            attendanceHtml = `<p><strong>Data do Serviço:</strong> ${formattedRetirada}</p><p><strong>Hora de Chegada:</strong> ${order.hora_chegada || 'N/A'}</p><p><strong>Hora de Saída:</strong> ${order.hora_saida || 'N/A'}</p><p><strong>Local:</strong> CME / HE-UFPEL</p>`;
        } else {
            if (order.atendimento_no_local) {
                attendanceHtml = `<p><strong>Data do Serviço:</strong> ${formattedRetirada}</p><p><strong>Local:</strong> ${order.local_atendimento || 'N/A'}</p>`;
            } else {
                attendanceHtml = `<p><strong>Data da Retirada:</strong> ${formattedRetirada}</p><p><strong>Data da Devolução:</strong> ${formattedDevolucao}</p><p><strong>Local:</strong> ${order.local_atendimento || 'N/A'}</p>`;
            }
        }

        let equipmentDataHtml = '';
        if (order.itens && Array.isArray(order.itens) && order.itens.length > 0) {
            const gruposPorTipo = {};
            order.itens.forEach(item => {
                const tipo = item.nome || 'Equipamento'; 
                if (!gruposPorTipo[tipo]) gruposPorTipo[tipo] = [];
                gruposPorTipo[tipo].push(item);
            });
            equipmentDataHtml = '<div class="space-y-4">'; 
            for (const [tipo, listaItens] of Object.entries(gruposPorTipo)) {
                equipmentDataHtml += `<div class="bg-gray-50 p-3 rounded border border-gray-200"><h3 class="font-bold text-blue-800 border-b border-gray-300 mb-2 pb-1">${tipo}</h3><ul class="list-disc ml-5 space-y-1 text-sm text-gray-700">`;
                listaItens.forEach(item => {
                    const marca = item.marca || '-';
                    const modelo = item.modelo || '-';
                    const sn = item.serial || item.numeroSerie || 'S/N';
                    const pat = (item.codigoPatrimonio || item.patrimonio) ? ` (Pat: ${item.codigoPatrimonio || item.patrimonio})` : '';
                    equipmentDataHtml += `<li><strong>${marca}</strong> - ${modelo} - <strong>SN:</strong> ${sn}${pat}</li>`;
                });
                equipmentDataHtml += `</ul></div>`;
            }
            equipmentDataHtml += '</div>';
        } else {
            equipmentDataHtml = `<p><strong>Equipamento:</strong> ${order.equipamento||'N/A'}</p><p><strong>Marca:</strong> ${order.marca||'N/A'}</p><p><strong>Modelo:</strong> ${order.modelo||'N/A'}</p><p><strong>Serial:</strong> ${order.serial||'N/A'}</p>`;
        }

        // --- CORREÇÃO 3: Botão WhatsApp realocado para baixo da assinatura ---
        const whatsappBtnHtml = (!isSigned && !order.assinaturaDesconsiderada) 
            ? `<button id="modal-btn-whatsapp" type="button" class="btn-whatsapp" style="margin-top: 10px; width: 100%; border: none; padding: 8px 10px; border-radius: 6px; cursor: pointer; font-weight: 600; display: flex; align-items: center; justify-content: center; gap: 8px; font-size: 0.85rem;"><svg style="width: 16px; height: 16px;" fill="currentColor" viewBox="0 0 24 24"><path d="M12.031 6.172c-3.181 0-5.767 2.586-5.768 5.766-.001 1.298.38 2.27 1.019 3.287l-.582 2.128 2.182-.573c.978.58 1.911.928 3.145.929 3.178 0 5.767-2.587 5.768-5.766.001-3.187-2.575-5.77-5.764-5.771zm3.392 8.244c-.144.405-.837.774-1.17.824-.299.045-.677.063-1.092-.069-.252-.08-.575-.187-.988-.365-1.739-.751-2.874-2.502-2.961-2.617-.087-.116-.708-.94-.708-1.793s.448-1.273.607-1.446c.159-.173.346-.217.462-.217l.332.006c.106.005.249-.04.39.298.144.347.491 1.2.534 1.287.043.087.072.188.014.304-.058.118-.087.325-.087.325-.26.85-.921.821-.921.821zM12 2C6.477 2 2 6.477 2 12c0 1.84.498 3.564 1.365 5.034L2 22l5.127-1.309C8.544 21.506 10.213 22 12 22c5.523 0 10-4.477 10-10S17.523 2 12 2zm0 18.5c-1.554 0-3.016-.408-4.288-1.117l-.307-.17-3.187.813.826-3.125-.187-.311A8.448 8.448 0 0 1 3.5 12c0-4.687 3.813-8.5 8.5-8.5 4.688 0 8.5 3.813 8.5 8.5s-3.812 8.5-8.5 8.5z"/></svg> Enviar por WhatsApp</button>` 
            : '';

        return `
            <div class="modal-header-container"><div class="modal-header-top"><h1>Detalhes da OS ${order.os_numero}</h1></div>${maintenanceTypeHtml}</div>
            <div class="form-section"><h2>Dados do Cliente</h2><p><strong>Contrato:</strong> ${order.contrato||'N/A'}</p><p><strong>Cliente:</strong> ${order.cliente||'N/A'}</p><p><strong>Endereço:</strong> ${order.endereco||'N/A'}</p></div>
            <div class="form-section"><h2>Dados do Equipamento</h2>${equipmentDataHtml}</div>
            <div class="form-section"><h2>Atendimento</h2>${attendanceHtml}</div>
            <div class="form-section"><h2>Serviços e Peças</h2>${servicosDisplayHtml}<p class="mt-4"><strong>Peças Utilizadas:</strong></p>${pecasHtml}</div>
            <div class="form-section">
                <h2>Assinaturas</h2>
                <div class="signature-grid">
                    <div class="signature-box" style="display: flex; flex-direction: column; justify-content: space-between;">
                        <div style="flex-grow: 1; display: flex; flex-direction: column; justify-content: center; align-items: center; width: 100%;">
                            <div id="signature-container-details" style="width: 100%; display: flex; justify-content: center;">${signatureSectionHtml}</div>
                            ${whatsappBtnHtml}
                        </div>
                        <div class="signature-line" style="margin-top: 15px;">Responsável</div>
                    </div>
                    <div class="signature-box" style="display: flex; flex-direction: column; justify-content: space-between;">
                        <div style="flex-grow: 1; display: flex; align-items: center; justify-content: center;">
                            <img src="./images/assinatura-tecnico.png" style="max-width:200px;">
                        </div>
                        <div class="signature-line" style="margin-top: 15px;">Responsável Técnico</div>
                    </div>
                </div>
            </div>
            <div class="modal-footer">
                <button id="modal-btn-edit" class="btn-action btn-edit">Editar OS</button>
                <button id="modal-btn-finalize" class="btn-action btn-finalize">Finalizar OS</button>
                <div class="middle-buttons">
                    <button id="modal-btn-history" class="btn-action btn-history">Histórico</button>
                    <button id="modal-btn-pdf" class="btn-action btn-pdf">PDF</button>
                    <button id="modal-btn-archive" class="btn-action btn-archive">Arquivar</button>
                </div>
            </div>`;
    }

    formatDate(dateString) {
        if (!dateString) return 'N/A';
        const [year, month, day] = dateString.split('-');
        return `${day}/${month}/${year}`;
    }

    escapeHTML(unsafeText) {
        if (typeof unsafeText !== 'string') return '';
        return unsafeText.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
    }
}