/**
 * pdf-generator-atendimento.js
 * Módulo para a criação do PDF de Atendimento de Sobreaviso.
 * ATUALIZADO: Corrigida a proporção do logo (aspect ratio).
 * ATUALIZADO: Layout padronizado (semelhante à OS), tema VERDE, assinatura do solicitante centralizada.
 * ATUALIZADO: Corrigido bug do "dry run" que desenhava texto no cabeçalho.
 * ATUALIZADO: Espaçamento de key-value dinâmico.
 * ATUALIZADO: Layout de 3 colunas para Informações do Chamado.
 * ATUALIZADO: Título fonte 18 + subtítulo.
 */

// Pega a instância global do jsPDF
const { jsPDF } = window.jspdf;

// --- Constantes de Layout (Tema Verde) ---
const THEME = {
    PRIMARY_COLOR: [22, 101, 52], // (Equivalente a text-green-800)
    TEXT_ON_PRIMARY: [255, 255, 255],
    BORDER_COLOR: [224, 224, 224], // (Equivalente a #e0e0e0)
    TEXT_DARK: [0, 0, 0],
    FONT_BOLD: 'bold',
    FONT_NORMAL: 'normal'
};
// ATUALIZADO: Margem padronizada para 7
const MARGIN = 7;
const KV_SPACING = 2; // Espaço padrão entre a chave (key) e o valor (value)

// --- Funções Auxiliares ---

/**
 * Converte uma URL de imagem para Data URL (PNG ou JPEG).
 */
function imageToDataUrl(url, format = 'png', quality = 0.8) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'Anonymous';
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            canvas.width = img.width;
            canvas.height = img.height;
            if (format === 'jpeg') {
                ctx.fillStyle = '#FFFFFF';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
            }
            ctx.drawImage(img, 0, 0);
            resolve(canvas.toDataURL(`image/${format}`, quality));
        };
        img.onerror = (err) => reject(new Error(`Falha ao carregar a imagem: ${url}. Erro: ${err.message || err}`));
        img.src = url;
    });
}

/**
 * Formata data AAAA-MM-DD para DD/MM/AAAA.
 */
function formatDate(dateString) {
    if (!dateString) return 'N/A';
    try {
        const [year, month, day] = dateString.split('-');
        return `${day}/${month}/${year}`;
    } catch (e) {
        return 'Data Inválida';
    }
}

/**
 * NOVO: Calcula o total de horas entre duas strings de tempo (HH:MM).
 */
function calculateTotalHours(startTime, endTime) {
    if (!startTime || !endTime) return 'N/A';
    try {
        const [startHour, startMin] = startTime.split(':').map(Number);
        const [endHour, endMin] = endTime.split(':').map(Number);
        
        let startTotalMinutes = (startHour * 60) + startMin;
        let endTotalMinutes = (endHour * 60) + endMin;
        
        if (endTotalMinutes < startTotalMinutes) {
            endTotalMinutes += 24 * 60; 
        }
        
        const diffMinutes = endTotalMinutes - startTotalMinutes;
        if (isNaN(diffMinutes) || diffMinutes < 0) return 'N/A';
        
        const totalHours = diffMinutes / 60.0;
        
        return totalHours.toFixed(2).replace('.', ',') + ' h';
    } catch (e) {
        console.error("Erro ao calcular horas:", e);
        return 'Erro';
    }
}


/**
 * ATUALIZADO: Desenha o cabeçalho padrão da BM (igual ao da OS).
 */
function drawHeader(docPDF, assets) {
    const { logoDataUrl } = assets;
    const pageWidth = docPDF.internal.pageSize.getWidth();
    const headerY = 10;
    
    // Logo BM
    // ATUALIZADO: Altura definida como 0 para manter a proporção
    docPDF.addImage(logoDataUrl, 'JPEG', MARGIN, headerY, 72, 0);
    
    // Informações da Empresa (copiado do pdf-generator.js)
    docPDF.setFontSize(9).setFont(undefined, THEME.FONT_BOLD);
    docPDF.text('BM MEDICAL Engenharia Clínica', pageWidth - MARGIN, headerY + 5, { align: 'right' });
    docPDF.setFontSize(8).setFont(undefined, THEME.FONT_NORMAL);
    docPDF.text('CNPJ: 48.673.158/0001-59', pageWidth - MARGIN, headerY + 9, { align: 'right' });
    docPDF.text('Av. Duque de Caxias, 915-B403, Pelotas-RS', pageWidth - MARGIN, headerY + 13, { align: 'right' });
    docPDF.text('Fone: (51) 99377-5933', pageWidth - MARGIN, headerY + 17, { align: 'right' });
    docPDF.text('central.bmmedical@outlook.com', pageWidth - MARGIN, headerY + 21, { align: 'right' });
}

/**
 * Desenha uma seção de conteúdo (título + caixa).
 */
function drawSection(docPDF, yPos, title, contentCallback, options = {}) {
    const pageWidth = docPDF.internal.pageSize.getWidth();
    const paddingTop = options.paddingTop || 10;
    
    // Simula o desenho para calcular a altura
    // CORRIGIDO: Passa 'true' (isDryRun) para o callback
    const dryRunFinalY = contentCallback(0, true, docPDF); 
    const contentHeight = dryRunFinalY;
    const boxHeight = contentHeight + paddingTop + 8; // Altura total da caixa

    // Desenha a caixa
    docPDF.setDrawColor(...THEME.BORDER_COLOR).setFillColor('#ffffff');
    docPDF.roundedRect(MARGIN, yPos - 5, pageWidth - (MARGIN * 2), boxHeight, 3, 3, 'FD');
    
    // Desenha o Título da Seção (Verde)
    docPDF.setFontSize(14).setTextColor(...THEME.PRIMARY_COLOR).setFont(undefined, THEME.FONT_BOLD);
    docPDF.text(title, MARGIN + 4, yPos);
    docPDF.setDrawColor(...THEME.PRIMARY_COLOR).setLineWidth(0.5);
    docPDF.line(MARGIN + 4, yPos + 2, pageWidth - MARGIN - 4, yPos + 2);

    // Define o estilo para o conteúdo
    docPDF.setFontSize(12).setTextColor(...THEME.TEXT_DARK).setFont(undefined, THEME.FONT_NORMAL);
    
    // Chama o callback para desenhar o conteúdo real
    // CORRIGIDO: Passa 'false' (isDryRun) para o callback
    contentCallback(yPos + paddingTop, false, docPDF);

    // Retorna a nova posição Y
    return yPos + boxHeight + 3;
}

/**
 * Função interna que desenha o conteúdo de um Atendimento em um documento jsPDF.
 */
async function drawAtendimentoContent(docPDF, data, assets) {
    const pageHeight = docPDF.internal.pageSize.height;
    const pageWidth = docPDF.internal.pageSize.width;
    let yPosition = 10; // Posição Y inicial

    // --- Desenha o cabeçalho na primeira página ---
    drawHeader(docPDF, assets);
    // ATUALIZADO: Posição Y ajustada (conforme ajuste do usuário)
    yPosition = 48; 

    // --- Título Principal ---
    // ATUALIZADO: Fonte 18
    docPDF.setFontSize(18).setFont(undefined, THEME.FONT_BOLD).setTextColor(...THEME.TEXT_DARK);
    docPDF.text('ATENDIMENTO DE SOBREAVISO', pageWidth / 2, yPosition, { align: 'center' });
    yPosition += 8; // Espaço entre título e subtítulo

    // NOVO: Subtítulo da Equipe
    docPDF.setFontSize(14).setFont(undefined, THEME.FONT_NORMAL).setTextColor(...THEME.TEXT_DARK);
    docPDF.text('Equipe HE-UFPEL', pageWidth / 2, yPosition, { align: 'center' });
    yPosition += 12; // Espaço após o subtítulo

    // --- Função auxiliar para desenhar o conteúdo (passada para drawSection) ---
    // ATUALIZADO: Remove 'keyWidth' e calcula o espaço dinamicamente
    const drawKeyValue = (doc, x, y, key, value) => {
        // Garante que a chave termine com dois pontos
        const keyText = key.endsWith(':') ? key : `${key}:`;
        
        doc.setFont(undefined, THEME.FONT_BOLD).text(keyText, x, y);
        // Calcula a largura da chave e adiciona um espaço fixo
        const keyWidth = doc.getTextWidth(keyText);
        doc.setFont(undefined, THEME.FONT_NORMAL).text(value || 'N/A', x + keyWidth + KV_SPACING, y);
    };

    // --- Desenho das seções ---

    // Seção 1: Informações do Chamado
    yPosition = drawSection(docPDF, yPosition, 'Informações do Chamado', (currentY, isDryRun, doc) => {
        let y = currentY;
        
        // ATUALIZADO: Define 3 colunas com posições X manuais
        const col1X = MARGIN + 4;
        const col2X = MARGIN + 70;  // Posição da segunda coluna
        const col3X = MARGIN + 125; // Posição da terceira coluna
        
        if (!isDryRun) {
            // Linha 1
            drawKeyValue(doc, col1X, y, 'Nº da OS', data.os_numero);
            drawKeyValue(doc, col2X, y, 'Data', formatDate(data.data));
            drawKeyValue(doc, col3X, y, 'Executado Por', data.executado_por);
            y += 7;
            
            // Linha 2
            const horasTotais = calculateTotalHours(data.hora_inicio, data.hora_termino);
            drawKeyValue(doc, col1X, y, 'Hora de Início', data.hora_inicio);
            drawKeyValue(doc, col2X, y, 'Hora de Término', data.hora_termino);
            drawKeyValue(doc, col3X, y, 'Horas Totais', horasTotais);
        }
        // ATUALIZADO: Altura agora são 2 linhas
        return 14; // Altura calculada (2 linhas * 7)
    });

    // Seção 2: Dados do Equipamento
    yPosition = drawSection(docPDF, yPosition, 'Dados do Equipamento', (currentY, isDryRun, doc) => {
        let y = currentY;
        const halfWidth = (pageWidth / 2) - MARGIN;
        
        if (!isDryRun) {
            // Linha 1
            drawKeyValue(doc, MARGIN + 4, y, 'Equipamento', data.equipamento);
            drawKeyValue(doc, halfWidth + 4, y, 'Marca', data.marca);
            y += 7;
            
            // Linha 2
            drawKeyValue(doc, MARGIN + 4, y, 'Modelo', data.modelo);
            drawKeyValue(doc, halfWidth + 4, y, 'Nº de Série', data.serial);
        }
        return 14; // Altura calculada (2 linhas * 7)
    });

    // Seção 3: Detalhes do Serviço
    yPosition = drawSection(docPDF, yPosition, 'Detalhes do Serviço', (currentY, isDryRun, doc) => {
        let y = currentY;
        const textWidth = pageWidth - (MARGIN * 2) - 8;
        let totalHeight = 0;

        // Motivo do Chamado
        const motivoLines = doc.splitTextToSize(data.motivo_chamado || 'Não informado.', textWidth);
        // CORRIGIDO: Não desenhar nada se for 'isDryRun'
        if (!isDryRun) {
            doc.setFont(undefined, THEME.FONT_BOLD).text('Motivo do Chamado:', MARGIN + 4, y);
            y += 6;
            doc.setFont(undefined, THEME.FONT_NORMAL).text(motivoLines, MARGIN + 4, y, { align: 'justify', maxWidth: textWidth });
            y += (motivoLines.length * 5) + 4; // Altura das linhas + espaçamento
        }
        totalHeight += (motivoLines.length * 5) + 10;

        // Serviço Executado
        const servicoLines = doc.splitTextToSize(data.servico_executado || 'Não informado.', textWidth);
        // CORRIGIDO: Não desenhar nada se for 'isDryRun'
        if (!isDryRun) {
            doc.setFont(undefined, THEME.FONT_BOLD).text('Serviço Executado:', MARGIN + 4, y);
            y += 6;
            doc.setFont(undefined, THEME.FONT_NORMAL).text(servicoLines, MARGIN + 4, y, { align: 'justify', maxWidth: textWidth });
        }
        totalHeight += (servicoLines.length * 5) + 6;
        
        return totalHeight; // Altura dinâmica
    });

    // Seção 4: Informações do Solicitante
    yPosition = drawSection(docPDF, yPosition, 'Informações do Solicitante', (currentY, isDryRun, doc) => {
        let y = currentY;
        const halfWidth = (pageWidth / 2) - MARGIN;
        
        if (!isDryRun) {
            // Linha 1
            drawKeyValue(doc, MARGIN + 4, y, 'Nome', data.nome_solicitante);
            drawKeyValue(doc, halfWidth + 4, y, 'SIAPE', data.siape);
        }
        // ATUALIZADO: Altura reduzida, assinatura movida
        return 7; // Altura calculada (1 linha * 7)
    });

    // --- ATUALIZADO: Assinatura do Solicitante (centralizada) ---
    const signatureY = pageHeight - 40;
    const signatureHeight = 25;
    const signatureWidth = 60;
    const roleY = signatureY + signatureHeight + 2;
    const lineY = roleY - 3;
    
    // Assinatura do Solicitante (Cliente) - CENTRALIZADA
    const signatureX = (pageWidth - signatureWidth) / 2; // Centraliza na página
    if (data.signature_data && data.signature_data.length > 200) {
        docPDF.addImage(data.signature_data, 'JPEG', signatureX, signatureY, signatureWidth, signatureHeight);
    }
    docPDF.setDrawColor(...THEME.TEXT_DARK).setLineWidth(0.3);
    docPDF.line(signatureX, lineY, signatureX + signatureWidth, lineY); // Linha centralizada
    docPDF.setFontSize(9).setFont(undefined, THEME.FONT_BOLD);
    docPDF.text('Assinatura do Solicitante', pageWidth / 2, roleY, { align: 'center' }); // Texto centralizado
}

/**
 * Função principal para gerar um PDF de um único Atendimento e salvá-lo.
 * Esta é chamada pelo botão "Gerar PDF" individual.
 */
export async function generateAtendimentoPdf(data, buttonElement) {
    if (buttonElement) {
        buttonElement.disabled = true;
        // Ícone de loading (opcional)
        buttonElement.innerHTML = '<svg class="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>';
    }
    
    try {
        if (!data) throw new Error('Dados do atendimento não fornecidos.');
        
        const docPDF = new jsPDF();

        // ATUALIZADO: Carrega apenas o logo da BM
        const logoDataUrl = await imageToDataUrl('./images/logo.png', 'jpeg');
        
        const assets = {
            logoDataUrl
        };
        
        // Chama a função de desenho
        await drawAtendimentoContent(docPDF, data, assets);

        // Salva o arquivo
        const fileName = `Atendimento-${(data.os_numero || 'SEM_OS').replace(/\.|:/g, '-')}-${formatDate(data.data).replace(/\//g, '-')}.pdf`;
        docPDF.save(fileName);

    } catch (error) {
        console.error("Erro ao gerar PDF do atendimento:", error);
        alert(`Ocorreu um erro ao gerar o PDF:\n${error.message}`);
    } finally {
        if (buttonElement) {
            buttonElement.disabled = false;
            // Restaura o ícone original
            buttonElement.innerHTML = '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>';
        }
    }
}

/**
 * Função REUTILIZÁVEL para adicionar uma página de Atendimento a um PDF existente.
 * Esta função será usada pelo `pdf-generator-sobreaviso.js`.
 */
export async function drawAtendimentoPage(docPDF, data, assets) {
    if (!docPDF || !data || !assets) {
        throw new Error("Argumentos inválidos para drawAtendimentoPage.");
    }
    // Adiciona uma nova página ao documento PDF existente
    docPDF.addPage();
    
    // Desenha o conteúdo do atendimento nessa nova página
    // NOTA: Esta função agora espera que `assets` contenha apenas `logoDataUrl`
    await drawAtendimentoContent(docPDF, data, assets);
}