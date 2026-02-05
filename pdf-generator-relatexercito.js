/**
 * pdf-generator-relatexercito.js
 * Módulo especializado para o Contrato 10/2025 (Exército Brasileiro).
 * Padronizado conforme o layout do Contrato 138/2024 (Capão).
 */

import { addOrderPageToPdf, imageToDataUrl } from './pdf-generator.js';

const VALOR_SERVICO_FIXO = 2920.00;
const MARGEM_INFERIOR = 25; 

/**
 * Helper para converter mês/ano para formato por extenso (ex: Janeiro/2026)
 */
function formatMesBarra(mesAnoStr) {
    if (!mesAnoStr) return "";
    const mesesNomes = [
        "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
        "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
    ];
    
    let mes, ano;
    const entrada = String(mesAnoStr);

    if (entrada.includes('-')) {
        [ano, mes] = entrada.split('-');
    } else if (entrada.includes('/')) {
        [mes, ano] = entrada.split('/');
        if (ano.length === 2) ano = "20" + ano;
    } else if (!isNaN(parseInt(entrada)) && entrada.length <= 2) {
        mes = entrada;
        ano = new Date().getFullYear();
    } else {
        return entrada;
    }

    const mesIdx = parseInt(mes) - 1;
    if (mesIdx >= 0 && mesIdx < 12) {
        return `${mesesNomes[mesIdx]}/${ano}`;
    }
    return entrada;
}

function formatMesExtenso(mesAnoStr) {
    const res = formatMesBarra(mesAnoStr);
    return res.replace('/', ' de ');
}

/**
 * Verifica se precisa de nova página e desenha cabeçalho
 */
function checkPageBreak(doc, currentY, requiredSpace, logoDataUrl) {
    const pageHeight = doc.internal.pageSize.height;
    if (currentY + requiredSpace > pageHeight - MARGEM_INFERIOR) {
        doc.addPage();
        return desenharCabecalhoPadrao(doc, logoDataUrl, doc.internal.pageSize.width);
    }
    return currentY;
}

/**
 * Desenha o cabeçalho com logo centralizado
 */
function desenharCabecalhoPadrao(doc, logoDataUrl, pageWidth) {
    const logoWidth = 70;
    const y = 5; 
    if (logoDataUrl) {
        doc.addImage(logoDataUrl, 'PNG', (pageWidth - logoWidth) / 2, y, logoWidth, 0);
    }
    doc.setTextColor(0);
    return y + 30;
}

/**
 * Formata texto com a primeira linha indentada e justifica perfeitamente as linhas
 */
function drawJustifiedTextWithIndent(doc, text, x, y, width, indent, logoDataUrl) {
    doc.setFont("helvetica", "normal").setFontSize(10).setTextColor(0);
    if (!text) return y;

    // 1. Obtém a primeira linha com o recuo
    const linesFirst = doc.splitTextToSize(text, width - indent);
    const line1 = linesFirst[0];
    
    y = checkPageBreak(doc, y, 7, logoDataUrl);
    
    if (linesFirst.length === 1) {
        // Se só tem uma linha, não justifica (alinha à esquerda)
        doc.text(line1, x + indent, y);
    } else {
        // Justifica a primeira linha forçando o jsPDF a entender que há uma "próxima" linha
        doc.text([line1, ""], x + indent, y, { align: "justify", maxWidth: width - indent });
        
        // 2. Processa o restante do texto
        const restText = text.substring(line1.length).trim();
        if (restText) {
            const linesRest = doc.splitTextToSize(restText, width);
            for (let i = 0; i < linesRest.length; i++) {
                y += 5;
                y = checkPageBreak(doc, y, 7, logoDataUrl);
                
                if (i < linesRest.length - 1) {
                    // Justifica linhas intermediárias usando o truque do array [linha, ""]
                    doc.text([linesRest[i], ""], x, y, { align: "justify", maxWidth: width });
                } else {
                    // Última linha do parágrafo: alinha apenas à esquerda
                    doc.text(linesRest[i], x, y);
                }
            }
        }
    }
    
    return y + 5;
}

/**
 * Função para gerar apenas a planilha de peças
 */
export async function gerarPlanilhaPecasExercito(dados, btnElement) {
    if (btnElement) {
        btnElement.disabled = true;
        btnElement.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Gerando...';
    }

    try {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        const pageWidth = doc.internal.pageSize.width;
        const margin = 20;
        const safeWidth = pageWidth - (margin * 2);
        const logoDataUrl = await imageToDataUrl('./images/logo.png', 0.9);
        
        let currentY = desenharCabecalhoPadrao(doc, logoDataUrl, pageWidth);

        currentY += 10;

        doc.setFont("helvetica", "bold").setFontSize(14).setTextColor(0);
        doc.text("Planilha de Compra de Peças", pageWidth / 2, currentY, { align: "center" });
        currentY += 12;

        const info = [
            { label: "Contrato:", value: "Termo de Contrato Nº. 10/2025" },
            { label: "Cliente:", value: "9º Batalhão de Infantaria Motorizado" },
            { label: "Referência:", value: formatMesExtenso(dados.mesRef) }
        ];

        doc.setFontSize(11);
        info.forEach(item => {
            doc.setFont("helvetica", "bold").text(item.label, margin, currentY);
            doc.setFont("helvetica", "normal").text(item.value, margin + 35, currentY);
            currentY += 6;
        });
        currentY += 4;

        const headers = ["ITEM", "DESCRIÇÃO", "QTD", "VALOR UNIT.", "VALOR TOTAL"];
        const rows = (dados.itens || []).map((it, idx) => [
            idx + 1,
            it.descricao.toUpperCase(),
            it.qtd,
            formatMoeda(it.valorUnit),
            formatMoeda(it.qtd * it.valorUnit)
        ]);

        const totalPecas = (dados.itens || []).reduce((acc, it) => acc + (it.qtd * it.valorUnit), 0);
        rows.push(["TOTAL GERAL", "", "", "", formatMoeda(totalPecas)]);

        currentY = drawTableStyle(doc, headers, rows, margin, currentY, safeWidth, [12, 83, 15, 30, 30], true, logoDataUrl, [220, 220, 220]);

        doc.save(`Planilha-Pecas-Exercito-${dados.mesRef}.pdf`);
    } catch (e) {
        console.error(e);
    } finally {
        if (btnElement) {
            btnElement.disabled = false;
            btnElement.innerHTML = '<i class="fas fa-table"></i> Tabela Peças';
        }
    }
}

/**
 * Função: Gera o Relatório Mensal Completo
 */
export async function gerarRelatorioExercitoCompleto(dados, btnElement) {
    if (btnElement) {
        btnElement.disabled = true;
        btnElement.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Gerando...';
    }

    try {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        const pageWidth = doc.internal.pageSize.width;
        const logoDataUrl = await imageToDataUrl('./images/logo.png', 0.9);
        const techSigDataUrl = await imageToDataUrl('./images/assinatura-tecnico.png', 0.7);
        const assets = { logoDataUrl, techSigDataUrl };

        await desenharCapaRelatorio(doc, logoDataUrl, dados);

        doc.addPage();
        desenharCabecalhoPadrao(doc, logoDataUrl, pageWidth);
        doc.setFont("helvetica", "bold").setFontSize(16);
        doc.text("ANEXO I", pageWidth / 2, doc.internal.pageSize.height / 2, { align: "center" });

        if (dados.ossImprimir && dados.ossImprimir.length > 0) {
            for (const os of dados.ossImprimir) {
                doc.addPage();
                await addOrderPageToPdf(doc, os, assets);
            }
        }

        doc.save(`Relatorio-Exercito-${dados.mesRef}.pdf`);
    } catch (error) {
        console.error(error);
    } finally {
        if (btnElement) {
            btnElement.disabled = false;
            btnElement.innerHTML = '<i class="fas fa-file-contract"></i> Gerar Relatório';
        }
    }
}

async function desenharCapaRelatorio(doc, logoDataUrl, dados) {
    const pageWidth = doc.internal.pageSize.width;
    const margin = 20;
    const safeWidth = pageWidth - (margin * 2);
    const indent = 12;

    let y = desenharCabecalhoPadrao(doc, logoDataUrl, pageWidth);
    
    // Ajuste solicitado: Baixar um pouco o título
    y += 10;

    doc.setFont("helvetica", "bold").setFontSize(16).setTextColor(0);
    doc.text("RELATÓRIO MENSAL", pageWidth / 2, y, { align: "center" });
    y += 12;

    doc.setFontSize(11);
    const addDataLine = (l, v) => {
        doc.setFont("helvetica", "bold").text(l, margin, y);
        doc.setFont("helvetica", "normal").text(v, margin + 25, y);
        y += 6;
    };

    addDataLine("Contrato:", "Termo de Contrato Nº. 10/2025");
    addDataLine("Cliente:", "9º Batalhão de Infantaria Motorizado");
    addDataLine("Período:", dados.periodoTexto || formatMesExtenso(dados.mesRef));
    y += 8;

    // 1. Objeto
    y = checkPageBreak(doc, y, 15, logoDataUrl);
    doc.setFont("helvetica", "bold").setFontSize(14).text("1. Objeto", margin, y);
    y += 8;
    y = drawJustifiedTextWithIndent(doc, dados.textoObjeto, margin, y, safeWidth, indent, logoDataUrl);
    y += 5;

    // 2. Atividades Realizadas
    y = checkPageBreak(doc, y, 15, logoDataUrl);
    doc.setFont("helvetica", "bold").setFontSize(14).text("2. Atividades Realizadas", margin, y);
    y += 8;
    y = drawJustifiedTextWithIndent(doc, dados.textoAtividades, margin, y, safeWidth, indent, logoDataUrl);
    y += 5;

    // 3. Controle de Gastos
    y = checkPageBreak(doc, y, 15, logoDataUrl);
    doc.setFont("helvetica", "bold").setFontSize(14).text("3. Aquisição de Peças e Controle de Gastos", margin, y);
    y += 8;
    const introPecas = "Na tabela abaixo, apresentam-se as peças adquiridas e seus respectivos valores para fins de referência.";
    y = drawJustifiedTextWithIndent(doc, introPecas, margin, y, safeWidth, indent, logoDataUrl);
    y += 2;

    const pHeaders = ["DESCRIÇÃO", "QTD", "VALOR UNIT.", "VALOR TOTAL"];
    const pRows = (dados.itens || []).map(it => [it.descricao.toUpperCase(), it.qtd, formatMoeda(it.valorUnit), formatMoeda(it.qtd * it.valorUnit)]);
    const totalPecasMes = (dados.itens || []).reduce((acc, it) => acc + (it.qtd * it.valorUnit), 0);
    pRows.push(["TOTAL GERAL", "", "", formatMoeda(totalPecasMes)]);
    y = drawTableStyle(doc, pHeaders, pRows, margin, y, safeWidth, [95, 15, 30, 30], true, logoDataUrl, [220, 220, 220]);
    
    // --- QUEBRA DE PÁGINA OBRIGATÓRIA APÓS A TABELA DE PEÇAS ---
    doc.addPage();
    y = desenharCabecalhoPadrao(doc, logoDataUrl, pageWidth);
    y += 10; 

    const txtC = "Considerando que o Contrato N°10/2025 prevê o limite anual de R$ 30.000,00 destinado à aquisição de peças, apresenta-se a seguir a tabela de controle mensal de despesas. O objetivo é permitir um acompanhamento progressivo da utilização dos recursos, garantindo maior transparência e prevenindo riscos de desequilíbrio financeiro durante a execução contratual.";
    y = drawJustifiedTextWithIndent(doc, txtC, margin, y, safeWidth, indent, logoDataUrl);
    y += 2;

    const cHeaders = ["MÊS DE REFERÊNCIA", "VALOR GASTO EM PEÇAS (MENSAL)", "VALOR SOBRANDO (MENSAL)"];
    const cRows = (dados.historicoControle || []).map(h => [formatMesBarra(h.mesAno), formatMoeda(h.gasto), formatMoeda(h.sobrando)]);
    const saldoAnual = 30000 - (dados.historicoControle || []).reduce((acc, h) => acc + (h.gasto || 0), 0);
    cRows.push(["VALOR CONTRATUAL DISPONÍVEL (ANUAL)", "", formatMoeda(saldoAnual)]);
    
    y = drawTableStyle(doc, cHeaders, cRows, margin, y, safeWidth, [60, 60, 50], true, logoDataUrl, [220, 220, 220]);

    y += 10;
    y = checkPageBreak(doc, y, 15, logoDataUrl);
    doc.setFont("helvetica", "bold").setFontSize(14).text("4. Faturamento", margin, y);
    y += 8;
    const fRows = [
        ["1", "Serviço Mensal Manutenção Manutenção Odontoclínica", formatMoeda(VALOR_SERVICO_FIXO)],
        ["2", "Fornecimento de peças (Total do Mês)", formatMoeda(totalPecasMes)],
        ["", "TOTAL DO FATURAMENTO", formatMoeda(VALOR_SERVICO_FIXO + totalPecasMes)]
    ];
    // Ajustado para fundo cinza no cabeçalho
    y = drawTableStyle(doc, ["Item", "Descrição", "Valor Executado"], fRows, margin, y, safeWidth, [15, 115, 40], true, logoDataUrl, [220, 220, 220]);
}

/**
 * Desenha tabelas com lógica de cores e mesclagem de rodapé corrigida
 */
function drawTableStyle(doc, headers, rows, x, y, width, customWidths = [], highlightLast = false, logoDataUrl, headerBgColor = [37, 99, 235]) {
    const colCount = headers.length;
    const colWidths = customWidths.length > 0 ? customWidths : Array(colCount).fill(width / colCount);
    const headerH = 8;
    const rowH = 7;

    y = checkPageBreak(doc, y, headerH + rowH, logoDataUrl);
    
    // Header
    const isLightHeader = (headerBgColor[0] + headerBgColor[1] + headerBgColor[2]) > 500;
    doc.setFont("helvetica", "bold").setFontSize(8.5);

    let curX = x;
    headers.forEach((txt, i) => {
        const w = colWidths[i];
        doc.setFillColor(headerBgColor[0], headerBgColor[1], headerBgColor[2]);
        doc.setDrawColor(0);
        doc.rect(curX, y, w, headerH, 'FD');
        doc.setTextColor(isLightHeader ? 0 : 255);
        doc.text(txt, curX + w / 2, y + 5.5, { align: "center" });
        curX += w;
    });

    y += headerH;
    doc.setTextColor(0);

    rows.forEach((row, rIdx) => {
        const isLast = highlightLast && rIdx === rows.length - 1;
        const oldY = y;
        y = checkPageBreak(doc, y, rowH, logoDataUrl);
        
        if (y < oldY) { 
            doc.setFont("helvetica", "bold");
            let headX = x;
            headers.forEach((txt, i) => {
                const w = colWidths[i];
                doc.setFillColor(headerBgColor[0], headerBgColor[1], headerBgColor[2]);
                doc.setDrawColor(0);
                doc.rect(headX, y, w, headerH, 'FD');
                doc.setTextColor(isLightHeader ? 0 : 255);
                doc.text(txt, headX + w / 2, y + 5.5, { align: "center" });
                headX += w;
            });
            y += headerH;
            doc.setTextColor(0);
        }

        // Estilo da linha (Última linha em negrito e tamanho 10)
        doc.setFont("helvetica", isLast ? "bold" : "normal");
        doc.setFontSize(isLast ? 10 : 8);
        
        curX = x;

        const labelText = row[0];
        const isTotalGeral = isLast && labelText === "TOTAL GERAL";
        const isSaldoAnual = isLast && labelText === "VALOR CONTRATUAL DISPONÍVEL (ANUAL)";
        const isTotalFaturamento = isLast && row[1] === "TOTAL DO FATURAMENTO"; // Identifica o rótulo na segunda coluna se for faturamento

        if (isTotalGeral || isSaldoAnual || (isLast && row[1] === "TOTAL DO FATURAMENTO")) {
            let mergeCount = 0;
            let mergeLabel = labelText;

            if (isTotalGeral) mergeCount = 3; 
            if (isSaldoAnual) mergeCount = 2;
            if (isLast && row[1] === "TOTAL DO FATURAMENTO") {
                mergeCount = 2;
                mergeLabel = "TOTAL DO FATURAMENTO";
            }

            const wMerged = colWidths.slice(0, mergeCount).reduce((a, b) => a + b, 0);
            
            doc.setFillColor(189, 213, 237);
            doc.rect(curX, y, wMerged, rowH, 'FD');
            doc.setTextColor(0);
            doc.text(mergeLabel, curX + wMerged / 2, y + 4.5, { align: "center" });
            curX += wMerged;

            row.slice(mergeCount).forEach((txt, i) => {
                const w = colWidths[mergeCount + i];
                doc.setFillColor(189, 213, 237);
                doc.rect(curX, y, w, rowH, 'FD');
                doc.text(String(txt), curX + w / 2, y + 4.5, { align: "center" });
                curX += w;
            });
        } else {
            row.forEach((txt, i) => {
                const w = colWidths[i];
                if (isLast) {
                    doc.setFillColor(189, 213, 237);
                    doc.rect(curX, y, w, rowH, 'FD');
                } else {
                    doc.setFillColor(255, 255, 255);
                    doc.rect(curX, y, w, rowH, 'S');
                }
                doc.setTextColor(0);
                
                let align = "center";
                // Alinhamento para colunas de descrição
                if (row.length === 4 && i === 0 && !isLast) align = "left";
                else if (row.length === 3 && i === 1 && !isLast) align = "left";
                else if (row.length === 5 && i === 1 && !isLast) align = "left";

                const textX = align === "left" ? curX + 2 : curX + w / 2;
                doc.text(String(txt), textX, y + 4.5, { align });
                curX += w;
            });
        }
        y += rowH;
    });

    return y;
}

function formatMoeda(v) { 
    if (v === undefined || v === null) return "R$ 0,00";
    return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); 
}