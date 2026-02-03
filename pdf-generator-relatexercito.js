/**
 * pdf-generator-relatexercito.js
 * Módulo especializado para o Contrato 10/2025 (Exército Brasileiro).
 * Focado em leveza de arquivo e fidelidade visual ao padrão BM Medical.
 */

import { addOrderPageToPdf, imageToDataUrl } from './pdf-generator.js';

const VALOR_SERVICO_FIXO = 2920.00;
const VALOR_META_MENSAL = 2500.00;

/**
 * Helper para converter mês/ano para formato por extenso (ex: Dezembro de 2025)
 */
function formatMesExtenso(mesAnoStr, anoReferencia = new Date().getFullYear()) {
    if (!mesAnoStr) return "";
    const mesesNomes = [
        "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
        "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
    ];
    
    let mes, ano = anoReferencia;

    // Converte para string para garantir o uso de .includes
    const entrada = String(mesAnoStr);

    if (entrada.includes('-')) {
        [ano, mes] = entrada.split('-');
    } else if (entrada.includes('/')) {
        [mes, ano] = entrada.split('/');
        if (ano.length === 2) ano = "20" + ano;
    } else if (!isNaN(parseInt(entrada))) {
        // Caso venha apenas o número do mês (ex: "12")
        mes = entrada;
    } else {
        return entrada;
    }

    const mesIdx = parseInt(mes) - 1;
    if (mesIdx >= 0 && mesIdx < 12) {
        return `${mesesNomes[mesIdx]} de ${ano}`;
    }
    
    return entrada;
}

/**
 * Função Reutilizável para Desenhar o Cabeçalho Padrão das OSs
 */
const drawStandardHeader = (doc, logoDataUrl, pageWidth, margin) => {
    const headerY = 10;
    if (logoDataUrl) {
        doc.addImage(logoDataUrl, 'PNG', margin, headerY, 72, 0);
    }
    doc.setFontSize(9).setFont("helvetica", "bold");
    doc.setTextColor(0); // Garante cor preta
    doc.text('BM MEDICAL Engenharia Clínica', pageWidth - margin, headerY + 5, { align: 'right' });
    doc.setFontSize(8).setFont("helvetica", "normal");
    doc.text('CNPJ: 48.673.158/0001-59', pageWidth - margin, headerY + 9, { align: 'right' });
    doc.text('Av. Duque de Caxias, 915-B403, Pelotas-RS', pageWidth - margin, headerY + 13, { align: 'right' });
    doc.text('Fone: (51) 99377-5933', pageWidth - margin, headerY + 17, { align: 'right' });
    doc.text('central.bmmedical@outlook.com', pageWidth - margin, headerY + 21, { align: 'right' });
    return headerY + 40; 
};

/**
 * Helper para formatar texto em caixa baixa com primeiras letras maiúsculas
 */
function toTitleCase(str) {
    if (!str) return '';
    return str.toLowerCase().replace(/(?:^|\s|-)\S/g, function(a) { return a.toUpperCase(); });
}

/**
 * Função: Gera a Planilha de Compra de Peças 
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
        const margin = 15;
        const safeWidth = pageWidth - (margin * 2);

        const logoDataUrl = await imageToDataUrl('./images/logo.png', 0.6);
        
        // --- 1. CABEÇALHO PADRONIZADO ---
        let currentY = drawStandardHeader(doc, logoDataUrl, pageWidth, margin);

        // Título da Planilha
        doc.setFontSize(14).setFont("helvetica", "bold");
        doc.text("Planilha de Compra de Peças", pageWidth / 2, currentY, { align: "center" });
        
        // --- 2. BLOCO DE INFORMAÇÕES ---
        currentY += 15;
        doc.setFontSize(10);
        
        const mesExtenso = formatMesExtenso(dados.mesReferenciaNome || dados.mesRef, dados.anoRef);

        const info = [
            { label: "Contrato:", value: toTitleCase("CONTRATO ADMINISTRATIVO Nº 10/2025") },
            { label: "Cliente:", value: toTitleCase("EXÉRCITO BRASILEIRO - 9° BATALHÃO DE INFANTARIA MOTORIZADO - REGIMENTO TUIUTI") },
            { label: "Mês de Referência:", value: mesExtenso }
        ];

        info.forEach(item => {
            doc.setFont("helvetica", "bold");
            doc.text(item.label, margin, currentY);
            
            doc.setFont("helvetica", "normal");
            const labelWidth = 35; 
            const textLines = doc.splitTextToSize(item.value, safeWidth - labelWidth);
            doc.text(textLines, margin + labelWidth, currentY);
            
            currentY += (textLines.length * 6);
        });

        // --- 3. TABELA DE PEÇAS ---
        currentY += 5;
        const colW = { item: 15, desc: 100, qtd: 15, unit: 25, total: 25 };

        const drawRow = (cells, isHeader = false) => {
            const h = 8;
            let x = margin;
            
            if (isHeader) {
                doc.setDrawColor(0);
                doc.setTextColor(0); 
                doc.setFont("helvetica", "bold");
            } else {
                doc.setTextColor(0);
                doc.setFont("helvetica", "normal");
                doc.setDrawColor(0);
            }

            cells.forEach((text, i) => {
                const w = Object.values(colW)[i];
                if (isHeader) {
                    doc.setFillColor(230, 230, 230); // Cinza garantido para cada célula do cabeçalho
                    doc.rect(x, currentY, w, h, 'FD'); 
                } else {
                    doc.setFillColor(255, 255, 255);
                    doc.rect(x, currentY, w, h, 'S'); 
                }

                const align = (i === 1 && !isHeader) ? "left" : "center";
                const textX = align === "left" ? x + 2 : x + (w / 2);
                
                doc.setFontSize(8);
                doc.text(String(text), textX, currentY + 5.5, { align });
                x += w;
            });
            currentY += h;
        };

        // Header da Tabela
        drawRow(["Item", "Descrição", "Qtd", "Valor Unit.", "Valor Total"], true);

        // Itens
        let total = 0;
        if (dados.itens && dados.itens.length > 0) {
            dados.itens.forEach((it, idx) => {
                const lineTotal = it.qtd * it.valorUnit;
                total += lineTotal;
                drawRow([
                    idx + 1, 
                    it.descricao.toUpperCase(), 
                    it.qtd, 
                    formatMoedaSimples(it.valorUnit), 
                    formatMoedaSimples(lineTotal)
                ]);
            });
        }

        // Rodapé Total
        doc.setFontSize(10).setFont("helvetica", "bold");
        const baseW = colW.item + colW.desc + colW.qtd;
        doc.rect(margin, currentY, baseW, 10, 'S');
        doc.text("TOTAL", margin + (baseW / 2), currentY + 6.5, { align: "center" });
        
        doc.rect(margin + baseW, currentY, colW.unit + colW.total, 10, 'S');
        doc.text(formatMoeda(total), margin + safeWidth - 5, currentY + 6.5, { align: "right" });

        doc.save(`Planilha-Pecas-Exercito-${dados.mesRef || 'geral'}.pdf`);

    } catch (error) {
        console.error("Erro ao gerar planilha:", error);
    } finally {
        if (btnElement) {
            btnElement.disabled = false;
            btnElement.innerHTML = '<i class="fas fa-table"></i> Tabela Peças';
        }
    }
}

/**
 * Função Principal: Gera o Relatório Mensal Completo
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
        const pageHeight = doc.internal.pageSize.height;

        const logoDataUrl = await imageToDataUrl('./images/logo.png', 0.6);
        const techSigDataUrl = await imageToDataUrl('./images/assinatura-tecnico.png', 0.6);
        const assets = { logoDataUrl, techSigDataUrl };

        // 1. Capa e Tabelas
        await desenharCapaERelatorio(doc, logoDataUrl, dados);

        // 2. Separador ANEXO I
        doc.addPage();
        drawStandardHeader(doc, logoDataUrl, pageWidth, 20);
        doc.setFont("helvetica", "bold").setFontSize(24);
        doc.text("ANEXO I", pageWidth / 2, pageHeight / 2, { align: "center" });

        // 3. Páginas de OS
        if (dados.ossImprimir && dados.ossImprimir.length > 0) {
            for (const os of dados.ossImprimir) {
                doc.addPage();
                await addOrderPageToPdf(doc, os, assets);
            }
        }

        doc.save(`Relatorio-Completo-Exercito-${dados.mesRef || 'geral'}.pdf`);

    } catch (error) {
        console.error("Erro ao gerar PDF completo:", error);
    } finally {
        if (btnElement) {
            btnElement.disabled = false;
            btnElement.innerHTML = '<i class="fas fa-file-contract"></i> Gerar Relatório';
        }
    }
}

async function desenharCapaERelatorio(doc, logoDataUrl, dados) {
    const pageWidth = doc.internal.pageSize.width;
    const margin = 20;
    const safeWidth = pageWidth - (margin * 2);
    const indent = 12;

    let y = drawStandardHeader(doc, logoDataUrl, pageWidth, margin);

    doc.setFont("helvetica", "bold").setFontSize(16);
    doc.text("RELATÓRIO MENSAL", pageWidth / 2, y, { align: "center" });
    y += 12;

    const addLine = (l, v) => {
        doc.setFont("helvetica", "bold");
        doc.text(l, margin, y);
        doc.setFont("helvetica", "normal");
        doc.text(v, margin + 35, y);
        y += 6;
    };

    addLine("Contrato:", "Termo de Contrato Nº. 10/2025");
    addLine("Cliente:", "9º Batalhão de Infantaria Motorizado");
    addLine("Período:", dados.periodoTexto || formatMesExtenso(dados.mesRef, dados.anoRef));
    y += 5;

    // 1. Objeto
    y = drawSectionHeader(doc, "1. Objeto", margin, y);
    y = drawJustifiedText(doc, dados.textoObjeto || "Prestação de serviços de manutenção preventiva e corretiva.", margin, y, safeWidth, indent);
    y += 10;

    // 2. Atividades Realizadas
    y = drawSectionHeader(doc, "2. Atividades Realizadas", margin, y);
    y = drawJustifiedText(doc, dados.textoAtividades || "As atividades foram realizadas conforme cronograma.", margin, y, safeWidth, indent);
    y += 10;

    // 3. Peças e Controle
    y = drawSectionHeader(doc, "3. Aquisição de Peças e Controle de Gastos", margin, y);
    doc.setFont("helvetica", "normal");
    doc.text("Na tabela abaixo, apresentam-se as peças adquiridas e seus respectivos valores para fins de referência.", margin + indent, y);
    y += 8;

    const pHeaders = ["Descrição", "Qtd", "Valor Unit.", "Valor Total"];
    const pRows = (dados.itens || []).map(it => [it.descricao, it.qtd, formatMoeda(it.valorUnit), formatMoeda(it.qtd * it.valorUnit)]);
    y = drawSimpleTable(doc, pHeaders, pRows, margin, y, safeWidth, true);
    
    y += 8;
    const txtC = "Considerando que o Contrato N°10/2025 prevê o limite anual de R$ 30.000,00 destinado à aquisição de peças, apresenta-se a seguir a tabela de controle mensal de despesas.";
    y = drawJustifiedText(doc, txtC, margin, y, safeWidth, indent);
    y += 8;

    const cHeaders = ["Mês de Referência", "Valor Gasto (Mensal)", "Valor Sobrando (Mensal)"];
    const cRows = (dados.historicoControle || []).map(h => [h.mesAno, formatMoeda(h.gasto), formatMoeda(h.sobrando)]);
    y = drawSimpleTable(doc, cHeaders, cRows, margin, y, safeWidth, true);

    y += 10;
    y = drawSectionHeader(doc, "4. Faturamento", margin, y);
    const totalP = (dados.itens || []).reduce((acc, it) => acc + (it.qtd * it.valorUnit), 0);
    const fRows = [
        ["1", "Serviço Mensal Manutenção Odontoclínica - PMGuPel", formatMoeda(VALOR_SERVICO_FIXO)],
        ["2", "Fornecimento de peças (Total do Mês)", formatMoeda(totalP)],
        ["", "TOTAL DO FATURAMENTO", formatMoeda(VALOR_SERVICO_FIXO + totalP)]
    ];
    y = drawSimpleTable(doc, ["Item", "Descrição", "Valor Executado"], fRows, margin, y, safeWidth, true);
}

// --- HELPERS INTERNOS ---

function drawSectionHeader(doc, txt, x, y) {
    doc.setDrawColor(0);
    doc.setLineWidth(0.5);
    doc.line(x, y - 5, x, y + 2);
    doc.setFont("helvetica", "bold").setFontSize(12);
    doc.text(txt, x + 4, y);
    return y + 8;
}

function drawJustifiedText(doc, text, x, y, width, indent) {
    doc.setFont("helvetica", "normal").setFontSize(10);
    const lines = doc.splitTextToSize(text, width - indent);
    doc.text(lines[0], x + indent, y, { align: "justify", maxWidth: width - indent });
    y += 5;
    if (lines.length > 1) {
        const remaining = text.substring(text.indexOf(lines[1] || "") + (lines[1] ? lines[1].length : 0));
        if (remaining) {
            const restLines = doc.splitTextToSize(remaining, width);
            doc.text(restLines, x, y, { align: "justify", maxWidth: width });
            y += (restLines.length * 5);
        }
    }
    return y;
}

function drawSimpleTable(doc, headers, rows, x, y, width, highlightLast = false) {
    const colW = width / headers.length;
    const h = 7;
    doc.setFontSize(9);

    doc.setFillColor(240, 240, 240);
    doc.setFont("helvetica", "bold");
    headers.forEach((txt, i) => {
        doc.rect(x + (i * colW), y, colW, h, 'FD');
        doc.text(txt, x + (i * colW) + (colW / 2), y + 5, { align: "center" });
    });
    y += h;

    doc.setFont("helvetica", "normal");
    rows.forEach((row, rIdx) => {
        const isLast = highlightLast && rIdx === rows.length - 1;
        if (isLast) {
            doc.setFillColor(189, 213, 237);
            doc.setFont("helvetica", "bold");
        }
        row.forEach((txt, i) => {
            doc.rect(x + (i * colW), y, colW, h, isLast ? 'FD' : 'S');
            doc.text(String(txt), x + (i * colW) + (colW / 2), y + 5, { align: "center" });
        });
        y += h;
    });
    return y;
}

function formatMoeda(v) { return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }
function formatMoedaSimples(v) { 
    return "R$ " + v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); 
}