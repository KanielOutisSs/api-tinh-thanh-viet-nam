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
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }
    
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
    } else if (parsedUrl.pathname === '/feedback' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => {
            body += chunk.toString();
        });
        req.on('end', () => {
            try {
                const feedbackData = JSON.parse(body);
                if (!feedbackData.input || !feedbackData.output || !feedbackData.expected) {
                    res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
                    res.end(JSON.stringify({ error: "Missing required fields: input, output, expected" }));
                    return;
                }
                
                const feedbackFilePath = path.join(__dirname, 'feedback.json');
                let existingFeedback = [];
                if (fs.existsSync(feedbackFilePath)) {
                    try {
                        existingFeedback = JSON.parse(fs.readFileSync(feedbackFilePath, 'utf8'));
                    } catch (e) {
                        existingFeedback = [];
                    }
                }
                
                const newEntry = {
                    id: Date.now().toString(),
                    timestamp: new Date().toISOString(),
                    input: feedbackData.input,
                    output: feedbackData.output,
                    expected: feedbackData.expected
                };
                
                existingFeedback.push(newEntry);
                fs.writeFileSync(feedbackFilePath, JSON.stringify(existingFeedback, null, 4), 'utf8');
                
                res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({ success: true, message: "Feedback saved successfully" }));
            } catch (err) {
                res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({ error: "Failed to save feedback: " + err.message }));
            }
        });
    } else {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end("Not Found");
    }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Address Converter API Server is running on port ${PORT}`);
});
