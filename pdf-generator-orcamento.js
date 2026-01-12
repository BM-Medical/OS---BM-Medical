/**
 * pdf-generator-orcamento.js
 * Módulo para a criação de PDFs de Orçamentos.
 */

// --- Funções Utilitárias ---
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

function formatDate(dateString) {
    if (!dateString) return 'N/A';
    const [year, month, day] = dateString.split('-');
    return `${day}/${month}/${year}`;
}

function parseCurrency(value) {
    if (typeof value !== 'string') return 0;
    const number = parseFloat(value.replace(/\./g, '').replace(',', '.').replace('R$', '').trim());
    return isNaN(number) ? 0 : number;
}

function formatCurrency(value) {
    if (isNaN(value)) value = 0;
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

// --- Função Principal de Geração de PDF ---
export async function generateQuotePdf(quoteData, buttonElement) {
    if (buttonElement) {
        buttonElement.disabled = true;
        buttonElement.textContent = 'A gerar...';
    }

    try {
        if (!quoteData) throw new Error('Dados do orçamento não fornecidos.');
        
        const { jsPDF } = window.jspdf;
        const docPDF = new jsPDF();
        const logoDataUrl = await imageToDataUrl('./images/logo.png', 0.9);

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
        docPDF.text('Fone: (51) 99377-5933 | central.bmmedical@outlook.com', pageWidth - margin, yPosition + 17, { align: 'right' });
        yPosition += 38;

        // --- Título ---
        docPDF.setFontSize(18).setFont(undefined, 'bold');
        docPDF.text(`Orçamento Nº ${quoteData.numero}`, pageWidth / 2, yPosition, { align: 'center' });
        yPosition += 10;
        docPDF.setFontSize(10).setFont(undefined, 'normal');
        docPDF.text(`Data: ${formatDate(quoteData.data)} | Validade: ${quoteData.validade} dias`, pageWidth / 2, yPosition, { align: 'center' });
        yPosition += 15;
        
        // --- Dados do Cliente ---
        docPDF.setFontSize(12).setFont(undefined, 'bold').text('Cliente', margin, yPosition);
        yPosition += 6;
        docPDF.setFontSize(10).setFont(undefined, 'normal');
        docPDF.text(`Nome: ${quoteData.cliente.nome || 'N/A'}`, margin, yPosition);
        docPDF.text(`Contato: ${quoteData.cliente.contato || 'N/A'}`, margin + 90, yPosition);
        yPosition += 5;
        docPDF.text(`CNPJ/CPF: ${quoteData.cliente.cnpj_cpf || 'N/A'}`, margin, yPosition);
        docPDF.text(`Email: ${quoteData.cliente.email || 'N/A'}`, margin + 90, yPosition);
        yPosition += 10;

        // --- Dados do Equipamento ---
        if (!quoteData.equipamentoOculto) {
            docPDF.setFontSize(12).setFont(undefined, 'bold').text('Equipamento', margin, yPosition);
            yPosition += 6;
            docPDF.setFontSize(10).setFont(undefined, 'normal');
            docPDF.text(`Descrição: ${quoteData.equipamento.nome || 'N/A'}`, margin, yPosition);
            docPDF.text(`Marca: ${quoteData.equipamento.marca || 'N/A'}`, margin + 90, yPosition);
            yPosition += 5;
            docPDF.text(`Modelo: ${quoteData.equipamento.modelo || 'N/A'}`, margin, yPosition);
            docPDF.text(`Nº de Série: ${quoteData.equipamento.serial || 'N/A'}`, margin + 90, yPosition);
            yPosition += 10;
        }

        // --- Itens do Orçamento (Peças e Serviços) ---
        const tableBody = [];
        let totalItems = 0;

        if (quoteData.pecas && quoteData.pecas.length > 0) {
            quoteData.pecas.forEach(p => {
                const valorUnitario = parseCurrency(p.valorUnit); // CORRIGIDO: de p.valor para p.valorUnit
                totalItems += (p.qtd || 1) * valorUnitario;
                tableBody.push([
                    p.qtd,
                    p.descricao,
                    formatCurrency(valorUnitario)
                ]);
            });
        }
        
        if (quoteData.servicos && quoteData.servicos.length > 0) {
            if (quoteData.pecas && quoteData.pecas.length > 0) { // Adiciona um espaçador apenas se houver peças
                 tableBody.push([{ content: 'SERVIÇOS', colSpan: 3, styles: { fillColor: [230, 230, 230], textColor: [20, 20, 20], fontStyle: 'bold' } }]);
            }
             quoteData.servicos.forEach(s => {
                const valorServico = parseCurrency(s.valor);
                totalItems += valorServico;
                tableBody.push([
                    '', // Coluna Qtd vazia
                    s.descricao,
                    formatCurrency(valorServico)
                ]);
            });
        }

        docPDF.autoTable({
            startY: yPosition,
            head: [['Qtd.', 'Descrição', 'Valor']],
            body: tableBody,
            theme: 'grid',
            headStyles: { fillColor: [38, 85, 129] },
            columnStyles: {
                0: { halign: 'center', cellWidth: 15 },
                2: { halign: 'right', cellWidth: 35 },
            }
        });

        yPosition = docPDF.autoTable.previous.finalY + 10;

        // --- Totais ---
        const freteValor = parseCurrency(quoteData.frete.valor); // CORRIGIDO: de quoteData.frete para quoteData.frete.valor
        const valorTotal = parseCurrency(quoteData.valorTotal);

        docPDF.setFontSize(10);
        docPDF.text('Subtotal:', pageWidth - margin - 50, yPosition);
        docPDF.text(formatCurrency(totalItems), pageWidth - margin, yPosition, { align: 'right' });
        yPosition += 6;

        docPDF.text('Frete:', pageWidth - margin - 50, yPosition);
        docPDF.text(formatCurrency(freteValor), pageWidth - margin, yPosition, { align: 'right' });
        yPosition += 8;

        docPDF.setFontSize(12).setFont(undefined, 'bold');
        docPDF.text('Valor Total:', pageWidth - margin - 50, yPosition);
        docPDF.text(formatCurrency(valorTotal), pageWidth - margin, yPosition, { align: 'right' });
        
        docPDF.save(`Orcamento-${quoteData.numero.replace('/', '-')}.pdf`);

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

