const express = require('express');
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

const app = express();
const PORT = 3000;

// Serve static files from the "public" directory
app.use(express.static(path.join(__dirname, 'public')));
app.use('/svg', express.static(path.join(__dirname, 'svg')));
app.use('/svg_repaired', express.static(path.join(__dirname, 'svg_repaired')));

app.get('/example.svg', (_req, res) => {
    res.sendFile(path.join(__dirname, 'example.svg'));
});

// Endpoint to get all SVG files
app.get('/mermaidsvg', (req, res) => {
    const svgDir = path.join(__dirname, 'svg');
    fs.readdir(svgDir, (err, files) => {
        if (err) {
            return res.status(500).json({ error: 'Unable to read SVG directory' });
        }

        const svgFiles = files.filter(file => path.extname(file) === '.svg');
        res.json(svgFiles);
    });
});

app.get('/api/example-diagram', (_req, res) => {
    res.json({
        input: '/example.svg',
        repaired: '/svg_repaired/example.repaired.svg'
    });
});

app.post('/api/repair/example', (_req, res) => {
    const scriptPath = path.join(__dirname, 'repairSvgWithBloom.js');
    execFile('node', [scriptPath, '--input', 'example.svg'], { cwd: __dirname }, (error, stdout, stderr) => {
        if (error) {
            return res.status(500).json({
                error: 'Example repair failed',
                details: stderr || error.message
            });
        }

        let parsed = null;
        try {
            parsed = JSON.parse(stdout);
        } catch (_parseError) {
            parsed = { raw: stdout };
        }

        return res.json({ ok: true, report: parsed });
    });
});

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
