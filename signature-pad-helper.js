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
     * @param {HTMLElement} [elements.orientationMessage] - (Opcional) Elemento para pedir ao usuário para virar a tela.
     */
    constructor(elements) {
        this.elements = elements;
        this.ctx = this.elements.canvas.getContext('2d');
        this.drawing = false;
        this.isSignatureDrawn = false;
        this.signatureHistory = [];
        this.onSaveCallback = null;
        
        this.boundResizeCanvas = this.resizeCanvas.bind(this);

        this.attachEventListeners();
    }

    /**
     * Anexa todos os event listeners necessários para o funcionamento do pad.
     */
    attachEventListeners() {
        const canvas = this.elements.canvas;
        canvas.addEventListener('mousedown', this.startDrawing.bind(this));
        canvas.addEventListener('mouseup', this.stopDrawing.bind(this));
        canvas.addEventListener('mousemove', this.draw.bind(this));
        canvas.addEventListener('mouseleave', this.stopDrawing.bind(this));
        canvas.addEventListener('touchstart', this.startDrawing.bind(this), { passive: false });
        canvas.addEventListener('touchend', this.stopDrawing.bind(this), { passive: false });
        canvas.addEventListener('touchmove', this.draw.bind(this), { passive: false });
        this.elements.saveButton.addEventListener('click', this.saveSignature.bind(this));
        this.elements.clearButton.addEventListener('click', this.clearCanvas.bind(this));
        this.elements.undoButton.addEventListener('click', this.undoLastStroke.bind(this));
        this.elements.cancelButton.addEventListener('click', this.close.bind(this));
    }

    /**
     * Abre o modal de assinatura e prepara o canvas.
     * @param {function} onSave - A função de callback a ser executada quando a assinatura for salva.
     */
    async open(onSave) {
        this.onSaveCallback = onSave;
        this.clearCanvas();
        this.isSignatureDrawn = false;
        if(this.elements.errorMessage) this.elements.errorMessage.style.display = 'none';
        
        window.addEventListener('resize', this.boundResizeCanvas);

        const isMobile = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
        
        try {
            if (isMobile && typeof screen.orientation?.lock === 'function') {
                await document.documentElement.requestFullscreen();
                await screen.orientation.lock('landscape-primary');
            }
        } catch (err) {
            console.warn("Não foi possível ativar o modo paisagem/tela cheia.", err);
            if (this.elements.orientationMessage) {
                this.elements.orientationMessage.style.display = 'block';
            }
        } finally {
            this.elements.modal.style.display = 'flex';
            setTimeout(() => {
                this.resizeCanvas();
                this.saveSignatureState();
            }, 50);
        }
    }

    /**
     * Fecha o modal de assinatura e libera a orientação da tela se necessário.
     */
    async close() {
        this.elements.modal.style.display = 'none';
        window.removeEventListener('resize', this.boundResizeCanvas);

        if (this.elements.orientationMessage) {
            this.elements.orientationMessage.style.display = 'none';
        }

        try {
            if (document.fullscreenElement) {
                if (screen.orientation && typeof screen.orientation.unlock === 'function') {
                    await screen.orientation.unlock();
                }
                await document.exitFullscreen();
            }
        } catch (err) {
            console.error("Erro ao sair do modo tela cheia/paisagem.", err);
        }
    }
    
    resizeCanvas() {
        const canvas = this.elements.canvas;
        const ratio = Math.max(window.devicePixelRatio || 1, 1);
        canvas.width = canvas.offsetWidth * ratio;
        canvas.height = canvas.offsetHeight * ratio;
        this.ctx.scale(ratio, ratio);
        this.redrawSignatureFromHistory();
    }
    
    getPos(event) {
        const canvas = this.elements.canvas;
        const rect = canvas.getBoundingClientRect();

        // *** INÍCIO DA CORREÇÃO PARA O PROBLEMA DE DESLOCAMENTO ***
        // Em alguns dispositivos móveis (especialmente com telas de alta resolução ou
        // dimensionamento de tela personalizado), getBoundingClientRect().width pode
        // ser ligeiramente diferente de offsetWidth. Isso cria um erro de escala
        // que faz com que o traço se desloque do ponto de toque.
        // O código abaixo calcula um fator de correção para garantir que as
        // coordenadas do toque sejam mapeadas com precisão para o canvas.

        const cssScaleX = canvas.offsetWidth / rect.width;
        const cssScaleY = canvas.offsetHeight / rect.height;

        const touch = event.touches ? event.touches[0] : event;
        
        const x = (touch.clientX - rect.left) * cssScaleX;
        const y = (touch.clientY - rect.top) * cssScaleY;
        // *** FIM DA CORREÇÃO ***

        return { x: x, y: y };
    }

    startDrawing(e) {
        e.preventDefault();
        this.drawing = true;
        if(this.elements.errorMessage) this.elements.errorMessage.style.display = 'none';
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
    
    clearCanvas() {
        this.ctx.clearRect(0, 0, this.elements.canvas.width, this.elements.canvas.height);
        this.isSignatureDrawn = false;
        this.signatureHistory = [];
        this.saveSignatureState();
    }
    
    saveSignatureState() {
        if (this.drawing) return; 
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
        if (!this.ctx) return;
        this.ctx.clearRect(0, 0, this.elements.canvas.width, this.elements.canvas.height);
        if (this.signatureHistory.length > 0) {
            this.ctx.putImageData(this.signatureHistory[this.signatureHistory.length - 1], 0, 0);
        }
        this.isSignatureDrawn = this.signatureHistory.length > 1;
    }

    saveSignature() {
        if (!this.isSignatureDrawn) {
            if(this.elements.errorMessage) this.elements.errorMessage.style.display = 'block';
            return;
        }

        const originalImageData = this.ctx.getImageData(0, 0, this.elements.canvas.width, this.elements.canvas.height);
        const originalCompositeOperation = this.ctx.globalCompositeOperation;
        
        this.ctx.globalCompositeOperation = "destination-over";
        this.ctx.fillStyle = '#FFFFFF';
        this.ctx.fillRect(0, 0, this.elements.canvas.width, this.elements.canvas.height);
        
        const dataUrl = this.elements.canvas.toDataURL('image/jpeg', 0.5);

        this.ctx.clearRect(0, 0, this.elements.canvas.width, this.elements.canvas.height);
        this.ctx.putImageData(originalImageData, 0, 0);
        this.ctx.globalCompositeOperation = originalCompositeOperation;
        
        this.close();

        if (this.onSaveCallback) {
            this.onSaveCallback(dataUrl);
        }
    }
}

