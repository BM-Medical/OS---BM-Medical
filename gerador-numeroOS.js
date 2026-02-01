/**
 * gerador-numeroOS.js
 * Módulo responsável pela geração sequencial e transacional de números de Ordem de Serviço.
 * Implementa reset automático de sequencial a cada virada de ano.
 * Compatível com Firebase v11.6.1
 */

import { 
    doc, 
    runTransaction, 
    collection, 
    getDoc 
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// Log de inicialização
console.log("Módulo gerador-numeroOS.js carregado. Pronto para gestão de sequenciais anuais.");

/**
 * Helper para remover campos 'undefined' antes de salvar no Firestore.
 */
const cleanUndefined = (obj) => {
    if (obj === null || typeof obj !== 'object') return obj;
    if (obj instanceof Date) return obj;
    if (Array.isArray(obj)) return obj.map(v => cleanUndefined(v)).filter(v => v !== undefined);

    return Object.entries(obj).reduce((acc, [key, value]) => {
        const cleaned = cleanUndefined(value);
        if (cleaned !== undefined) acc[key] = cleaned;
        return acc;
    }, {});
};

/**
 * Gera a referência do contador baseada no ano atual.
 * Isso garante o reset automático pois cada ano terá seu próprio documento de controle.
 */
const getYearlyCounterRef = (db, counterId, currentYear) => {
    // Exemplo de path: /counters/138-2024_2025
    return doc(db, 'counters', `${counterId}_${currentYear}`);
};

/**
 * Preve qual será o próximo número (apenas para exibição na UI).
 */
export async function preverProximaOS(db, counterId, osPrefix) {
    if (!db || !counterId) return "Aguardando...";

    try {
        const currentYear = new Date().getFullYear();
        const counterRef = getYearlyCounterRef(db, counterId, currentYear);
        const counterDoc = await getDoc(counterRef);
        
        let currentSequence = 0;
        if (counterDoc.exists()) {
            currentSequence = counterDoc.data().sequence || 0;
        }
        
        const nextSequence = currentSequence + 1;

        const cleanPrefix = String(osPrefix || 'OS').replace('.', '/'); 
        return `${cleanPrefix}-${currentYear}${String(nextSequence).padStart(3, '0')}`;

    } catch (error) {
        console.error("Erro ao prever OS:", error);
        return "Erro ao calcular";
    }
}

/**
 * Gera e salva uma nova OS garantindo a unicidade via transação.
 */
export async function gerarESalvarOS(db, counterId, osPrefix, osData) {
    if (!db || !counterId) throw new Error("Parâmetros insuficientes.");
    
    const currentYear = new Date().getFullYear();
    const counterRef = getYearlyCounterRef(db, counterId, currentYear);
    
    try {
        const result = await runTransaction(db, async (transaction) => {
            const counterDoc = await transaction.get(counterRef);
            
            let currentSequence = 0;
            if (counterDoc.exists()) {
                currentSequence = counterDoc.data().sequence || 0;
            }

            const nextSequence = currentSequence + 1;

            const cleanPrefix = String(osPrefix || 'OS').replace('.', '/'); 
            const formattedNum = `${cleanPrefix}-${currentYear}${String(nextSequence).padStart(3, '0')}`;

            // Cria nova referência de documento na coleção de ordens
            const newOsRef = doc(collection(db, 'ordens_servico'));
            
            const finalOsData = cleanUndefined({
                ...osData,
                os_numero: formattedNum,
                numero_os: formattedNum,
                created_at: new Date(),
                created_at_year: currentYear,
                sequence_ref: nextSequence // Guardamos a sequência para auditoria
            });

            // Atualiza o contador do ano vigente
            transaction.set(counterRef, { 
                sequence: nextSequence, 
                year: currentYear,
                last_updated: new Date()
            }, { merge: true });

            // Salva a OS
            transaction.set(newOsRef, finalOsData);

            return formattedNum;
        });

        return { success: true, numero: result };

    } catch (error) {
        console.error("Erro na transação de geração de OS:", error);
        throw error;
    }
}

/**
 * Gera múltiplas OSs em sequência para processamento em lote.
 */
export async function gerarESalvarLoteOS(db, counterId, osPrefix, baseOsData, batchItems) {
    if (!db || !counterId || !batchItems.length) throw new Error("Dados de lote inválidos.");

    const currentYear = new Date().getFullYear();
    const counterRef = getYearlyCounterRef(db, counterId, currentYear);

    try {
        const count = await runTransaction(db, async (transaction) => {
            const counterDoc = await transaction.get(counterRef);
            
            let currentSequence = 0;
            if (counterDoc.exists()) {
                currentSequence = counterDoc.data().sequence || 0;
            }
            
            const cleanPrefix = String(osPrefix || 'OS').replace('.', '/');

            for (const item of batchItems) {
                currentSequence++;
                const formattedNum = `${cleanPrefix}-${currentYear}${String(currentSequence).padStart(3, '0')}`;
                const newOsRef = doc(collection(db, 'ordens_servico'));
                
                const specificData = cleanUndefined({
                    ...baseOsData,
                    ...item,
                    os_numero: formattedNum,
                    numero_os: formattedNum,
                    created_at: new Date(),
                    created_at_year: currentYear
                });

                transaction.set(newOsRef, specificData);
            }

            // Atualiza o contador com o último número do lote
            transaction.set(counterRef, { 
                sequence: currentSequence, 
                year: currentYear,
                last_updated: new Date()
            }, { merge: true });
            
            return batchItems.length;
        });

        return { success: true, count: count };

    } catch (error) {
        console.error("Erro na transação de lote:", error);
        throw error;
    }
}

export default {
    preverProximaOS,
    gerarESalvarOS,
    gerarESalvarLoteOS
};