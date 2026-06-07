const http = require('http');
const url = require('url');
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
    
    if (parsedUrl.pathname === '/convert' && req.method === 'GET') {
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

const PORT = 3000;
server.listen(PORT, () => {
    console.log(`Address Converter API Server is running on http://localhost:${PORT}`);
    console.log(`Test API: http://localhost:${PORT}/convert?address=Tổ+3,+khu+1,+phường+Quang+Trung,+Uông+Bí,+Quảng+Ninh`);
});
