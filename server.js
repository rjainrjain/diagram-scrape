const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3000;

// Serve static files from the "public" directory
app.use(express.static(path.join(__dirname, 'public')));

// Endpoint to get all SVG files
app.get('/mermaidsvg', (req, res) => {
    const svgDir = path.join(__dirname, 'public/mermaidsvg');
    fs.readdir(svgDir, (err, files) => {
        if (err) {
            return res.status(500).json({ error: 'Unable to read SVG directory' });
        }

        const svgFiles = files.filter(file => path.extname(file) === '.svg');
        res.json(svgFiles);
    });
});

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
