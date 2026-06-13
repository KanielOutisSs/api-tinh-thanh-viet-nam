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

async function saveFeedbackToGithub(newEntry) {
    const token = process.env.GITHUB_TOKEN;
    const repo = process.env.GITHUB_REPO || 'KanielOutisSs/api-tinh-thanh-viet-nam';
    const filePath = 'feedback.json';
    const url = `https://api.github.com/repos/${repo}/contents/${filePath}`;

    const headers = {
        'Authorization': `Bearer ${token}`,
        'User-Agent': 'address-converter-api',
        'Accept': 'application/vnd.github.v3+json'
    };

    let existingFeedback = [];
    let sha = null;

    try {
        const getRes = await fetch(url, { headers });
        if (getRes.ok) {
            const data = await getRes.json();
            sha = data.sha;
            const content = Buffer.from(data.content, 'base64').toString('utf8');
            existingFeedback = JSON.parse(content);
        } else if (getRes.status !== 404) {
            throw new Error(`Failed to fetch current feedback.json from GitHub: status ${getRes.status}`);
        }
    } catch (e) {
        console.error("Error fetching feedback.json from GitHub:", e.message);
        throw e;
    }

    existingFeedback.push(newEntry);
    const newContent = JSON.stringify(existingFeedback, null, 4);
    const base64Content = Buffer.from(newContent, 'utf8').toString('base64');

    const body = {
        message: `feedback: add error report ${newEntry.id}`,
        content: base64Content
    };
    if (sha) {
        body.sha = sha;
    }

    const putRes = await fetch(url, {
        method: 'PUT',
        headers: {
            ...headers,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
    });

    if (!putRes.ok) {
        const errText = await putRes.text();
        throw new Error(`Failed to update feedback.json on GitHub: ${putRes.status} ${errText}`);
    }
}

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
    } else if (parsedUrl.pathname === '/feedback' && req.method === 'GET') {
        const feedbackFilePath = path.join(__dirname, 'feedback.json');
        if (!fs.existsSync(feedbackFilePath)) {
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify([]));
            return;
        }
        fs.readFile(feedbackFilePath, 'utf8', (err, data) => {
            if (err) {
                res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({ error: "Failed to read feedback: " + err.message }));
                return;
            }
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(data);
        });
    } else if (parsedUrl.pathname === '/feedback' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => {
            body += chunk.toString();
        });
        req.on('end', () => {
            try {
                 const feedbackData = JSON.parse(body);
                if (!feedbackData.input || !feedbackData.output) {
                    res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
                    res.end(JSON.stringify({ error: "Missing required fields: input, output" }));
                    return;
                }
                
                const expectedValue = feedbackData.expected ? feedbackData.expected.trim() : "";
                
                const newEntry = {
                    id: Date.now().toString(),
                    timestamp: new Date().toISOString(),
                    input: feedbackData.input,
                    output: feedbackData.output,
                    expected: expectedValue
                };
                
                const token = process.env.GITHUB_TOKEN;
                let savePromise;
                
                if (token) {
                    savePromise = saveFeedbackToGithub(newEntry);
                } else {
                    savePromise = new Promise((resolve, reject) => {
                        try {
                            const feedbackFilePath = path.join(__dirname, 'feedback.json');
                            let existingFeedback = [];
                            if (fs.existsSync(feedbackFilePath)) {
                                try {
                                    existingFeedback = JSON.parse(fs.readFileSync(feedbackFilePath, 'utf8'));
                                } catch (e) {
                                    existingFeedback = [];
                                }
                            }
                            existingFeedback.push(newEntry);
                            fs.writeFileSync(feedbackFilePath, JSON.stringify(existingFeedback, null, 4), 'utf8');
                            resolve();
                        } catch (e) {
                            reject(e);
                        }
                    });
                }
                
                savePromise.then(() => {
                    // Console warning if current conversion outputs differently from expected
                    try {
                        const currentOutput = converter.convertAddress(feedbackData.input);
                        if (expectedValue) {
                            if (currentOutput.toLowerCase() !== expectedValue.toLowerCase()) {
                                console.warn(`\n⚠️ [FEEDBACK WARNING] New error report submitted!`);
                                console.warn(`Input:    "${feedbackData.input}"`);
                                console.warn(`Current:  "${currentOutput}"`);
                                console.warn(`Expected: "${expectedValue}"`);
                                console.warn(`Action: Open Antigravity to analyze and update the parsing rules.\n`);
                            }
                        } else {
                            console.warn(`\n⚠️ [FEEDBACK WARNING] New error report submitted (No expected output specified)!`);
                            console.warn(`Input:    "${feedbackData.input}"`);
                            console.warn(`Current:  "${currentOutput}"`);
                            console.warn(`Action: Open Antigravity to check this address.\n`);
                        }
                    } catch (e) {
                        console.warn(`\n⚠️ [FEEDBACK WARNING] Address threw error during check: "${feedbackData.input}" -> ${e.message}\n`);
                    }
                    
                    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
                    res.end(JSON.stringify({ success: true, message: "Feedback saved successfully" }));
                }).catch(err => {
                    res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
                    res.end(JSON.stringify({ error: "Failed to save feedback: " + err.message }));
                });
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
