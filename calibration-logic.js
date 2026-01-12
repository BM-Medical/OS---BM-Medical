/**
 * calibration-logic.js
 * Módulo responsável pela lógica matemática e critérios de aceitação dos laudos.
 * Centraliza as fórmulas para facilitar atualizações futuras (ex: cálculo automático de incerteza).
 */

export const CalibrationCalculator = {
    /**
     * Calcula a Tendência (Erro) de uma medição.
     * Fórmula: Valor Medido - Valor Nominal
     */
    calculateBias(nominal, measured) {
        if (nominal === '' || measured === '') return null;
        const n = parseFloat(nominal);
        const m = parseFloat(measured);
        // Arredonda para 2 casas decimais para evitar erros de ponto flutuante (ex: 0.1 + 0.2)
        return parseFloat((m - n).toFixed(2));
    },

    /**
     * Calcula o Valor de Teste (Critério de Aceitação).
     * Fórmula Atual: |Tendência| + Incerteza Expandida
     */
    calculateTestValue(bias, uncertainty) {
        if (bias === null || uncertainty === '' || uncertainty === null) return null;
        const b = Math.abs(bias);
        const u = parseFloat(uncertainty);
        return parseFloat((b + u).toFixed(2));
    },

    /**
     * Calcula o Erro Máximo Permitido com base na configuração do teste.
     * @param {number} nominal - Valor Nominal do ponto.
     * @param {string} type - 'percent' (%) ou 'absolute' (valor fixo).
     * @param {number} value - O valor da tolerância (ex: 15 para 15% ou 15.0 para 15 mL).
     */
    calculateMaxError(nominal, type, value) {
        if (!value) return null;
        const val = parseFloat(value);
        
        if (type === 'percent') {
            // Ex: 15% de 100 = 15.0
            return parseFloat(((parseFloat(nominal) * val) / 100).toFixed(2));
        } else {
            // Ex: Valor fixo de 15.0
            return val;
        }
    },

    /**
     * Determina se o ponto está Aprovado ou Reprovado.
     * Critério: Valor de Teste <= Erro Máximo Permitido
     */
    evaluateStatus(testValue, maxError) {
        if (testValue === null || maxError === null) return 'Pendente';
        return testValue <= maxError ? 'Aprovado' : 'Reprovado';
    }
};