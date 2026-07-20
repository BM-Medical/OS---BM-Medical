/**
 * pdf-generator-relatexercito.js
 * Módulo especializado para o Contrato 10/2025 (Exército Brasileiro).
 * Adicionado suporte para múltiplos anos contratuais e meses de renovação.
 */

import { addOrderPageToPdf, imageToDataUrl } from './pdf-generator.js';

const MARGEM_INFERIOR = 25; 

const MESES_UPPER = [
    "JANEIRO", "FEVEREIRO", "MARÇO", "ABRIL", "MAIO", "JUNHO",
    "JULHO", "AGOSTO", "SETEMBRO", "OUTUBRO", "NOVEMBRO", "DEZEMBRO"
];

function getMesUpper(mesStr) {
    const m = parseInt(mesStr) - 1;
    return (m >= 0 && m < 12) ? MESES_UPPER[m] : mesStr;
}

/**
 * Helper para converter mês/ano para formato por extenso (ex: Janeiro/2026)
 */
function formatMesBarra(mesAnoStr) {
    if (!mesAnoStr) return "";
    
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
        // Formato Capitalizado (Primeira letra Maiúscula) para tabelas de controle
        const nomeMesCapitalizado = MESES_UPPER[mesIdx].charAt(0) + MESES_UPPER[mesIdx].slice(1).toLowerCase();
        return `${nomeMesCapitalizado}/${ano}`;
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

    const linesFirst = doc.splitTextToSize(text, width - indent);
    const line1 = linesFirst[0];
    
    y = checkPageBreak(doc, y, 7, logoDataUrl);
    
    if (linesFirst.length === 1) {
        doc.text(line1, x + indent, y);
    } else {
        doc.text([line1, ""], x + indent, y, { align: "justify", maxWidth: width - indent });
        
        const restText = text.substring(line1.length).trim();
        if (restText) {
            const linesRest = doc.splitTextToSize(restText, width);
            for (let i = 0; i < linesRest.length; i++) {
                y += 5;
                y = checkPageBreak(doc, y, 7, logoDataUrl);
                
                if (i < linesRest.length - 1) {
                    doc.text([linesRest[i], ""], x, y, { align: "justify", maxWidth: width });
                } else {
                    doc.text(linesRest[i], x, y);
                }
            }
        }
    }
    return y + 5;
}

// Helpers para desenhar tabelas padronizadas no PDF
function drawTabelaPecasPlanilha(doc, itens, margin, y, safeWidth, logoDataUrl) {
    const headers = ["ITEM", "DESCRIÇÃO", "QTD", "VALOR UNIT.", "VALOR TOTAL"];
    const rows = (itens || []).map((it, idx) => [
        idx + 1,
        it.descricao.toUpperCase(),
        it.qtd,
        formatMoeda(it.valorUnit),
        formatMoeda(it.qtd * it.valorUnit)
    ]);
    const totalPecas = (itens || []).reduce((acc, it) => acc + (it.qtd * it.valorUnit), 0);
    rows.push(["TOTAL GERAL", "", "", "", formatMoeda(totalPecas)]);

    return drawTableStyle(doc, headers, rows, margin, y, safeWidth, [12, 83, 15, 30, 30], true, logoDataUrl, [220, 220, 220]);
}

function drawTabelaPecasRelatorio(doc, itens, margin, y, safeWidth, logoDataUrl) {
    const pHeaders = ["DESCRIÇÃO", "QTD", "VALOR UNIT.", "VALOR TOTAL"];
    const pRows = (itens || []).map(it => [it.descricao.toUpperCase(), it.qtd, formatMoeda(it.valorUnit), formatMoeda(it.qtd * it.valorUnit)]);
    const subtotal = (itens || []).reduce((acc, it) => acc + (it.qtd * it.valorUnit), 0);
    pRows.push(["TOTAL GERAL", "", "", formatMoeda(subtotal)]);
    
    return drawTableStyle(doc, pHeaders, pRows, margin, y, safeWidth, [95, 15, 30, 30], true, logoDataUrl, [220, 220, 220]);
}

function drawTabelaControle(doc, historico, limiteAnual, anoLabel, margin, y, safeWidth, logoDataUrl) {
    const cHeaders = ["MÊS DE REFERÊNCIA", "VALOR GASTO EM PEÇAS (MENSAL)", "VALOR SOBRANDO (MENSAL)"];
    let saldoAtual = limiteAnual;
    
    const cRows = (historico || []).map(h => {
        saldoAtual -= h.gasto;
        const mesTexto = h.mesAnoTexto || formatMesBarra(h.mesAno);
        return [mesTexto, formatMoeda(h.gasto), formatMoeda(saldoAtual)];
    });
    
    cRows.push([`VALOR CONTRATUAL DISPONÍVEL (${anoLabel}º ANO)`, "", formatMoeda(saldoAtual)]);
    return drawTableStyle(doc, cHeaders, cRows, margin, y, safeWidth, [60, 60, 50], true, logoDataUrl, [220, 220, 220]);
}

function drawTotalGeralDestaque(doc, titulo, valor, margin, y, safeWidth) {
    doc.setFillColor(189, 213, 237);
    doc.rect(margin, y, safeWidth, 7, 'FD');
    doc.setTextColor(0);
    doc.setFont("helvetica", "bold").setFontSize(10);
    doc.text(titulo, margin + (safeWidth - 30)/2, y + 5, { align: "center" });
    doc.text(formatMoeda(valor), margin + safeWidth - 15, y + 5, { align: "center" });
    return y + 9;
}

/**
 * Função: Gera apenas a planilha de peças
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

        if (dados.transicao) {
            const pecasAntigas = dados.itens.filter(i => i.contratoAno == dados.transicao.anoAntigo);
            const pecasNovas = dados.itens.filter(i => i.contratoAno == dados.transicao.anoNovo);
            
            doc.setFont("helvetica", "bold").setFontSize(10).setTextColor(0);
            doc.text(`Peças do ${dados.transicao.anoAntigo}º Ano Contratual (${dados.transicao.strDataAntigo})`, margin, currentY);
            currentY += 4;
            currentY = drawTabelaPecasPlanilha(doc, pecasAntigas, margin, currentY, safeWidth, logoDataUrl);
            currentY += 6;
            
            doc.setFont("helvetica", "bold").setFontSize(10).setTextColor(0);
            doc.text(`Peças do ${dados.transicao.anoNovo}º Ano Contratual (${dados.transicao.strDataNovo})`, margin, currentY);
            currentY += 4;
            currentY = drawTabelaPecasPlanilha(doc, pecasNovas, margin, currentY, safeWidth, logoDataUrl);
            
            const totalGeral = (dados.itens || []).reduce((acc, it) => acc + (it.qtd * it.valorUnit), 0);
            currentY += 2;
            currentY = drawTotalGeralDestaque(doc, "TOTAL GERAL DE PEÇAS NO MÊS", totalGeral, margin, currentY, safeWidth);

        } else {
            currentY = drawTabelaPecasPlanilha(doc, dados.itens, margin, currentY, safeWidth, logoDataUrl);
        }

        const mesUpper = getMesUpper(dados.mesRef);
        const nomeArquivoPlanilha = `COMPRA DE PEÇAS - ${mesUpper}.${dados.anoRef}.pdf`;
        doc.save(nomeArquivoPlanilha);

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

        const mm = String(dados.mesRef).padStart(2, '0');
        const aa = String(dados.anoRef).slice(-2);
        const nomeArquivoRelatorio = `Relatório Mensal ${mm}.${aa} - CT N°10.2025 - Exército Brasileiro.pdf`;
        
        doc.save(nomeArquivoRelatorio);

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

    // 3. Peças
    y = checkPageBreak(doc, y, 15, logoDataUrl);
    doc.setFont("helvetica", "bold").setFontSize(14).text("3. Aquisição de Peças e Controle de Gastos", margin, y);
    y += 8;
    
    const introPecas = dados.transicao
        ? "Nas tabelas abaixo, apresentam-se as peças adquiridas e seus respectivos valores, separadas de acordo com seus respectivos períodos contratuais, para fins de referência."
        : "Na tabela abaixo, apresentam-se as peças adquiridas e seus respectivos valores para fins de referência.";
    y = drawJustifiedTextWithIndent(doc, introPecas, margin, y, safeWidth, indent, logoDataUrl);
    y += 2;

    const totalPecasMes = (dados.itens || []).reduce((acc, it) => acc + (it.qtd * it.valorUnit), 0);

    if (dados.transicao) {
        const pecasAntigas = dados.itens.filter(i => i.contratoAno == dados.transicao.anoAntigo);
        const pecasNovas = dados.itens.filter(i => i.contratoAno == dados.transicao.anoNovo);
        
        doc.setFont("helvetica", "bold").setFontSize(10).text(`Peças do ${dados.transicao.anoAntigo}º Ano Contratual (${dados.transicao.strDataAntigo})`, margin, y);
        y += 4;
        y = drawTabelaPecasRelatorio(doc, pecasAntigas, margin, y, safeWidth, logoDataUrl);
        y += 6;
        
        doc.setFont("helvetica", "bold").setFontSize(10).text(`Peças do ${dados.transicao.anoNovo}º Ano Contratual (${dados.transicao.strDataNovo})`, margin, y);
        y += 4;
        y = drawTabelaPecasRelatorio(doc, pecasNovas, margin, y, safeWidth, logoDataUrl);
        y += 2;
        y = drawTotalGeralDestaque(doc, "TOTAL GERAL DE PEÇAS NO MÊS", totalPecasMes, margin, y, safeWidth);
    } else {
        y = drawTabelaPecasRelatorio(doc, dados.itens, margin, y, safeWidth, logoDataUrl);
    }
    
    // --- QUEBRA DE PÁGINA PARA TABELAS DE CONTROLE ---
    doc.addPage();
    y = desenharCabecalhoPadrao(doc, logoDataUrl, pageWidth);
    y += 10; 

    const txtC = dados.textoIntroControle || "Considerando o limite anual...";
    y = drawJustifiedTextWithIndent(doc, txtC, margin, y, safeWidth, indent, logoDataUrl);
    y += 2;

    if (dados.transicao) {
        doc.setFont("helvetica", "bold").setFontSize(10).text(`Controle Mensal - ${dados.transicao.anoAntigo}º Ano Contratual`, margin, y);
        y += 4;
        y = drawTabelaControle(doc, dados.historicoControle, dados.limiteAnual, dados.transicao.anoAntigo, margin, y, safeWidth, logoDataUrl);
        y += 8;
        
        doc.setFont("helvetica", "bold").setFontSize(10).text(`Controle Mensal - ${dados.transicao.anoNovo}º Ano Contratual`, margin, y);
        y += 4;
        y = drawTabelaControle(doc, dados.historicoControleNovo, dados.limiteAnualNovo, dados.transicao.anoNovo, margin, y, safeWidth, logoDataUrl);
    } else {
        doc.setFont("helvetica", "bold").setFontSize(10).text(`Controle Mensal - ${dados.anoAtual}º Ano Contratual`, margin, y);
        y += 4;
        y = drawTabelaControle(doc, dados.historicoControle, dados.limiteAnual, dados.anoAtual, margin, y, safeWidth, logoDataUrl);
    }

    // 4. Faturamento
    if (dados.transicao) {
        doc.addPage();
        y = desenharCabecalhoPadrao(doc, logoDataUrl, pageWidth);
        y += 10;
    } else {
        y += 10;
        y = checkPageBreak(doc, y, 15, logoDataUrl);
    }
    
    doc.setFont("helvetica", "bold").setFontSize(14).text("4. Faturamento", margin, y);
    y += 8;
    
    if (dados.textoIntroFaturamento) {
        y = drawJustifiedTextWithIndent(doc, dados.textoIntroFaturamento, margin, y, safeWidth, indent, logoDataUrl);
        y += 2;
    }
    
    const fRows = [];
    let totalFat = 0;
    let indexFat = 1;

    if (dados.servicosFaturamento && dados.servicosFaturamento.length > 0) {
        dados.servicosFaturamento.forEach(serv => {
            fRows.push([String(indexFat++), serv.descricao, formatMoeda(serv.valor)]);
            totalFat += serv.valor;
        });
    }

    fRows.push([String(indexFat), "Fornecimento de peças conforme discriminado no item 3...", formatMoeda(totalPecasMes)]);
    totalFat += totalPecasMes;
    
    fRows.push(["", "TOTAL DO FATURAMENTO", formatMoeda(totalFat)]);

    y = drawTableStyle(doc, ["Item", "Descrição", "Valor Executado"], fRows, margin, y, safeWidth, [15, 115, 40], true, logoDataUrl, [220, 220, 220]);
}

/**
 * Desenha tabelas com lógica de cores e mesclagem de rodapé
 */
function drawTableStyle(doc, headers, rows, x, y, width, customWidths = [], highlightLast = false, logoDataUrl, headerBgColor = [37, 99, 235]) {
    const colCount = headers.length;
    const colWidths = customWidths.length > 0 ? customWidths : Array(colCount).fill(width / colCount);
    const headerH = 8;
    const rowH = 7;

    y = checkPageBreak(doc, y, headerH + rowH, logoDataUrl);
    
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

        doc.setFont("helvetica", isLast ? "bold" : "normal");
        doc.setFontSize(isLast ? 10 : 8);
        
        curX = x;

        const labelText = row[0];
        const isTotalGeral = isLast && labelText === "TOTAL GERAL";
        // Atualizado para englobar os textos de rodapé dos múltiplos anos
        const isSaldoAnual = isLast && labelText.includes("VALOR CONTRATUAL DISPONÍVEL");
        const isTotalFaturamento = isLast && row[1] === "TOTAL DO FATURAMENTO"; 

        if (isTotalGeral || isSaldoAnual || isTotalFaturamento) {
            let mergeCount = 0;
            let mergeLabel = labelText;

            if (isTotalGeral) mergeCount = 3; 
            if (isSaldoAnual) mergeCount = 2;
            if (isTotalFaturamento) {
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
                if (row.length === 4 && i === 0 && !isLast) align = "left";
                else if (row.length === 3 && i === 1 && !isLast) {
                    if (!String(txt).includes("R$")) align = "left";
                }
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