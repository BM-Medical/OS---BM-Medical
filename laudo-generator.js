/**
 * laudo-generator.js
 * Gerador de PDF específico para Certificados de Calibração (Modelo HE-UFPEL).
 * Gera tabelas separadas para "Resultados" e "Aceitação".
 */

const { jsPDF } = window.jspdf;

// --- Configurações Visuais ---
const THEME = {
    COLOR_PRIMARY: '#000000', // Preto padrão técnico
    COLOR_SECONDARY: '#333333',
    FONT_SIZE_TITLE: 14,
    FONT_SIZE_HEADER: 10,
    FONT_SIZE_BODY: 9,
    FONT_SIZE_SMALL: 8
};

// --- Funções Auxiliares ---
function formatDate(dateStr) {
    if (!dateStr) return 'N/A';
    const [y, m, d] = dateStr.split('-');
    return `${d}/${m}/${y}`;
}

async function imageToDataUrl(url) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'Anonymous';
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0);
            resolve(canvas.toDataURL('image/jpeg', 0.8));
        };
        img.onerror = () => resolve(null); // Retorna null se falhar, não trava
        img.src = url;
    });
}

/**
 * Função Principal de Geração
 */
export async function generateCalibrationCertificate(data, buttonEl) {
    if (buttonEl) {
        buttonEl.disabled = true;
        buttonEl.textContent = "Gerando PDF...";
    }

    try {
        const doc = new jsPDF();
        const logoUrl = await imageToDataUrl('./images/logo.png');
        // Imagens de assinatura (fixas ou do objeto data)
        const techSigUrl = await imageToDataUrl('./images/assinatura-tecnico.png'); 
        
        let y = 15;
        const pageHeight = doc.internal.pageSize.height;
        const pageWidth = doc.internal.pageSize.width;
        const margin = 10;

        // --- Cabeçalho Padrão (Repete se precisar adicionar páginas, mas aqui faremos simples) ---
        const drawHeader = () => {
            if (logoUrl) {
                doc.addImage(logoUrl, 'JPEG', margin, 10, 50, 0); // Ajuste tamanho conforme logo real
            }
            doc.setFontSize(16).setFont('helvetica', 'bold');
            doc.text('Certificado de Calibração', pageWidth - margin, 20, { align: 'right' });
            doc.setFontSize(12).setTextColor(100);
            doc.text(`Nº ${data.certificateNumber || 'PROVISÓRIO'}`, pageWidth - margin, 26, { align: 'right' });
            doc.setTextColor(0);
            y = 40;
        };

        drawHeader();

        // --- Função para desenhar linhas de seção ---
        const drawSectionTitle = (number, title) => {
            doc.setFillColor(240, 240, 240);
            doc.rect(margin, y, pageWidth - (margin*2), 6, 'F');
            doc.setFontSize(THEME.FONT_SIZE_HEADER).setFont('helvetica', 'bold');
            doc.text(`${number}- ${title}`, margin + 2, y + 4.5);
            y += 10;
        };

        const checkPageBreak = (spaceNeeded) => {
            if (y + spaceNeeded > pageHeight - 20) {
                doc.addPage();
                y = 20; // Margem topo nova página
            }
        };

        // 1. Dados do Contratante
        drawSectionTitle(1, "Dados do Contratante");
        doc.setFontSize(THEME.FONT_SIZE_BODY).setFont('helvetica', 'normal');
        doc.text(`Cliente: ${data.clientName}`, margin + 2, y);
        doc.text(`Solicitante: ${data.requester || 'N/A'}`, margin + 2, y + 5);
        y += 10;

        // 2. Instrumento Calibrado
        drawSectionTitle(2, "Instrumento/Equipamento Calibrado");
        doc.text(`Tipo: ${data.equipName}`, margin + 2, y);
        doc.text(`Fabricante: ${data.equipBrand}`, margin + 100, y);
        y += 5;
        doc.text(`Modelo: ${data.equipModel}`, margin + 2, y);
        doc.text(`Nº de Série: ${data.equipSerial}`, margin + 100, y);
        y += 5;
        doc.text(`Patrimônio/Tag: ${data.equipTag || 'N/A'}`, margin + 2, y);
        y += 10;

        // 3. Condições Ambientais
        drawSectionTitle(3, "Condições Ambientais");
        doc.text(`Temperatura: ${data.envTemp || '--'} °C`, margin + 2, y);
        doc.text(`Umidade Relativa: ${data.envHum || '--'} %`, margin + 100, y);
        y += 10;

        // 4. Padrões Utilizados
        drawSectionTitle(4, "Padrões Utilizados");
        if (data.standards && data.standards.length > 0) {
            data.standards.forEach(std => {
                checkPageBreak(15);
                doc.setFont('helvetica', 'bold');
                doc.text(std.name || 'Padrão', margin + 2, y);
                doc.setFont('helvetica', 'normal');
                y += 4;
                doc.text(`Certificado: ${std.certNo || '-'}`, margin + 2, y);
                doc.text(`Validade: ${formatDate(std.validity)}`, margin + 60, y);
                doc.text(`Rastreabilidade: ${std.traceability || 'RBC'}`, margin + 120, y);
                y += 6;
            });
        } else {
            doc.text("Nenhum padrão informado.", margin + 2, y);
            y += 6;
        }
        y += 4;

        // 5. Procedimentos (Texto fixo ou dinâmico)
        drawSectionTitle(5, "Procedimentos de Calibração");
        doc.text("• Calibração comparativa direta com padrões rastreáveis.", margin + 2, y);
        y += 10;

        // 6. Informações Complementares
        drawSectionTitle(6, "Informações Complementares");
        const infoText = "• A incerteza expandida de medição relatada é declarada como incerteza padrão multiplicada pelo fator de abrangência k=2 (95%).";
        const splitInfo = doc.splitTextToSize(infoText, pageWidth - (margin*2));
        doc.text(splitInfo, margin + 2, y);
        y += (splitInfo.length * 4) + 6;

        // --- TABELAS (A parte complexa) ---
        
        // 7. Resultados (Tabela 1: Metrologia Pura)
        checkPageBreak(30);
        drawSectionTitle(7, "Resultados");

        data.testGroups.forEach(group => {
            checkPageBreak(40);
            
            // Título do Grupo (Ex: VOLUME TIDAL)
            doc.setFont('helvetica', 'bold').setFontSize(10);
            doc.text(group.name.toUpperCase(), margin, y);
            y += 5;
            
            // Metadados do Grupo
            doc.setFont('helvetica', 'normal').setFontSize(8);
            const metaInfo = `Unidade: ${group.unit} | Resolução: ${group.resolution}`;
            doc.text(metaInfo, margin, y);
            y += 6;

            // Cabeçalho da Tabela 1
            const cols1 = ["Nominal", "Medido (Média)", "Tendência (Erro)", "Incerteza (U)", "k"];
            const xPos = [margin, margin + 35, margin + 75, margin + 115, margin + 150];
            
            doc.setFillColor(230);
            doc.rect(margin, y - 4, pageWidth - (margin*2), 6, 'F');
            doc.setFont('helvetica', 'bold');
            cols1.forEach((col, i) => doc.text(col, xPos[i], y));
            y += 6;

            // Linhas
            doc.setFont('helvetica', 'normal');
            group.points.forEach(point => {
                checkPageBreak(10);
                doc.text(point.nominal.toString(), xPos[0], y);
                doc.text(point.measured.toString(), xPos[1], y);
                doc.text(point.bias.toString(), xPos[2], y);
                doc.text(point.uncertainty.toString(), xPos[3], y);
                doc.text("2.00", xPos[4], y); // k padrão
                y += 5;
                // Linha cinza clara separadora
                doc.setDrawColor(240);
                doc.line(margin, y-3, pageWidth-margin, y-3);
            });
            y += 8; // Espaço entre grupos
        });

        // 8. Aceitação (Tabela 2: Critérios e Aprovação)
        checkPageBreak(30);
        drawSectionTitle(8, "Critérios de Aceitação e Conclusão");

        data.testGroups.forEach(group => {
            checkPageBreak(40);
            
            doc.setFont('helvetica', 'bold').setFontSize(9);
            const errorDesc = group.errorType === 'percent' ? `${group.errorValue}%` : `${group.errorValue} ${group.unit}`;
            doc.text(`Critério para ${group.name}: Erro Máx. ${errorDesc}`, margin, y);
            y += 6;

            // Cabeçalho Tabela 2
            const cols2 = ["Nominal", "Erro Máx. Perm.", "Valor de Teste (|Erro|+U)", "Resultado"];
            const xPos2 = [margin, margin + 40, margin + 80, margin + 140];

            doc.setFillColor(230);
            doc.rect(margin, y - 4, pageWidth - (margin*2), 6, 'F');
            cols2.forEach((col, i) => doc.text(col, xPos2[i], y));
            y += 6;

            doc.setFont('helvetica', 'normal');
            group.points.forEach(point => {
                checkPageBreak(10);
                doc.text(point.nominal.toString(), xPos2[0], y);
                doc.text(point.maxError.toString(), xPos2[1], y);
                doc.text(point.testValue.toString(), xPos2[2], y);
                
                // Resultado em Negrito (Verde/Vermelho se quisesse, mas PDF técnico costuma ser PB)
                doc.setFont('helvetica', 'bold');
                doc.text(point.status.toUpperCase(), xPos2[3], y);
                doc.setFont('helvetica', 'normal');
                
                y += 5;
                doc.setDrawColor(240);
                doc.line(margin, y-3, pageWidth-margin, y-3);
            });
            y += 8;
        });

        // --- Conclusão Final ---
        checkPageBreak(40);
        doc.setDrawColor(0);
        doc.setLineWidth(0.5);
        doc.rect(margin, y, pageWidth - (margin*2), 25);
        
        doc.setFontSize(12).setFont('helvetica', 'bold');
        doc.text(`Resultado Final da Calibração: ${data.finalStatus.toUpperCase()}`, pageWidth/2, y + 8, { align: 'center' });
        
        doc.setFontSize(10).setFont('helvetica', 'normal');
        doc.text(`Data da Calibração: ${formatDate(data.dateExec)}`, margin + 5, y + 18);
        doc.text(`Válido até: ${formatDate(data.dateValid)}`, margin + 100, y + 18);
        y += 40;

        // --- Assinaturas ---
        checkPageBreak(40);
        
        // Assinatura Técnico (Esquerda)
        if (techSigUrl) {
            doc.addImage(techSigUrl, 'JPEG', margin + 10, y, 50, 20);
        }
        doc.line(margin, y + 22, margin + 80, y + 22);
        doc.setFontSize(8);
        doc.text("Técnico Responsável", margin + 10, y + 26);
        doc.text("BM MEDICAL", margin + 10, y + 30);

        // Assinatura Engenheiro (Direita - Placeholder por enquanto)
        const engX = pageWidth - margin - 80;
        doc.line(engX, y + 22, engX + 80, y + 22);
        doc.text("Engenheiro Clínico / CREA", engX + 10, y + 26);
        doc.text("Responsável Técnico", engX + 10, y + 30);

        // Salvar
        doc.save(`Certificado_${data.certificateNumber || 'Novo'}.pdf`);

    } catch (err) {
        console.error("Erro no PDF:", err);
        alert("Erro ao gerar PDF.");
    } finally {
        if (buttonEl) {
            buttonEl.disabled = false;
            buttonEl.textContent = "Gerar PDF (Visualizar)";
        }
    }
}