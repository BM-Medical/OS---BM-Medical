/**
 * favicon-loader.js
 * * Este módulo injeta dinamicamente as tags de favicon no <head> do documento.
 * Isso centraliza a gestão do ícone do site, evitando repetição de código
 * em múltiplos arquivos HTML.
 */

function addFaviconTags() {
    // Caminho para o seu arquivo de imagem .png.
    // Certifique-se de que o arquivo 'favicon.png' está na pasta principal do seu site.
    const faviconPath = '/favicon.png'; 
    
    // Cor do tema para a barra de endereço em navegadores móveis.
    const themeColor = "#34495e";

    const head = document.head;

    // Remove quaisquer favicons existentes para evitar duplicatas.
    const existingFavicons = head.querySelectorAll('link[rel="icon"], link[rel="apple-touch-icon"], meta[name="theme-color"]');
    existingFavicons.forEach(tag => tag.remove());

    // Cria e adiciona as novas tags, apontando diretamente para o arquivo .png.
    const tags = [
        // Ícone principal para navegadores.
        { el: 'link', rel: 'icon', type: 'image/png', href: faviconPath },

        // Ícone para dispositivos Apple (tela inicial).
        { el: 'link', rel: 'apple-touch-icon', href: faviconPath },

        // Meta tag da cor do tema.
        { el: 'meta', name: 'theme-color', content: themeColor }
    ];

    tags.forEach(tagInfo => {
        const tag = document.createElement(tagInfo.el);
        for (const attr in tagInfo) {
            if (attr !== 'el') {
                tag.setAttribute(attr, tagInfo[attr]);
            }
        }
        head.appendChild(tag);
    });
}

// Executa a função assim que o módulo é carregado.
addFaviconTags();

