const http = require('node:http');

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ status: 'ok', service: 'nextjs-placeholder' }));
});

server.listen(3001, '0.0.0.0');
