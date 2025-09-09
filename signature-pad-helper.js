/**
 * signature-pad-helper.js
 * Módulo para gerenciar a funcionalidade de captura de assinatura digital em um modal.
 * Exporta a classe SignaturePadManager.
 */

export class SignaturePadManager {
    /**
     * @param {object} elements - Um objeto contendo os elementos do DOM necessários.
     * @param {HTMLElement} elements.modal - O elemento overlay do modal de assinatura.
     * @param {HTMLCanvasElement} elements.canvas - O elemento canvas para desenhar.
     * @param {HTMLElement} elements.saveButton - O botão para salvar a assinatura.
     * @param {HTMLElement} elements.clearButton - O botão para limpar a assinatura.
     * @param {HTMLElement} elements.undoButton - O botão para desfazer o último traço.
     * @param {HTMLElement} elements.cancelButton - O botão para cancelar e fechar o modal.
     * @param {HTMLElement} elements.errorMessage - O elemento para exibir mensagens de erro.
     */
    constructor(elements) {
        this.elements = elements;
        this.ctx = this.elements.canvas.getContext('2d');
        this.drawing = false;
        this.isSignatureDrawn = false;
        this.signatureHistory = [];
        this.onSaveCallback = null;

        this.attachEventListeners();
    }

    /**
     * Anexa todos os event listeners necessários para o funcionamento do pad.
     */
    attachEventListeners() {
        const canvas = this.elements.canvas;

        // Eventos de mouse
        canvas.addEventListener('mousedown', this.startDrawing.bind(this));
        canvas.addEventListener('mouseup', this.stopDrawing.bind(this));
        canvas.addEventListener('mousemove', this.draw.bind(this));
        canvas.addEventListener('mouseleave', this.stopDrawing.bind(this));

        // Eventos de toque
        canvas.addEventListener('touchstart', this.startDrawing.bind(this), { passive: false });
        canvas.addEventListener('touchend', this.stopDrawing.bind(this), { passive: false });
        canvas.addEventListener('touchmove', this.draw.bind(this), { passive: false });

        // Eventos dos botões
        this.elements.saveButton.addEventListener('click', this.saveSignature.bind(this));
        this.elements.clearButton.addEventListener('click', this.clearCanvas.bind(this));
        this.elements.undoButton.addEventListener('click', this.undoLastStroke.bind(this));
        this.elements.cancelButton.addEventListener('click', this.close.bind(this));
    }

    /**
     * Abre o modal de assinatura e prepara o canvas.
     * @param {function} onSave - A função de callback a ser executada quando a assinatura for salva. Recebe a dataURL da imagem como argumento.
     */
    async open(onSave) {
        this.onSaveCallback = onSave;
        this.clearCanvas();
        this.isSignatureDrawn = false;
        this.elements.errorMessage.style.display = 'none';
        
        const isMobile = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
        
        try {
            if (isMobile && typeof screen.orientation?.lock === 'function') {
                await document.documentElement.requestFullscreen();
                await screen.orientation.lock('landscape-primary');
            }
        } catch (err) {
            console.warn("Não foi possível ativar o modo paisagem/tela cheia.", err);
        } finally {
            this.elements.modal.style.display = 'flex';
            // Adiciona um pequeno delay para garantir que o modal esteja visível antes de redimensionar
            setTimeout(() => {
                this.resizeCanvas();
                this.saveSignatureState(); // Salva o estado inicial (em branco)
            }, 50);
        }
    }

    /**
     * Fecha o modal de assinatura e libera a orientação da tela se necessário.
     */
    async close() {
        this.elements.modal.style.display = 'none';
        try {
            if (document.fullscreenElement) {
                await screen.orientation.unlock();
                await document.exitFullscreen();
            }
        } catch (err) {
            console.error("Erro ao sair do modo tela cheia/paisagem.", err);
        }
    }
    
    // --- Funções de Desenho ---

    resizeCanvas() {
        const canvas = this.elements.canvas;
        const ratio = Math.max(window.devicePixelRatio || 1, 1);
        canvas.width = canvas.offsetWidth * ratio;
        canvas.height = canvas.offsetHeight * ratio;
        this.ctx.scale(ratio, ratio);
        this.redrawSignatureFromHistory();
    }
    
    getPos(event) {
        const rect = this.elements.canvas.getBoundingClientRect();
        const touch = event.touches ? event.touches[0] : event;
        return { x: touch.clientX - rect.left, y: touch.clientY - rect.top };
    }

    startDrawing(e) {
        e.preventDefault();
        this.drawing = true;
        this.elements.errorMessage.style.display = 'none';
        const pos = this.getPos(e);
        this.ctx.beginPath();
        this.ctx.moveTo(pos.x, pos.y);
    }

    stopDrawing(e) {
        e.preventDefault();
        if (!this.drawing) return;
        this.drawing = false;
        this.ctx.beginPath();
        this.saveSignatureState();
    }

    draw(e) {
        e.preventDefault();
        if (!this.drawing) return;
        this.isSignatureDrawn = true;
        const pos = this.getPos(e);
        this.ctx.lineWidth = 3;
        this.ctx.lineCap = 'round';
        this.ctx.strokeStyle = '#000';
        this.ctx.lineTo(pos.x, pos.y);
        this.ctx.stroke();
        this.ctx.beginPath();
        this.ctx.moveTo(pos.x, pos.y);
    }
    
    // --- Funções de Controle ---

    clearCanvas() {
        this.ctx.clearRect(0, 0, this.elements.canvas.width, this.elements.canvas.height);
        this.isSignatureDrawn = false;
        if(this.signatureHistory.length > 0) {
            this.signatureHistory = [this.signatureHistory[0]]; // Mantém apenas o estado inicial em branco
        }
    }
    
    saveSignatureState() {
        const data = this.ctx.getImageData(0, 0, this.elements.canvas.width, this.elements.canvas.height);
        this.signatureHistory.push(data);
    }
    
    undoLastStroke() {
        if (this.signatureHistory.length > 1) {
            this.signatureHistory.pop();
            this.redrawSignatureFromHistory();
        }
    }
    
    redrawSignatureFromHistory() {
        this.ctx.clearRect(0, 0, this.elements.canvas.width, this.elements.canvas.height);
        if (this.signatureHistory.length > 0) {
            this.ctx.putImageData(this.signatureHistory[this.signatureHistory.length - 1], 0, 0);
        }
        this.isSignatureDrawn = this.signatureHistory.length > 1;
    }

    saveSignature() {
        if (!this.isSignatureDrawn) {
            this.elements.errorMessage.style.display = 'block';
            return;
        }

        // Cria um fundo branco para a imagem JPEG
        const originalImageData = this.ctx.getImageData(0, 0, this.elements.canvas.width, this.elements.canvas.height);
        const originalCompositeOperation = this.ctx.globalCompositeOperation;
        this.ctx.globalCompositeOperation = "destination-over";
        this.ctx.fillStyle = '#FFFFFF';
        this.ctx.fillRect(0, 0, this.elements.canvas.width, this.elements.canvas.height);
        
        const dataUrl = this.elements.canvas.toDataURL('image/jpeg', 0.5);

        // Restaura o canvas para o estado original (com transparência)
        this.ctx.clearRect(0, 0, this.elements.canvas.width, this.elements.canvas.height);
        this.ctx.putImageData(originalImageData, 0, 0);
        this.ctx.globalCompositeOperation = originalCompositeOperation;

        if (this.onSaveCallback) {
            this.onSaveCallback(dataUrl);
        }
        
        this.close();
    }
}
