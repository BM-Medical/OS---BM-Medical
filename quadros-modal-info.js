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
        const isSigned = order.signature_data && order.signature_data.length > 200;
        let signatureSectionHtml = isSigned
            ? `<img src="${order.signature_data}" class="signature-thumbnail" alt="Assinatura">`
            : (order.assinaturaDesconsiderada 
                ? `<div class="signature-placeholder bg-gray-100 text-gray-500 italic">Assinatura Dispensada</div>`
                : `<div class="signature-placeholder">Sem Assinatura</div>`);
        
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
        
        let attendanceHtml = '';
        if (order.contrato === 'Contrato N° 03/2024') {
            attendanceHtml = `<p><strong>Data do Serviço:</strong> ${formattedRetirada}</p><p><strong>Hora de Chegada:</strong> ${order.hora_chegada || 'N/A'}</p><p><strong>Hora de Saída:</strong> ${order.hora_saida || 'N/A'}</p><p><strong>Local:</strong> CME / HE-UFPEL</p>`;
        } else {
             attendanceHtml = `<p><strong>Data da Retirada / Serviço:</strong> ${formattedRetirada}</p><p><strong>Data da Devolução:</strong> ${formattedDevolucao}</p><p><strong>Local:</strong> ${order.local_atendimento || 'N/A'}</p>`;
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
                equipmentDataHtml += `<div class="bg-gray-50 p-3 rounded border border-gray-200">`;
                equipmentDataHtml += `<h3 class="font-bold text-blue-800 border-b border-gray-300 mb-2 pb-1">${tipo}</h3>`;
                equipmentDataHtml += `<ul class="list-disc ml-5 space-y-1 text-sm text-gray-700">`;
                listaItens.forEach(item => {
                    const marca = item.marca || '-';
                    const modelo = item.modelo || '-';
                    const sn = item.serial || item.numeroSerie || 'S/N';
                    const pat = (item.codigoPatrimonio || item.patrimonio) ? ` (Pat: ${item.codigoPatrimonio || item.patrimonio})` : '';
                    equipmentDataHtml += `<li><strong>${marca}</strong> - ${modelo} - <strong>SN:</strong> ${sn}${pat}</li>`;
                });
                equipmentDataHtml += `</ul>`;
                equipmentDataHtml += `</div>`;
            }
            equipmentDataHtml += '</div>';

        } else {
            equipmentDataHtml = `
                <p><strong>Equipamento:</strong> ${order.equipamento||'N/A'}</p>
                <p><strong>Marca:</strong> ${order.marca||'N/A'}</p>
                <p><strong>Modelo:</strong> ${order.modelo||'N/A'}</p>
                <p><strong>Serial:</strong> ${order.serial||'N/A'}</p>
            `;
        }

        return `
            <div class="modal-header-container"><div class="modal-header-top"><h1>Detalhes da OS ${order.os_numero}</h1></div>${maintenanceTypeHtml}</div>
            <div class="form-section"><h2>Dados do Cliente</h2><p><strong>Contrato:</strong> ${order.contrato||'N/A'}</p><p><strong>Cliente:</strong> ${order.cliente||'N/A'}</p><p><strong>Endereço:</strong> ${order.endereco||'N/A'}</p></div>
            <div class="form-section"><h2>Dados do Equipamento</h2>${equipmentDataHtml}</div>
            <div class="form-section"><h2>Atendimento</h2>${attendanceHtml}</div>
            <div class="form-section"><h2>Serviços e Peças</h2>${servicosDisplayHtml}<p class="mt-4"><strong>Peças Utilizadas:</strong></p>${pecasHtml}</div>
            <div class="form-section"><h2>Assinaturas</h2><div class="signature-grid"><div class="signature-box"><div id="signature-container-details">${signatureSectionHtml}</div><div class="signature-line">Responsável</div></div><div class="signature-box"><img src="./images/assinatura-tecnico.png" style="max-width:200px;"><div class="signature-line">Responsável Técnico</div></div></div></div>
            <div class="modal-footer">
                <button id="modal-btn-edit" class="btn-action btn-edit">Editar OS</button>
                <button id="modal-btn-finalize" class="btn-action btn-finalize">Finalizar OS</button>
                <div class="middle-buttons">
                    <button id="modal-btn-history" class="btn-action btn-history">Histórico</button>
                    <button id="modal-btn-pdf" class="btn-action btn-pdf">Gerar PDF</button>
                    <button id="modal-btn-archive" class="btn-action btn-archive">Arquivar OS</button>
                </div>
            </div>`;
    }

    // --- Helpers Utilitários ---
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