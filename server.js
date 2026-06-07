const http = require('http');
const url = require('url');
const fs = require('fs');
const path = require('path');
const AddressConverter = require('./addressConverter');

const converter = new AddressConverter();
console.log("Loading dataset...");
converter.loadData(
    './data/donvi_tinhthanh.json',
    './data/simplified_json_generated_data_vn_units.json'
);
console.log("Dataset loaded successfully!");

const server = http.createServer((req, res) => {
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET');
    
    const parsedUrl = url.parse(req.url, true);
    
    if (parsedUrl.pathname === '/' && req.method === 'GET') {
        fs.readFile(path.join(__dirname, 'index.html'), 'utf8', (err, html) => {
            if (err) {
                res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
                res.end("Internal Server Error");
                return;
            }
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(html);
        });
    } else if (parsedUrl.pathname === '/convert' && req.method === 'GET') {
        const query = parsedUrl.query;
        if (!query.address) {
            res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ error: "Missing 'address' query parameter" }));
            return;
        }

        try {
            const newAddress = converter.convertAddress(query.address);
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({
                original: query.address,
                converted: newAddress
            }));
        } catch (error) {
            res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ error: error.message }));
        }
    } else {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end("Not Found");
    }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Address Converter API Server is running on port ${PORT}`);
});
