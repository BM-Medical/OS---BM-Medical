/**
 * gerador-numeroOS.js
 * Módulo responsável pela geração sequencial e transacional de números de Ordem de Serviço.
 * Compatível com Firebase v11.6.1
 */

import { 
    doc, 
    runTransaction, 
    collection, 
    getDoc, 
    getDocs, 
    query, 
    where 
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// Log para confirmar que o arquivo carregou
console.log("Módulo gerador-numeroOS.js (v4 - Diagnóstico) carregado com sucesso!");

// Função auxiliar RECURSIVA para remover campos 'undefined' em qualquer nível
const cleanUndefined = (obj) => {
    if (obj === null || typeof obj !== 'object') return obj;
    if (obj instanceof Date) return obj;

    if (Array.isArray(obj)) {
        return obj.map(v => cleanUndefined(v)).filter(v => v !== undefined);
    }

    return Object.entries(obj).reduce((acc, [key, value]) => {
        const cleaned = cleanUndefined(value);
        if (cleaned !== undefined) acc[key] = cleaned;
        return acc;
    }, {});
};

/**
 * Apenas prevê qual será o próximo número de OS (para exibição na UI).
 * Não grava nada no banco.
 * @param {Object} db - Instância do Firestore
 * @param {String} counterId - ID do contador
 * @param {String} osPrefix - Prefixo da OS
 * @returns {Promise<string>} - O próximo número formatado
 */
export async function preverProximaOS(db, counterId, osPrefix) {
    // DIAGNÓSTICO: Se isso não aparecer no console, o erro anterior travou o script antes de chegar aqui.
    console.log("🛠️ CHAMADA INICIADA: preverProximaOS", { 
        temDB: !!db, 
        counterId, 
        osPrefix 
    });

    if (!db) {
        console.error("preverProximaOS: 'db' (Firestore) não foi fornecido.");
        return "Erro: db offline";
    }
    if (!counterId) {
        console.warn("preverProximaOS: 'counterId' não configurado.");
        return "Aguardando config...";
    }

    try {
        const counterRef = doc(db, 'counters', counterId);
        const counterDoc = await getDoc(counterRef);
        
        const currentYear = new Date().getFullYear();
        let data = { sequence: 0, year: 0 };
        
        if (counterDoc.exists()) {
            data = counterDoc.data();
        }

        const storedYear = data.year || 0;
        let nextSequence = 0;

        // Reset anual ou incremento
        if (currentYear > storedYear) {
            nextSequence = 1;
        } else {
            nextSequence = (data.sequence || 0) + 1;
        }

        const safePrefix = String(osPrefix || 'OS');
        const cleanPrefix = safePrefix.replace('.', '/'); 
        
        const result = `${cleanPrefix}-${currentYear}${String(nextSequence).padStart(3, '0')}`;
        console.log("✅ Prévia calculada com sucesso:", result);
        return result;

    } catch (error) {
        console.error("❌ Erro CRÍTICO ao prever OS:", error);
        return "Erro ao calcular";
    }
}

/**
 * Gera o próximo número de OS e salva a transação no banco.
 * @param {Object} db - Instância do Firestore
 * @param {String} counterId - ID do contador
 * @param {String} osPrefix - Prefixo da OS
 * @param {Object} osData - Dados do formulário
 * @returns {Promise<{success: boolean, numero: string}>}
 */
export async function gerarESalvarOS(db, counterId, osPrefix, osData) {
    if (!counterId) throw new Error("ID do contador não fornecido.");
    
    const counterRef = doc(db, 'counters', counterId);
    
    try {
        const result = await runTransaction(db, async (transaction) => {
            const counterDoc = await transaction.get(counterRef);
            const currentYear = new Date().getFullYear();
            
            let data = { sequence: 0, year: 0 };
            if (counterDoc.exists()) {
                data = counterDoc.data();
            }

            const storedYear = data.year || 0;
            let nextSequence = 0;

            if (currentYear > storedYear) {
                nextSequence = 1;
            } else {
                nextSequence = (data.sequence || 0) + 1;
            }

            const safePrefix = String(osPrefix || 'OS');
            const cleanPrefix = safePrefix.replace('.', '/'); 
            
            const formattedNum = `${cleanPrefix}-${currentYear}${String(nextSequence).padStart(3, '0')}`;

            const newOsRef = doc(collection(db, 'ordens_servico'));
            
            const finalOsData = cleanUndefined({
                ...osData,
                os_numero: formattedNum,
                numero_os: formattedNum,
                created_at: new Date(),
                created_at_year: currentYear
            });

            transaction.set(counterRef, { sequence: nextSequence, year: currentYear }, { merge: true });
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
 * Gera MÚLTIPLAS OSs em sequência para itens de lote.
 * @param {Object} db - Instância do Firestore
 * @param {String} counterId - ID do contador
 * @param {String} osPrefix - Prefixo da OS
 * @param {Object} baseOsData - Dados comuns
 * @param {Array} batchItems - Itens específicos
 * @returns {Promise<{success: boolean, count: number}>}
 */
export async function gerarESalvarLoteOS(db, counterId, osPrefix, baseOsData, batchItems) {
    if (!counterId) throw new Error("ID do contador não fornecido para lote.");

    const counterRef = doc(db, 'counters', counterId);

    try {
        const count = await runTransaction(db, async (transaction) => {
            const counterDoc = await transaction.get(counterRef);
            const currentYear = new Date().getFullYear();
            
            let data = { sequence: 0, year: 0 };
            if (counterDoc.exists()) {
                data = counterDoc.data();
            }

            const storedYear = data.year || 0;
            let currentSequence = 0;

            if (currentYear > storedYear) {
                currentSequence = 0;
            } else {
                currentSequence = data.sequence || 0;
            }
            
            const safePrefix = String(osPrefix || 'OS');
            const cleanPrefix = safePrefix.replace('.', '/');

            for (const item of batchItems) {
                currentSequence++;
                
                const formattedNum = `${cleanPrefix}-${currentYear}${String(currentSequence).padStart(3, '0')}`;
                
                const newOsRef = doc(collection(db, 'ordens_servico'));
                
                const specificData = cleanUndefined({
                    ...baseOsData,
                    ...item,
                    equipamento: item.equipamento || baseOsData.equipamento, 
                    marca: item.marca || baseOsData.marca || '',
                    modelo: item.modelo || baseOsData.modelo || '',
                    os_numero: formattedNum,
                    numero_os: formattedNum,
                    created_at: new Date(),
                    created_at_year: currentYear
                });

                transaction.set(newOsRef, specificData);
            }

            transaction.set(counterRef, { sequence: currentSequence, year: currentYear }, { merge: true });
            
            return batchItems.length;
        });

        return { success: true, count: count };

    } catch (error) {
        console.error("Erro na transação de lote:", error);
        throw error;
    }
}

// Exportação padrão de segurança (para casos de import default)
export default {
    preverProximaOS,
    gerarESalvarOS,
    gerarESalvarLoteOS
};