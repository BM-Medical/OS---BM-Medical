/**
 * pdf-generator-sobreaviso.js
 * Módulo para gerar o PDF do *relatório mensal* de sobreaviso.
 * ATUALIZADO: Corrigida a proporção do logo (aspect ratio).
 * ATUALIZADO: Margem padronizada para 7.
 */

// Pega a instância global do jsPDF
const { jsPDF } = window.jspdf;

// NOVO: Importa a função de desenho da página de atendimento
import { drawAtendimentoPage } from './pdf-generator-atendimento.js';


// MELHORIA: Centraliza as definições de estilo em um objeto de tema
const THEME = {
    PRIMARY_COLOR: [37, 108, 154], // Azul corporativo
    TEXT_ON_PRIMARY: [255, 255, 255],
    HOLIDAY_BG: [254, 226, 226], // bg-red-100
    HOLIDAY_TEXT: [185, 28, 28], // text-red-700
    TEXT_DARK: [0, 0, 0],
    FONT_NORMAL: 'normal',
    FONT_BOLD: 'bold'
};

/**
 * Converte uma URL de imagem para um formato de dados (Data URL) em JPEG.
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
 * Função principal para gerar o PDF do relatório mensal.
 * @param {string} monthYearStr - O mês e ano formatados
 * @param {Array} scheduleBodyData - Dados da tabela de escala (agora objetos)
 * @param {Array} summaryBodyData - Dados da tabela de resumo
 * @param {Array} atendimentosBodyData - Dados da *lista* de atendimentos (para a tabela resumo)
 * @param {Array} holidaysList - Lista de strings dos feriados
 * @param {Array} fullAtendimentosData - Dados *completos* de cada atendimento (para as páginas anexas)
 * @param {string} fileName - Nome do arquivo para salvar
 */
export async function generateMonthlyReportPDF(
    monthYearStr,
    scheduleBodyData,
    summaryBodyData,
    atendimentosBodyData,
    holidaysList,
    fullAtendimentosData, // NOVO PARÂMETRO
    fileName
) {
    const docPDF = new jsPDF();
    let startY = 10;
    // ATUALIZADO: Margem padronizada para 7
    const margin = 7;
    const pageWidth = docPDF.internal.pageSize.width;

    // --- 1. Carrega o Logo ---
    const logoDataUrl = await imageToDataUrl('./images/logo.png', 0.9);
    
    // NOVO: Prepara o objeto de assets para ser reutilizado
    const assets = { logoDataUrl };

    // --- 2. Cabeçalho ---
    // ATUALIZADO: Altura definida como 0 para manter a proporção
    docPDF.addImage(logoDataUrl, 'JPEG', margin, startY, 72, 0);
    docPDF.setFontSize(9).setFont(undefined, THEME.FONT_BOLD);
    docPDF.text('BM MEDICAL Engenharia Clínica', pageWidth - margin, startY + 5, { align: 'right' });
    docPDF.setFontSize(8).setFont(undefined, THEME.FONT_NORMAL);
    docPDF.text('CNPJ: 48.673.158/0001-59', pageWidth - margin, startY + 9, { align: 'right' });
    docPDF.text('Av. Duque de Caxias, 915-B403, Pelotas-RS', pageWidth - margin, startY + 13, { align: 'right' });
    docPDF.text('Fone: (51) 99377-5933', pageWidth - margin, startY + 17, { align: 'right' });
    docPDF.text('central.bmmedical@outlook.com', pageWidth - margin, startY + 21, { align: 'right' });

    // --- 3. Título do Relatório ---
    startY = 50; // Posição Y ajustada após correção do logo
    docPDF.setTextColor(...THEME.TEXT_DARK);
    docPDF.setFontSize(18).setFont(undefined, THEME.FONT_BOLD);
    docPDF.text('Relatório de Escala de Sobreaviso', pageWidth / 2, startY, { align: 'center' });
    startY += 12;

    // --- 4. Tabela da Escala ---
    docPDF.setFontSize(14).setFont(undefined, THEME.FONT_NORMAL);
    const titleText = monthYearStr.includes('Equipe HE-UFPEL') ? monthYearStr : `Equipe HE-UFPEL - ${monthYearStr}`;
    docPDF.text(titleText, pageWidth / 2, startY, { align: 'center' });
    startY += 8;

    const scheduleHead = [['Semana', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom', 'Técnico Responsável']];
    const colSemanaWidth = 25, colTecnicoWidth = 45, dayWidth = 15;
    const totalTableWidth = colSemanaWidth + (dayWidth * 7) + colTecnicoWidth;
    // Margem da tabela (centralizada) é independente da margem da página
    const calculatedMargin = (pageWidth - totalTableWidth) / 2; 

    docPDF.autoTable({
        startY: startY,
        margin: { left: calculatedMargin }, 
        tableWidth: totalTableWidth, 
        head: scheduleHead,
        body: scheduleBodyData.map(row => row.map(cell => cell.content || '')),
        theme: 'grid',
        headStyles: {
            fillColor: THEME.PRIMARY_COLOR, 
            textColor: THEME.TEXT_ON_PRIMARY, 
            fontSize: 11, // Padronizado
            halign: 'center',
            fontStyle: THEME.FONT_BOLD, 
        },
        styles: {
            fontSize: 10, // Padronizado
            cellPadding: 1.5,
            halign: 'center', 
            fontStyle: THEME.FONT_BOLD, 
            textColor: THEME.TEXT_DARK, // Padronizado
        },
        columnStyles: {
            0: { cellWidth: colSemanaWidth }, 1: { cellWidth: dayWidth }, 2: { cellWidth: dayWidth },
            3: { cellWidth: dayWidth }, 4: { cellWidth: dayWidth }, 5: { cellWidth: dayWidth },
            6: { cellWidth: dayWidth }, 7: { cellWidth: dayWidth }, 8: { cellWidth: colTecnicoWidth }
        },
        willDrawCell: (data) => {
            if (data.section === 'body') {
                docPDF.setFont(undefined, THEME.FONT_BOLD); // Garante que o corpo é negrito
                docPDF.setTextColor(...THEME.TEXT_DARK); // Garante que a cor padrão é preta

                if (data.column.index >= 1 && data.column.index <= 7) {
                    const cellData = scheduleBodyData[data.row.index][data.column.index];
                    if (cellData && cellData.isHoliday) {
                        // CORRIGIDO: Usa '...' para espalhar os argumentos de cor
                        docPDF.setFillColor(...THEME.HOLIDAY_BG);
                        docPDF.setTextColor(...THEME.HOLIDAY_TEXT);
                    }
                }
            }
        },
    });
    startY = docPDF.autoTable.previous.finalY + 15;

    // --- 5. Lista de Feriados ---
    if (holidaysList && holidaysList.length > 0) {
        docPDF.setTextColor(...THEME.TEXT_DARK);
        docPDF.setFontSize(15).setFont(undefined, THEME.FONT_BOLD);
        docPDF.text('Feriados do Mês', pageWidth / 2, startY, { align: 'center' });
        startY += 7; 
        
        // ATUALIZADO: Cor do texto padronizada para preto
        docPDF.setFontSize(10).setFont(undefined, THEME.FONT_NORMAL).setTextColor(...THEME.TEXT_DARK); 
        
        // Alinha a lista de feriados com a tabela de escala (calculatedMargin)
        if (holidaysList[0].includes("Nenhum")) {
            docPDF.text(holidaysList[0], calculatedMargin, startY);
        } else {
            holidaysList.forEach(holidayText => {
                docPDF.text('\u2022', calculatedMargin, startY);
                docPDF.text(holidayText, calculatedMargin + 3, startY);
                startY += 5;
            });
        }
        startY += 10;
    }

    // --- 6. Tabela de Resumo de Horas ---
    docPDF.setTextColor(...THEME.TEXT_DARK);
    docPDF.setFontSize(15).setFont(undefined, THEME.FONT_BOLD);
    docPDF.text('Resumo de Horas do Mês', pageWidth / 2, startY, { align: 'center' });
    startY += 7; 

    const summaryHead = [['Técnico', 'Total Sobreaviso', 'Horas Extras', 'Total Líquido']];
    const colTecnicoSummary = 50, colHorasSummary = 40;
    const summaryTotalWidth = colTecnicoSummary + (colHorasSummary * 3);
    const summaryMargin = (pageWidth - summaryTotalWidth) / 2; // Centralizado
    
    docPDF.autoTable({
        startY: startY,
        margin: { left: summaryMargin }, 
        tableWidth: summaryTotalWidth, 
        head: summaryHead,
        body: summaryBodyData,
        theme: 'grid', 
        headStyles: {
            fillColor: THEME.PRIMARY_COLOR, textColor: THEME.TEXT_ON_PRIMARY,
            fontSize: 11, // Padronizado
            halign: 'center', fontStyle: THEME.FONT_BOLD,
        },
        styles: {
            fontSize: 10, // Padronizado
            halign: 'center', fontStyle: THEME.FONT_BOLD, textColor: THEME.TEXT_DARK, // Padronizado
        },
        columnStyles: {
            0: { cellWidth: colTecnicoSummary }, 1: { cellWidth: colHorasSummary },
            2: { cellWidth: colHorasSummary }, 3: { cellWidth: colHorasSummary },
        },
        didDrawRow: (data) => {
            if (data.row.index === summaryBodyData.length - 1) {
                 docPDF.setFont(undefined, THEME.FONT_BOLD);
            }
        }
    });
    startY = docPDF.autoTable.previous.finalY + 15;
    
    // --- 7. Tabela de Atendimentos (Resumo) ---
    if (startY > docPDF.internal.pageSize.height - 40) { 
        docPDF.addPage();
        startY = 20;
    }
    
    docPDF.setTextColor(...THEME.TEXT_DARK);
    docPDF.setFontSize(15).setFont(undefined, THEME.FONT_BOLD);
    docPDF.text('Atendimentos de Sobreaviso do Mês', pageWidth / 2, startY, { align: 'center' });
    startY += 7; 

    const atendimentosHead = [['Data', 'OS', 'Técnico', 'Início', 'Término', 'Total de Horas']];
    // ATUALIZADO: Largura da coluna "Total de Horas" aumentada
    const colDataAt = 20, colOsAt = 25, colTecnicoAt = 50, colInicioAt = 20, colTerminoAt = 20, colTotalAt = 35;
    const totalAtendimentoWidth = colDataAt + colOsAt + colTecnicoAt + colInicioAt + colTerminoAt + colTotalAt;
    const atendimentoMargin = (pageWidth - totalAtendimentoWidth) / 2; // Centralizado

    docPDF.autoTable({
        startY: startY,
        margin: { left: atendimentoMargin }, 
        tableWidth: totalAtendimentoWidth, 
        head: atendimentosHead,
        body: atendimentosBodyData,
        theme: 'grid', 
        headStyles: {
            fillColor: THEME.PRIMARY_COLOR, textColor: THEME.TEXT_ON_PRIMARY,
            fontSize: 11, // Padronizado
            halign: 'center', fontStyle: THEME.FONT_BOLD, 
        },
        styles: {
            fontSize: 10, // Padronizado
            cellPadding: 2, textColor: THEME.TEXT_DARK, fontStyle: THEME.FONT_BOLD, // Padronizado
        },
        columnStyles: {
            0: { cellWidth: colDataAt }, 1: { cellWidth: colOsAt }, 2: { cellWidth: colTecnicoAt },
            3: { cellWidth: colInicioAt }, 4: { cellWidth: colTerminoAt }, 5: { cellWidth: colTotalAt }
        }
    });

    // --- 8. NOVO: Anexar Páginas de Atendimento Individual ---
    if (fullAtendimentosData && fullAtendimentosData.length > 0) {
        // Itera sobre cada atendimento completo
        for (const atendimento of fullAtendimentosData) {
            // Chama a função importada para desenhar o atendimento em uma nova página
            // O `drawAtendimentoPage` já contém o `docPDF.addPage()`
            await drawAtendimentoPage(docPDF, atendimento, assets);
        }
    }
    
    // --- 9. Salvar (agora contém todas as páginas) ---
    docPDF.save(fileName);
}