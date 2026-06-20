const http = require('http');
const fs = require('fs');
const path = require('path');

const root = __dirname;
const types = {
    '.css': 'text/css; charset=utf-8',
    '.html': 'text/html; charset=utf-8',
    '.jpg': 'image/jpeg',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json',
    '.md': 'text/markdown; charset=utf-8',
    '.pdf': 'application/pdf',
    '.png': 'image/png'
};

http.createServer((request, response) => {
    let pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    if (pathname === '/') pathname = '/index.html';

    const file = path.resolve(root, `.${pathname}`);
    if (!file.startsWith(root)) {
        response.writeHead(403).end('Forbidden');
        return;
    }

    fs.readFile(file, (error, content) => {
        if (error) {
            response.writeHead(error.code === 'ENOENT' ? 404 : 500).end(error.code === 'ENOENT' ? 'Not found' : 'Server error');
            return;
        }
        response.writeHead(200, {
            'Cache-Control': 'no-cache',
            'Content-Type': types[path.extname(file).toLowerCase()] || 'application/octet-stream'
        }).end(content);
    });
}).listen(4173, '127.0.0.1', () => {
    console.log('Serving http://127.0.0.1:4173');
});
