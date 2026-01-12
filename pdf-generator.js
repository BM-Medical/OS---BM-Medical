/**
 * pdf-generator.js
 * Módulo centralizado para a criação de PDFs de Ordens de Serviço.
 * ATUALIZADO: Ajustes de espaçamento (Gap 18, Y+7) e lógica de Local para Lote (Secretaria de Saúde).
 *
 * Funções exportadas:
 * - generateOsPdf(order, buttonElement): Gera e salva um PDF para uma única OS.
 * - addOrderPageToPdf(docPDF, order, assets): Adiciona a página de uma OS a um documento PDF existente.
 */

// Pega a instância global do jsPDF
const { jsPDF } = window.jspdf;

// NOVO: Constantes de Tema e Layout
const THEME = {
    FONT_BOLD: 'bold',
    FONT_NORMAL: 'normal'
};
const KV_SPACING = 2; // Espaço padrão entre a chave (key) e o valor (value)

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
 * Função auxiliar para capitalizar a primeira letra de uma string e deixar o resto minúsculo.
 * Ex: "VÁRIAS" -> "Várias", "premium" -> "Premium"
 */
function capitalizeFirstLetter(string) {
    if (!string) return '';
    return string.charAt(0).toUpperCase() + string.slice(1).toLowerCase();
}

/**
 * NOVO: Função auxiliar para desenhar Chave-Valor com espaçamento dinâmico.
 */
function drawKeyValue(doc, x, y, key, value) {
    // Garante que a chave termine com dois pontos (ou adiciona se faltar)
    const keyText = key.endsWith(':') ? key : `${key}:`;
    
    doc.setFont(undefined, THEME.FONT_BOLD).text(keyText, x, y);
    
    // Calcula a largura da chave e adiciona o espaçamento
    const keyWidth = doc.getTextWidth(keyText);
    const valueX = x + keyWidth + KV_SPACING;
    
    doc.setFont(undefined, THEME.FONT_NORMAL).text(value || 'N/A', valueX, y);
    
    // Retorna a posição X final para referência (útil em layouts de 2 colunas)
    return valueX + doc.getTextWidth(value || 'N/A');
}

/**
 * Função auxiliar para desenhar uma linha de item de lote com rótulos em negrito.
 * Formato: Marca: [Valor]       Modelo: [Valor]       Serial: [Valor]
 */
function drawBatchItemLine(doc, x, y, item, maxWidth) {
    const startX = x;
    let currentX = x;
    // ALTERADO: Aumentado para 18 conforme solicitado
    const FIELD_GAP = 18; // Espaçamento largo entre campos (sem hífen)
    
    // Helper local para desenhar partes
    const drawPart = (label, value, isLast = false) => {
        // Rótulo em Negrito
        doc.setFont(undefined, THEME.FONT_BOLD);
        doc.text(label, currentX, y);
        currentX += doc.getTextWidth(label) + 2;
        
        // Valor Normal
        doc.setFont(undefined, THEME.FONT_NORMAL);
        const valText = value || '-';
        doc.text(valText, currentX, y);
        currentX += doc.getTextWidth(valText);
        
        // Separador (se não for o último) - Agora apenas adiciona espaço
        if (!isLast) {
            currentX += FIELD_GAP;
        }
    };

    // Prepara os dados
    let marcaRaw = item.marca || '-';
    const marca = capitalizeFirstLetter(marcaRaw);
    const modelo = item.modelo || '-';
    const sn = item.serial || item.numeroSerie || 'S/N';
    const pat = (item.codigoPatrimonio || item.patrimonio) ? ` (Pat: ${item.codigoPatrimonio || item.patrimonio})` : '';

    // Verifica se cabe tudo em uma linha (estimativa simples)
    // Se for muito longo, teremos que quebrar, mas para simplificar vamos tentar desenhar linearmente
    // Para garantir alinhamento, vamos desenhar parte a parte
    
    drawPart('Marca:', marca);
    drawPart('Modelo:', modelo);
    drawPart('Serial:', sn + pat, true);
    
    return 5; // Retorna altura da linha (fixa para simplificar, assumindo que cabe)
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
    const margin = 7;
    let yPosition = 10;

    // --- FUNÇÃO REUTILIZÁVEL PARA DESENHAR O CABEÇALHO ---
    const drawHeader = () => {
        const headerY = 10;
        // ATUALIZADO: Altura definida como 0 para manter a proporção
        docPDF.addImage(logoDataUrl, 'JPEG', margin, headerY, 72, 0);
        docPDF.setFontSize(9).setFont(undefined, THEME.FONT_BOLD);
        docPDF.text('BM MEDICAL Engenharia Clínica', pageWidth - margin, headerY + 5, { align: 'right' });
        docPDF.setFontSize(8).setFont(undefined, THEME.FONT_NORMAL);
        docPDF.text('CNPJ: 48.673.158/0001-59', pageWidth - margin, headerY + 9, { align: 'right' });
        docPDF.text('Av. Duque de Caxias, 915-B403, Pelotas-RS', pageWidth - margin, headerY + 13, { align: 'right' });
        docPDF.text('Fone: (51) 99377-5933', pageWidth - margin, headerY + 17, { align: 'right' });
        docPDF.text('central.bmmedical@outlook.com', pageWidth - margin, headerY + 21, { align: 'right' });
    };
    
    // --- FUNÇÃO PARA VERIFICAR E ADICIONAR NOVA PÁGINA ---
    const checkAndAddPage = (requiredHeight) => {
        if (yPosition + requiredHeight > pageHeight - 35) { // Reserva espaço para assinaturas
            docPDF.addPage();
            drawHeader(); // Redesenha o cabeçalho na nova página
            yPosition = 50; // Reseta a posição Y para o conteúdo
        }
    };

    // --- Desenha o cabeçalho na primeira página ---
    drawHeader();
    yPosition += 38; // Ajustar esta altura se a proporção do logo mudar muito

    // --- Título da OS ---
    docPDF.setFontSize(20).setFont(undefined, THEME.FONT_BOLD);
    docPDF.text(`OS ${order.os_numero}`, pageWidth / 2, yPosition, { align: 'center' });
    yPosition += 8;

    if (order.tipo_manutencao) {
        docPDF.setFontSize(12).setFont(undefined, THEME.FONT_NORMAL);
        const typeText = order.tipo_manutencao === 'preventiva' ? 'MP - Manutenção Preventiva' : 'MC - Manutenção Corretiva';
        docPDF.text(typeText, pageWidth / 2, yPosition, { align: 'center' });
    }
    yPosition += 12;

    // --- Função auxiliar para desenhar seções ---
    const drawSection = (title, contentCallback, options = {}) => {
        const paddingTop = options.paddingTop || 10;
        
        // dryRun para calcular altura
        const dryRunFinalY = contentCallback(0, true, docPDF);
        const contentHeight = dryRunFinalY; // O callback retorna a altura total usada
        const boxHeight = contentHeight + paddingTop + 8; 

        checkAndAddPage(boxHeight);
        
        docPDF.setDrawColor('#e0e0e0').setFillColor('#ffffff');
        docPDF.roundedRect(margin, yPosition - 5, pageWidth - (margin * 2), boxHeight, 3, 3, 'FD');
        
        docPDF.setFontSize(14).setTextColor('#3498db').setFont(undefined, THEME.FONT_BOLD);
        docPDF.text(title, margin + 4, yPosition);
        docPDF.setDrawColor('#3498db').setLineWidth(0.5).line(margin + 4, yPosition + 2, pageWidth - margin - 4, yPosition + 2);

        docPDF.setFontSize(12).setTextColor('#000000').setFont(undefined, THEME.FONT_NORMAL);
        
        // Desenho real
        contentCallback(yPosition + paddingTop, false, docPDF);

        yPosition += boxHeight + 3;
    };
    
    // --- Desenho das seções ---
    
    drawSection('Dados do Cliente', (currentY, isDryRun, doc) => {
        let y = currentY;
        if (!isDryRun) {
            drawKeyValue(doc, margin + 4, y, 'Contrato', order.contrato);
            y += 6;
            drawKeyValue(doc, margin + 4, y, 'Cliente', order.cliente);
            y += 6;
            drawKeyValue(doc, margin + 4, y, 'Endereço', order.endereco);
        }
        return 14; 
    });
    
    // --- SEÇÃO DADOS DO EQUIPAMENTO (COM SUPORTE A LOTE) ---
    drawSection('Dados do Equipamento', (currentY, isDryRun, doc) => {
        let y = currentY;
        const col1X = margin + 4;
        
        // >>> Verifica se é Lote (tem itens) <<<
        if (order.itens && Array.isArray(order.itens) && order.itens.length > 0) {
            
            // 1. Agrupamento
            const gruposPorTipo = {};
            order.itens.forEach(item => {
                const tipo = item.nome || 'Equipamento';
                if (!gruposPorTipo[tipo]) gruposPorTipo[tipo] = [];
                gruposPorTipo[tipo].push(item);
            });

            const tipos = Object.keys(gruposPorTipo);
            
            // 2. Renderização
            tipos.forEach((tipo, index) => {
                if (index > 0) y += 5; // Espaço entre grupos

                // Título do Grupo (Ex: ESFIGMOMANÔMETRO ADULTO)
                if (!isDryRun) {
                    // ALTERADO: PONTO 1 - Negrito ativado para o título do grupo
                    doc.setFont(undefined, THEME.FONT_BOLD).setTextColor('#000000');
                    doc.text(tipo, col1X, y);
                    doc.setTextColor('#000000'); 
                    doc.setFont(undefined, THEME.FONT_NORMAL); // Reseta para normal
                }
                // ALTERADO: Aumentado para 7 conforme solicitado
                y += 7;

                // Lista de Itens
                const listaItens = gruposPorTipo[tipo];
                listaItens.forEach(item => {
                    // ALTERADO: PONTO 2 - Usando função auxiliar para desenhar linha estruturada
                    // "Marca: Valor      Modelo: Valor      Serial: Valor"
                    
                    if (!isDryRun) {
                        drawBatchItemLine(doc, col1X + 3, y, item, pageWidth - (margin * 2) - 10);
                    }
                    y += 5; // Altura fixa da linha
                });
            });

            return (y - currentY) + 2;

        } else {
            // >>> LÓGICA ORIGINAL (Item Único) <<<
            const ufpelContractId = 'Contrato N° 03/2024';
            const col2X = (order.contrato === ufpelContractId) ? margin + 138 : margin + 117;
            
            const equipLines = doc.splitTextToSize(order.equipamento || 'N/A', col2X - col1X - 30); 

            if (!isDryRun) {
                doc.setFont(undefined, THEME.FONT_BOLD).text('Equipamento:', col1X, y);
                const keyWidthEq = doc.getTextWidth('Equipamento:');
                doc.setFont(undefined, THEME.FONT_NORMAL).text(equipLines, col1X + keyWidthEq + KV_SPACING, y);
                
                drawKeyValue(doc, col2X, y, 'Marca', order.marca);
                
                y += 6 * equipLines.length; 

                drawKeyValue(doc, col1X, y, 'Modelo', order.modelo);
                drawKeyValue(doc, col2X, y, 'Serial', order.serial);
            }
            return (6 * equipLines.length) + 8;
        }
    });

    // --- SEÇÃO ATENDIMENTO (AJUSTADA PARA LOCAL VS RETIRADA E LOTE) ---
    drawSection('Atendimento', (currentY, isDryRun, doc) => {
        const ufpelContractId = 'Contrato N° 03/2024';
        let y = currentY;
        const col1X = margin + 4;
        const col2X = margin + 80;

        // Verifica se é Lote (para definir o local fixo)
        const isLote = order.itens && Array.isArray(order.itens) && order.itens.length > 0;

        // Lógica Baumer / UFPEL (Mantida)
        if (order.contrato === ufpelContractId) {
            if (!isDryRun) {
                drawKeyValue(doc, col1X, y, 'Data do Serviço', formatDate(order.data_servico));
                drawKeyValue(doc, col2X, y, 'Local', 'CME / HE-UFPEL');
                y += 6;
                drawKeyValue(doc, col1X, y, 'Hora de Chegada', order.hora_chegada);
                drawKeyValue(doc, col2X, y, 'Hora de Saída', order.hora_saida);
            }
            return 16; // 2 linhas
        } 
        
        // Lógica Geral (Capão, Exército)
        else {
            // Se for Atendimento no Local, simplifica a exibição
            if (order.atendimento_no_local) {
                if (!isDryRun) {
                    drawKeyValue(doc, col1X, y, 'Data do Serviço', formatDate(order.data_servico));
                    // LÓGICA DE LOCAL PARA LOTE: Se for lote, força "SECRETARIA DE SAÚDE", senão usa o local original
                    const localParaExibir = isLote ? 'SECRETARIA DE SAÚDE' : order.local_atendimento;
                    drawKeyValue(doc, col2X, y, 'Local', localParaExibir);
                }
                return 10; // 1 linha apenas
            } 
            // Se houver retirada/devolução
            else {
                if (!isDryRun) {
                    drawKeyValue(doc, col1X, y, 'Data da Retirada', formatDate(order.data_retirada));
                    drawKeyValue(doc, col2X, y, 'Data da Devolução', formatDate(order.data_devolucao));
                    y += 6;
                    // LÓGICA DE LOCAL PARA LOTE: Se for lote, força "SECRETARIA DE SAÚDE", senão usa o local original
                    const localParaExibir = isLote ? 'SECRETARIA DE SAÚDE' : order.local_atendimento;
                    drawKeyValue(doc, col1X, y, 'Local', localParaExibir);
                }
                return 16; // 2 linhas
            }
        }
    });

    drawSection('Descrição dos Serviços Realizados', (currentY, isDryRun, doc) => {
        const text = order.servicos_realizados || 'Não informado.';
        const textWidth = pageWidth - (margin * 2) - 8;
        const lines = doc.splitTextToSize(text, textWidth);
        if (!isDryRun) doc.text(lines, margin + 4, currentY, { align: 'justify', maxWidth: textWidth });
        return (lines.length * 5);    
	});

    drawSection('Peças Utilizadas', (currentY, isDryRun, doc) => {
        const pecas = order.pecas_utilizadas;

        if (!Array.isArray(pecas) || pecas.length === 0) {
            if (!isDryRun) {
                doc.text('Nenhuma peça utilizada.', margin + 4, currentY+5);
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

	    const drawTableHeader = () => {
    		doc.setFontSize(10).setFont(undefined, THEME.FONT_BOLD);
    		const itemHeaderX = tableX + (colWidths.item / 2);
   		    const qtdHeaderX = tableX + colWidths.item + (colWidths.qtd / 2);
    		const textY = tableCurrentY + rowPadding + (lineHeight / 2); 

    		doc.text('Item', itemHeaderX, textY, { align: 'center', baseline: 'middle' });
    		doc.text('Qtd.', qtdHeaderX, textY, { align: 'center', baseline: 'middle' });
    		doc.text('Descrição', tableX + colWidths.item + colWidths.qtd + rowPadding, textY, { baseline: 'middle' });
    
    		tableCurrentY += lineHeight + (rowPadding * 2); 
    		doc.setLineWidth(0.5);
    		doc.setDrawColor(0, 0, 0); 
    		doc.line(tableX, tableCurrentY, tableX + tableWidth, tableCurrentY); 
	    };
        
        if (!isDryRun) {
            drawTableHeader();
        } else {
             tableCurrentY += lineHeight + (rowPadding * 2);
        }

        doc.setFontSize(10).setFont(undefined, THEME.FONT_NORMAL);
        pecas.forEach((part, index) => {
            const descLines = doc.splitTextToSize(part.descricao, colWidths.desc - (rowPadding * 2));
            const rowHeight = (descLines.length * lineHeight) + (rowPadding * 2);

            if (!isDryRun && (yPosition + (tableCurrentY - currentY) + rowHeight > pageHeight - 45)) {
                doc.addPage();
                drawHeader(); 
                yPosition = 50;
                tableCurrentY = yPosition; 
                drawTableHeader(); 
            }

	        if (!isDryRun) {
    		    const verticalCenter = tableCurrentY + (rowHeight / 2);
   		        const itemX = tableX + (colWidths.item / 2);
    		    const qtdX = tableX + colWidths.item + (colWidths.qtd / 2);
    		    const descX = tableX + colWidths.item + colWidths.qtd + rowPadding;

    		    doc.text(`${index + 1}`, itemX, verticalCenter, { align: 'center', baseline: 'middle' });
    		    doc.text(`${part.qtd}`, qtdX, verticalCenter, { align: 'center', baseline: 'middle' });
    		    doc.text(descLines, descX, verticalCenter, { baseline: 'middle' });

    		    doc.setLineWidth(0.2);
    		    doc.setDrawColor(200, 200, 200);
    		    doc.line(tableX, tableCurrentY + rowHeight, tableX + tableWidth, tableCurrentY + rowHeight);
	        }
            tableCurrentY += rowHeight;
        });

        return tableCurrentY - currentY;
    },{ paddingTop: 5 });


    // --- Assinaturas ---
    const signatureY = pageHeight - 40;
    const signatureHeight = 25;
    const signatureWidth = 60;
    const roleY = signatureY + signatureHeight + 2;
    const lineY = roleY - 3;
    
    // Assinatura do Cliente
    if (order.signature_data && order.signature_data.length > 200) {
        docPDF.addImage(order.signature_data, 'JPEG', margin + 15, signatureY, signatureWidth, signatureHeight);
    }
    // Caso a assinatura tenha sido dispensada (ex: Exército), podemos colocar um texto ou deixar em branco
    else if (order.assinaturaDesconsiderada) {
         docPDF.setFontSize(8).setFont(undefined, THEME.FONT_NORMAL).setTextColor('#999');
         docPDF.text('(Assinatura Dispensada)', margin + 45, signatureY + signatureHeight - 5, { align: 'center' });
         docPDF.setTextColor('#000'); // Reseta cor
    }

    docPDF.setDrawColor('#333333').setLineWidth(0.3);
    docPDF.line(margin + 10, lineY, margin + 10 + signatureWidth + 10, lineY);
    docPDF.setFontSize(9).setFont(undefined, THEME.FONT_BOLD);
    docPDF.text('Responsável do Setor', margin + 45, roleY, { align: 'center' });

    // Assinatura do Técnico (Fixo)
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
            buttonElement.textContent = 'PDF'; // Texto curto para o botão da tabela
        }
    }
}

/**
 * Função para adicionar uma página de OS a um documento PDF existente.
 */
export async function addOrderPageToPdf(docPDF, order, assets) {
    if (!docPDF || !order || !assets) {
        throw new Error("Argumentos inválidos para addOrderPageToPdf.");
    }
    await drawOrderContent(docPDF, order, assets);
}