/**
 * pdf-generator.js
 * Módulo centralizado para a criação de PDFs de Ordens de Serviço.
 * * Funções exportadas:
 * - generateOsPdf(order, buttonElement): Gera e salva um PDF para uma única OS.
 * - addOrderPageToPdf(docPDF, order, assets): Adiciona a página de uma OS a um documento PDF existente.
 */

/**
 * Converte uma URL de imagem para um formato de dados (Data URL) em JPEG.
 * @param {string} url - A URL da imagem a ser convertida.
 * @param {number} quality - A qualidade do JPEG (0 a 1).
 * @returns {Promise<string>} Uma promessa que resolve com a Data URL da imagem.
 */
function imageToDataUrl(url, quality = 0.7) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'Anonymous';
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            canvas.width = img.width;
            canvas.height = img.height;
            // Define um fundo branco para evitar transparências no JPEG
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0);
            resolve(canvas.toDataURL('image/jpeg', quality));
        };
        img.onerror = (err) => reject(new Error(`Falha ao carregar a imagem: ${url}. Erro: ${err}`));
        img.src = url;
    });
}

/**
 * Formata uma string de data 'AAAA-MM-DD' para 'DD/MM/AAAA'.
 * @param {string} dateString - A data no formato 'AAAA-MM-DD'.
 * @returns {string} A data formatada ou 'N/A'.
 */
function formatDate(dateString) {
    if (!dateString) return 'N/A';
    const [year, month, day] = dateString.split('-');
    return `${day}/${month}/${year}`;
}

/**
 * Função interna que desenha o conteúdo de uma OS em um documento jsPDF.
 * @param {jsPDF} docPDF - A instância do documento jsPDF.
 * @param {object} order - O objeto com os dados da OS.
 * @param {object} assets - Objeto contendo as Data URLs das imagens (logo, assinatura técnica).
 */
async function drawOrderContent(docPDF, order, assets) {
    const { logoDataUrl, techSigDataUrl } = assets;
    const pageHeight = docPDF.internal.pageSize.height;
    const pageWidth = docPDF.internal.pageSize.width;
    const margin = 15;
    let yPosition = 10;

    // --- Cabeçalho ---
    docPDF.addImage(logoDataUrl, 'JPEG', margin, yPosition, 72, 32);
    docPDF.setFontSize(9).setFont(undefined, 'bold');
    docPDF.text('BM MEDICAL Engenharia Clínica', pageWidth - margin, yPosition + 5, { align: 'right' });
    docPDF.setFontSize(8).setFont(undefined, 'normal');
    docPDF.text('CNPJ: 48.673.158/0001-59', pageWidth - margin, yPosition + 9, { align: 'right' });
    docPDF.text('Av. Duque de Caxias, 915-B403, Pelotas-RS', pageWidth - margin, yPosition + 13, { align: 'right' });
    docPDF.text('Fone: (51) 99377-5933', pageWidth - margin, yPosition + 17, { align: 'right' });
    docPDF.text('central.bmmedical@outlook.com', pageWidth - margin, yPosition + 21, { align: 'right' });
    yPosition += 38;

    // --- Título da OS ---
    docPDF.setFontSize(20).setFont(undefined, 'bold');
    docPDF.text(`OS ${order.os_numero}`, pageWidth / 2, yPosition, { align: 'center' });
    yPosition += 8;

    if (order.tipo_manutencao) {
        docPDF.setFontSize(12).setFont(undefined, 'normal');
        const typeText = order.tipo_manutencao === 'preventiva' ? 'MP - Manutenção Preventiva' : 'MC - Manutenção Corretiva';
        docPDF.text(typeText, pageWidth / 2, yPosition, { align: 'center' });
    }
    yPosition += 12;

    // --- Função auxiliar para desenhar seções ---
   // VERSÃO NOVA E FLEXÍVEL
const drawSection = (title, contentCallback, options = {}) => {
    const paddingTop = options.paddingTop || 10; // Pega o padding customizado ou usa 10 como padrão
    
    // O 'dryRun' precisa usar o mesmo padding para o cálculo de altura ser correto
    const dryRunFinalY = contentCallback(0, true);
    const contentHeight = dryRunFinalY;
    // Note que a altura da caixa agora depende do padding customizado
    const boxHeight = contentHeight + paddingTop + 8; 

    if (yPosition + boxHeight > pageHeight - 50) { 
        docPDF.addPage();
        yPosition = 20;
    }
    
    docPDF.setDrawColor('#e0e0e0').setFillColor('#ffffff');
    docPDF.roundedRect(margin, yPosition - 5, pageWidth - (margin * 2), boxHeight, 3, 3, 'FD');
    
    docPDF.setFontSize(14).setTextColor('#3498db').setFont(undefined, 'bold');
    docPDF.text(title, margin + 4, yPosition);
    docPDF.setDrawColor('#3498db').setLineWidth(0.5).line(margin + 4, yPosition + 2, pageWidth - margin - 4, yPosition + 2);

    docPDF.setFontSize(12).setTextColor('#000000').setFont(undefined, 'normal');
    contentCallback(yPosition + paddingTop, false); // <--- USA A VARIÁVEL 'paddingTop'

    yPosition += boxHeight + 3;
};
    
    // --- Desenho das seções ---
    drawSection('Dados do Cliente', (currentY, isDryRun) => {
        let y = currentY;
        if (!isDryRun) {
            docPDF.setFont(undefined, 'bold').text('Contrato:', margin + 4, y);
            docPDF.setFont(undefined, 'normal').text(order.contrato || 'N/A', margin + 27, y);
            y += 6;
            docPDF.setFont(undefined, 'bold').text('Cliente:', margin + 4, y);
            docPDF.setFont(undefined, 'normal').text(order.cliente || 'N/A', margin + 27, y);
            y += 6;
            docPDF.setFont(undefined, 'bold').text('Endereço:', margin + 4, y);
            docPDF.setFont(undefined, 'normal').text(order.endereco || 'N/A', margin + 27, y);
        }
        return (y - currentY) + 14; // Retorna a altura calculada
    });
    
    drawSection('Dados do Equipamento', (currentY, isDryRun) => {
        let y = currentY;
        const equipLines = docPDF.splitTextToSize(order.equipamento || 'N/A', pageWidth - margin * 2 - 40);
        if (!isDryRun) {
            docPDF.setFont(undefined, 'bold').text('Equipamento:', margin + 4, y);
            docPDF.setFont(undefined, 'normal').text(equipLines, margin + 34, y);
            docPDF.setFont(undefined, 'bold').text('Marca:', margin + 117, y);
            docPDF.setFont(undefined, 'normal').text(order.marca || 'N/A', margin + 132, y);
        }
        y += 6 * equipLines.length;
        if(!isDryRun) {
            docPDF.setFont(undefined, 'bold').text('Modelo:', margin + 4, y);
            docPDF.setFont(undefined, 'normal').text(order.modelo || 'N/A', margin + 22, y);
            docPDF.setFont(undefined, 'bold').text('Serial:', margin + 117, y);
            docPDF.setFont(undefined, 'normal').text(order.serial || 'N/A', margin + 131, y);
        }
        return (y - currentY) + 2;
    });

    drawSection('Atendimento', (currentY, isDryRun) => {
        const ufpelContractId = 'Contrato N° 03/2024';
        let y = currentY;
        if (order.contrato === ufpelContractId) {
            if (!isDryRun) {
                docPDF.setFont(undefined, 'bold').text('Data do Serviço:', margin + 4, y);
                docPDF.setFont(undefined, 'normal').text(formatDate(order.data_servico), margin + 39, y);
                y += 6;
                docPDF.setFont(undefined, 'bold').text('Hora de Chegada:', margin + 4, y);
                docPDF.setFont(undefined, 'normal').text(order.hora_chegada || 'N/A', margin + 42, y);
                docPDF.setFont(undefined, 'bold').text('Hora de Saída:', margin + 80, y);
                docPDF.setFont(undefined, 'normal').text(order.hora_saida || 'N/A', margin + 111, y);
                y += 6;
                docPDF.setFont(undefined, 'bold').text('Local:', margin + 4, y);
                docPDF.setFont(undefined, 'normal').text('CME / HE-UFPEL', margin + 18, y);
            }
            return (y - currentY) + 6;
        } else {
            if (!isDryRun) {
                docPDF.setFont(undefined, 'bold').text('Data da Retirada:', margin + 4, y);
                docPDF.setFont(undefined, 'normal').text(formatDate(order.data_retirada), margin + 40, y);
                docPDF.setFont(undefined, 'bold').text('Data da Devolução:', margin + 80, y);
                docPDF.setFont(undefined, 'normal').text(formatDate(order.data_devolucao), margin + 120, y);
                y += 6;
                docPDF.setFont(undefined, 'bold').text('Local:', margin + 4, y);
                docPDF.setFont(undefined, 'normal').text(order.local_atendimento || 'N/A', margin + 18, y);
            }
            return (y - currentY) + 8;
        }
    });

    drawSection('Descrição dos Serviços Realizados', (currentY, isDryRun) => {
        const text = order.servicos_realizados || 'Não informado.';
        const lines = docPDF.splitTextToSize(text, pageWidth - (margin * 2) - 8);
        if (!isDryRun) docPDF.text(lines, margin + 4, currentY);
        return (lines.length * 4);
    });

    drawSection('Peças Utilizadas', (currentY, isDryRun) => {
        const pecas = order.pecas_utilizadas;

        if (!Array.isArray(pecas) || pecas.length === 0) {
            if (!isDryRun) {
                docPDF.text('Nenhuma peça utilizada.', margin + 4, currentY+5);
            }
            return 10;
        }

        const tableX = margin + 4;
        const tableWidth = pageWidth - (margin * 2) - 8;
        const colWidths = {
            item: 15,
            qtd: 15,
            desc: tableWidth - 30,
        };
        const rowPadding = 2;
        let tableCurrentY = currentY;
        const lineHeight = 4;

        // --- Desenhar Cabeçalho da Tabela (Estilo Minimalista) ---
	// --- VERSÃO NOVA E CENTRALIZADA ---
	const drawHeader = () => {
    		docPDF.setFontSize(10).setFont(undefined, 'bold');

    	// Posição X centralizada para os cabeçalhos 'Item' e 'Qtd.'
    		const itemHeaderX = tableX + (colWidths.item / 2);
   		const qtdHeaderX = tableX + colWidths.item + (colWidths.qtd / 2);
    		const textY = tableCurrentY + rowPadding + (lineHeight / 2); // Posição Y verticalmente centralizada

    	// Desenha os textos do cabeçalho usando a opção 'align: center'
    		docPDF.text('Item', itemHeaderX, textY, { align: 'center', baseline: 'middle' });
    		docPDF.text('Qtd.', qtdHeaderX, textY, { align: 'center', baseline: 'middle' });
    		docPDF.text('Descrição', tableX + colWidths.item + colWidths.qtd + rowPadding, textY, { baseline: 'middle' });
    
    		tableCurrentY += lineHeight + (rowPadding * 2); // A altura total do cabeçalho
    		docPDF.setLineWidth(0.5);
    		docPDF.setDrawColor(0, 0, 0); // Linha preta
    	// A linha é desenhada abaixo do espaço total do cabeçalho
    		docPDF.line(tableX, tableCurrentY, tableX + tableWidth, tableCurrentY); 
    		tableCurrentY += rowPadding; // Espaçamento extra após a linha do cabeçalho foi removido para ficar mais limpo
	};
        
        if (!isDryRun) {
            drawHeader();
        } else {
             tableCurrentY += lineHeight + (rowPadding * 2);
        }

        // --- Desenhar Linhas da Tabela ---
        docPDF.setFontSize(10).setFont(undefined, 'normal');
        pecas.forEach((part, index) => {
            const descLines = docPDF.splitTextToSize(part.descricao, colWidths.desc - (rowPadding * 2));
            const rowHeight = (descLines.length * lineHeight) + (rowPadding * 2);

	// --- VERSÃO NOVA COM ALINHAMENTO VERTICAL ---
	    if (!isDryRun) {
    		// Calcula o centro vertical da linha
   		const verticalCenter = tableCurrentY + (rowHeight / 2);

    	// Adiciona a opção 'baseline: middle' para centralizar verticalmente
   		const itemX = tableX + (colWidths.item / 2);
    		const qtdX = tableX + colWidths.item + (colWidths.qtd / 2);
    		const descX = tableX + colWidths.item + colWidths.qtd + rowPadding;

    	// Coluna "Item": Centralizado horizontalmente e verticalmente
    		docPDF.text(`${index + 1}`, itemX, verticalCenter, { align: 'center', baseline: 'middle' });

    	// Coluna "Qtd.": Centralizado horizontalmente e verticalmente
    		docPDF.text(`${part.qtd}`, qtdX, verticalCenter, { align: 'center', baseline: 'middle' });

    	// Coluna "Descrição": Alinhado à esquerda e centralizado verticalmente
    		docPDF.text(descLines, descX, verticalCenter, { baseline: 'middle' });

    	// Linha inferior
    		docPDF.setLineWidth(0.2);
    		docPDF.setDrawColor(200, 200, 200);
    		docPDF.line(tableX, tableCurrentY + rowHeight, tableX + tableWidth, tableCurrentY + rowHeight);
	    }
            tableCurrentY += rowHeight;
        });

        // Retorna a altura total da tabela
        return tableCurrentY - currentY;
    },{ paddingTop: 5 });


    // --- Assinaturas (sempre no final da página) ---
    const signatureY = pageHeight - 40;
    const signatureHeight = 25;
    const signatureWidth = 60;
    const roleY = signatureY + signatureHeight + 2;
    const lineY = roleY - 3;
    
    if (order.signature_data && order.signature_data.length > 200) {
        docPDF.addImage(order.signature_data, 'JPEG', margin + 15, signatureY, signatureWidth, signatureHeight);
    }
    docPDF.setDrawColor('#333333').setLineWidth(0.3);
    docPDF.line(margin + 10, lineY, margin + 10 + signatureWidth + 10, lineY);
    docPDF.setFontSize(9).setFont(undefined, 'bold');
    docPDF.text('Responsável do Setor', margin + 45, roleY, { align: 'center' });

    const techSignatureX = pageWidth - margin - 15 - signatureWidth;
    docPDF.addImage(techSigDataUrl, 'JPEG', techSignatureX, signatureY, signatureWidth, signatureHeight);
    docPDF.line(techSignatureX - 5, lineY, techSignatureX + signatureWidth + 5, lineY);
    docPDF.text('Responsável Técnico da Empresa', techSignatureX + (signatureWidth/2), roleY, { align: 'center' });
}

/**
 * Função principal para gerar um PDF de uma única OS e salvá-lo.
 * @param {object} order - O objeto com os dados da OS.
 * @param {HTMLElement} buttonElement - O elemento do botão que acionou a função.
 */
export async function generateOsPdf(order, buttonElement) {
    if (buttonElement) {
        buttonElement.disabled = true;
        buttonElement.textContent = 'Gerando...';
    }
    try {
        if (!order) throw new Error('Dados da OS não fornecidos.');
        
        const { jsPDF } = window.jspdf;
        const docPDF = new jsPDF();

        const assets = {
            logoDataUrl: await imageToDataUrl('./images/logo.png', 0.9),
            techSigDataUrl: await imageToDataUrl('./images/assinatura-tecnico.png', 0.7)
        };
        
        await drawOrderContent(docPDF, order, assets);

        docPDF.save(`OS-${order.os_numero.split(' ')[0]}.pdf`);
    } catch (error) {
        console.error("Erro ao gerar PDF:", error);
        alert("Ocorreu um erro ao gerar o PDF.");
    } finally {
        if (buttonElement) {
            buttonElement.disabled = false;
            buttonElement.textContent = 'Gerar PDF';
        }
    }
}

/**
 * Função para adicionar uma página de OS a um documento PDF existente (para relatórios compilados).
 * @param {jsPDF} docPDF - A instância do documento jsPDF já criada.
 * @param {object} order - O objeto com os dados da OS.
 * @param {object} assets - Objeto contendo as Data URLs das imagens.
 */
export async function addOrderPageToPdf(docPDF, order, assets) {
    if (!docPDF || !order || !assets) {
        throw new Error("Argumentos inválidos para addOrderPageToPdf.");
    }
    await drawOrderContent(docPDF, order, assets);
}

