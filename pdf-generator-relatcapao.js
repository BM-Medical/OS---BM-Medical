/**
 * pdf-generator-relatcapao.js
 * Módulo especializado na geração do Relatório Mensal completo para o Contrato 138/2024 (Capão do Leão).
 */

import { addOrderPageToPdf, imageToDataUrl } from './pdf-generator.js';

// LISTA FIXA DE LOCALIDADES (ORDEM SOLICITADA)
const LOCAIS_TABELA_FIXA = [
    "SECRETARIA DE SAÚDE",
    "PRONTO ATENDIMENTO",
    "UBS PARQUE FRAGATA",
    "UBS JARDIM AMÉRICA II",
    "UBS JARDIM AMÉRICA III",
    "UBS CASABOM",
    "UBS CENTRAL",
    "UBS CAMPUS UFPEL",
    "CAPS"
];

/**
 * Função Principal: Gera o PDF completo.
 */
export async function gerarRelatorioPDFCompleto(dados, btnElement) {
    if (btnElement) {
        btnElement.disabled = true;
        btnElement.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Gerando PDF...';
    }

    try {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        
        // --- 1. PREPARAÇÃO DE ASSETS ---
        const logoDataUrl = await imageToDataUrl('./images/logo.png', 0.9);
        const techSigDataUrl = await imageToDataUrl('./images/assinatura-tecnico.png', 0.7);
        const assets = { logoDataUrl, techSigDataUrl };

        // --- 2. PÁGINA 1: CAPA ---
        await desenharCapaPDF(doc, logoDataUrl, dados);

        // --- 3. PÁGINA 2: ANEXO I (Separador) ---
        doc.addPage();
        await desenharPaginaAnexo(doc, logoDataUrl);

        // --- 4. PÁGINAS DAS OSs ---
        if (!dados.ossImprimir || dados.ossImprimir.length === 0) {
            console.warn("Nenhuma OS selecionada para impressão.");
        } else {
            for (const os of dados.ossImprimir) {
                doc.addPage(); // Nova página para cada OS
                await addOrderPageToPdf(doc, os, assets);
            }
        }

        // --- 5. SALVAR ARQUIVO ---
        doc.save(`Relatorio-Capao-${dados.mesRef || 'MES'}.pdf`);

    } catch (error) {
        console.error("Erro ao gerar PDF completo:", error);
        alert("Erro ao gerar PDF. Verifique o console.");
    } finally {
        if (btnElement) {
            btnElement.disabled = false;
            btnElement.innerHTML = '<i class="fas fa-print"></i> Imprimir PDF';
        }
    }
}

/**
 * Helper para desenhar o logo/cabeçalho padrão no topo da página
 */
function desenharCabecalhoPadrao(doc, logoDataUrl, pageWidth) {
    const logoWidth = 70;
    const y = 5; 
    doc.addImage(logoDataUrl, 'PNG', (pageWidth - logoWidth) / 2, y, logoWidth, 0);
    return y + 30;
}

/**
 * Desenha a capa do relatório
 */
async function desenharCapaPDF(doc, logoDataUrl, dados) {
    const pageWidth = doc.internal.pageSize.width; // 210mm (A4)
    const margin = 20; 
    const indent = 12; // Valor do recuo da primeira linha (parágrafo)
    
    // Desenha cabeçalho padrão
    let y = desenharCabecalhoPadrao(doc, logoDataUrl, pageWidth);

    y += 10; 

    // Título
    doc.setFont("helvetica", "bold"); 
    doc.setFontSize(16); 
    doc.text("RELATÓRIO MENSAL", pageWidth / 2, y, { align: "center" });
    y += 10;

    // --- Dados Contrato ---
    doc.setFontSize(11);
    
    const addDataLine = (label, value) => {
        doc.setFont("helvetica", "bold");
        doc.text(label, margin, y);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(0, 0, 0); 
        doc.text(value, margin + 25, y);
        y += 5;
    };

    addDataLine("Contrato:", "Termo de Contrato Nº. 138/2024");
    addDataLine("Cliente:", "Município de Capão do Leão");
    addDataLine("Período:", dados.periodoTexto || "Período não definido");
    
    y += 8;

    const safeWidth = pageWidth - (margin * 2);

    // --- 1. Objeto ---
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("1. Objeto", margin, y);
    y += 8;

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    
    const textoObjeto = dados.textoObjeto || "";
    // Lógica para Indentação do Objeto
    const splitObjetoFirst = doc.splitTextToSize(textoObjeto, safeWidth - indent);
    const line1Objeto = splitObjetoFirst[0];
    doc.text(line1Objeto, margin + indent, y, { align: "justify", maxWidth: safeWidth - indent });
    
    const restObjeto = textoObjeto.substring(line1Objeto.length).trim();
    if (restObjeto) {
        y += 5;
        const splitObjetoRest = doc.splitTextToSize(restObjeto, safeWidth);
        doc.text(splitObjetoRest, margin, y, { align: "justify", maxWidth: safeWidth });
        y += (splitObjetoRest.length * 5);
    } else {
        y += 5;
    }
    y += 5;

    // Localidades com Bullets
    const textoLocais = dados.textoLocais || "";
    const locaisLista = textoLocais.split('\n'); 
    
    locaisLista.forEach(local => {
        let localTrim = local.trim().replace(/^[•\-\*]\s*/, ''); 
        if (localTrim) {
            doc.text(`• ${localTrim}`, margin + 5, y); 
            y += 5; 
        }
    });
    
    y += 8; 

    // --- 2. Atividades Realizadas ---
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("2. Atividades Realizadas", margin, y);
    y += 8;

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    const introAtividades = "Durante o período de referência, houve a continuidade da execução do contrato, com a realização de serviços de manutenção preventiva e corretiva, conforme descrito a seguir.";
    
    // Lógica para Indentação das Atividades
    const splitIntroFirst = doc.splitTextToSize(introAtividades, safeWidth - indent);
    const line1Intro = splitIntroFirst[0];
    doc.text(line1Intro, margin + indent, y, { align: "justify", maxWidth: safeWidth - indent });
    
    const restIntro = introAtividades.substring(line1Intro.length).trim();
    if (restIntro) {
        y += 5;
        const splitIntroRest = doc.splitTextToSize(restIntro, safeWidth);
        doc.text(splitIntroRest, margin, y, { align: "justify", maxWidth: safeWidth });
        y += (splitIntroRest.length * 5);
    } else {
        y += 5;
    }
    y += 10;

    // --- Tabela Resumo ---
    const stats = processarEstatisticasInterno(dados.ossImprimir, dados.ossPendentes);
    
    const colWidth = safeWidth / 3; 
    const col1 = margin;
    const col2 = margin + colWidth;
    const col3 = margin + (colWidth * 2);
    
    const headerHeight = 8; 
    const rowHeight = 6;    

    // Header da Tabela com Contornos Pretos e Fundo Azul
    doc.setFillColor(37, 99, 235); // Azul 600
    doc.setDrawColor(0, 0, 0);     // Preto para as bordas
    
    // Desenha cada célula do cabeçalho individualmente para garantir as bordas
    doc.rect(col1, y, colWidth, headerHeight, 'FD');
    doc.rect(col2, y, colWidth, headerHeight, 'FD');
    doc.rect(col3, y, colWidth, headerHeight, 'FD');

    doc.setTextColor(255, 255, 255); // Branco para o texto
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    
    const centerOffset = colWidth / 2;
    doc.text("UNIDADE", col1 + centerOffset, y + 5.5, { align: "center" });
    doc.text("SERVIÇOS REALIZADOS", col2 + centerOffset, y + 5.5, { align: "center" });
    doc.text("AGUARDANDO PEÇAS", col3 + centerOffset, y + 5.5, { align: "center" });
    
    y += headerHeight;
    doc.setTextColor(0, 0, 0); // Volta para preto
    doc.setFont("helvetica", "normal");

    LOCAIS_TABELA_FIXA.forEach(localNome => {
        const d = stats[localNome] || { realizados: 0, pendentes: 0 };
        
        doc.rect(col1, y, colWidth, rowHeight);
        doc.rect(col2, y, colWidth, rowHeight);
        doc.rect(col3, y, colWidth, rowHeight);

        const textY = y + 4.5;

        doc.setFontSize(8); 
        doc.text(localNome, col1 + 2, textY); 
        
        doc.setFontSize(9);
        doc.setFont("helvetica", "bold");
        doc.text(d.realizados.toString(), col2 + centerOffset, textY, { align: "center" });
        doc.text(d.pendentes.toString(), col3 + centerOffset, textY, { align: "center" });
        doc.setFont("helvetica", "normal");
        
        y += rowHeight;
    });

    // Texto abaixo da tabela com Indentação
    y += 10;
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    
    const footerText = "As descrições detalhadas dos serviços executados se encontram nos documentos OS - Manutenção Corretiva e OS - Manutenção Preventiva (Anexo I).";
    const splitFooterFirst = doc.splitTextToSize(footerText, safeWidth - indent);
    const line1Footer = splitFooterFirst[0];
    doc.text(line1Footer, margin + indent, y, { align: "justify", maxWidth: safeWidth - indent });
    
    const restFooter = footerText.substring(line1Footer.length).trim();
    if (restFooter) {
        y += 5;
        const splitFooterRest = doc.splitTextToSize(restFooter, safeWidth);
        doc.text(splitFooterRest, margin, y, { align: "justify", maxWidth: safeWidth });
    }
}

/**
 * Desenha a página de separação do Anexo.
 */
async function desenharPaginaAnexo(doc, logoDataUrl) {
    const pageWidth = doc.internal.pageSize.width;
    const pageHeight = doc.internal.pageSize.height;
    
    desenharCabecalhoPadrao(doc, logoDataUrl, pageWidth);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(16); // Ajustado de 40 para 16
    doc.text("ANEXO I", pageWidth / 2, pageHeight / 2, { align: "center", baseline: "middle" });
}

/**
 * Processa estatísticas mapeando nomes do banco para nomes oficiais da tabela.
 */
function processarEstatisticasInterno(realizadas, pendentes) {
    const stats = {};
    
    const normalizarParaOficial = (str) => {
        if(!str) return "OUTROS";
        const s = str.toUpperCase().trim();
        
        if (s.includes("SECRETARIA")) return "SECRETARIA DE SAÚDE";
        if (s.includes("PRONTO") || s === "PA") return "PRONTO ATENDIMENTO";
        if (s.includes("FRAGATA")) return "UBS PARQUE FRAGATA";
        
        if (s.includes("AMÉRICA III") || s.includes("AMERICA III") || (s.includes("AMÉRICA") && s.includes("III"))) return "UBS JARDIM AMÉRICA III";
        if (s.includes("AMÉRICA II") || s.includes("AMERICA II") || (s.includes("AMÉRICA") && s.includes("II"))) return "UBS JARDIM AMÉRICA II";
        
        if (s.includes("CASABOM") || s.includes("CASA BOM")) return "UBS CASABOM";
        if (s.includes("CENTRAL")) return "UBS CENTRAL";
        if (s.includes("UFPEL")) return "UBS CAMPUS UFPEL";
        if (s.includes("CAPS")) return "CAPS";
        
        return "OUTROS"; 
    };

    const registrar = (lista, tipo) => {
        if (!lista) return;
        lista.forEach(os => {
            const nomeOficial = normalizarParaOficial(os.local_atendimento);
            if (!stats[nomeOficial]) stats[nomeOficial] = { realizados: 0, pendentes: 0 };
            stats[nomeOficial][tipo]++;
        });
    };

    registrar(realizadas, 'realizados');
    registrar(pendentes, 'pendentes');
    return stats;
}