// Importa os módulos necessários do Node.js
const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url'); // Importa o módulo URL

// Define a porta em que o servidor irá rodar
const port = 3000;

/**
 * Cria o servidor. A lógica aqui dentro será executada
 * toda vez que o seu navegador fizer uma requisição.
 */
const server = http.createServer((req, res) => {
    // CORREÇÃO: Analisa a URL para separar o caminho dos parâmetros
    const parsedUrl = url.parse(req.url, true);
    const pathname = parsedUrl.pathname;

    // Constrói o caminho do ficheiro que o navegador está a pedir, usando apenas o pathname
    let filePath = path.join(__dirname, pathname === '/' ? 'index.html' : pathname);

    // Determina o tipo de conteúdo (HTML, CSS, JS, PNG, etc.)
    const extname = String(path.extname(filePath)).toLowerCase();
    const mimeTypes = {
        '.html': 'text/html',
        '.js': 'text/javascript',
        '.css': 'text/css',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.svg': 'image/svg+xml',
    };

    const contentType = mimeTypes[extname] || 'application/octet-stream';

    // Lê o ficheiro do disco e envia-o para o navegador
    fs.readFile(filePath, (error, content) => {
        if (error) {
            // Se o ficheiro não for encontrado, envia um erro 404
            if (error.code == 'ENOENT') {
                res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
                res.end('<h1>404 Not Found</h1><p>O recurso solicitado não foi encontrado.</p>', 'utf-8');
            } else {
                // Para outros erros do servidor
                res.writeHead(500);
                res.end('Desculpe, ocorreu um erro no servidor: '+error.code+' ..\n');
            }
        } else {
            // Se o ficheiro for encontrado, envia-o com o tipo de conteúdo correto
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content, 'utf-8');
        }
    });
});

/**
 * Inicia o servidor e o faz "escutar" por requisições na porta definida.
 * A alteração para '0.0.0.0' permite que o servidor seja acessado por outros
 * dispositivos na mesma rede local (como seu celular).
 */
server.listen(port, '0.0.0.0', () => {
    console.log(`🚀 Servidor local iniciado com sucesso!`);
    console.log(`Acesse no seu computador em: http://localhost:${port}`);
    console.log(`Para testar em outros dispositivos (como seu celular) na mesma rede Wi-Fi, use o endereço IP local do seu computador.`);
});

