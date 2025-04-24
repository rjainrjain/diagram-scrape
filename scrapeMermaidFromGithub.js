const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const username = 'rjainrjain';
const token = "";
const searchBaseUrl = 'https://api.github.com/search/code';
const perPage = 100; // Number of results per page

const keywords = ["stateDiagram", "pie", "flowchart", "sequenceDiagram", "classDiagram", "graph", "erDiagram", "mindmap", "quadrant", "gitGraph", "journey"];
const baseDownloadDirectory = '/Users/rijuljain/Documents/Code/text-overlap/mermaid_by_type'; // Update this path to your desired directory

const maxFileNameLength = 255; // Maximum length for filenames (adjust as needed)

if (!fs.existsSync(baseDownloadDirectory)) {
    fs.mkdirSync(baseDownloadDirectory, { recursive: true });
}

async function searchFiles(query, page = 1) {
    const url = `${searchBaseUrl}?q=${query}&per_page=${perPage}&page=${page}`;
    try {
        const response = await axios.get(url, {
            auth: {
                username: username,
                password: token
            },
            headers: {
                'Accept': 'application/vnd.github.v3.text-match+json'
            }
        });
        return response.data.items;
    } catch (error) {
        if (error.response && error.response.status === 403) {
            console.error(`Rate limit exceeded. Waiting for reset...`);
            const resetTime = error.response.headers['x-ratelimit-reset'] * 1000;
            const waitTime = resetTime - Date.now();
            await new Promise(resolve => setTimeout(resolve, waitTime));
            return searchFiles(query, page);
        } else {
            console.error(`Error fetching search results for ${query} on page ${page}:`, error);
            return [];
        }
    }
}

function truncateFileName(fileName, maxLength) {
    if (fileName.length <= maxLength) {
        return fileName;
    }
    const extension = path.extname(fileName);
    const baseName = path.basename(fileName, extension);
    const truncatedBaseName = baseName.slice(0, maxLength - extension.length - 1);
    return `${truncatedBaseName}${extension}`;
}

async function downloadFile(fileUrl, filePath) {
    try {
        const response = await axios.get(fileUrl, {
            auth: {
                username: username,
                password: token
            },
            responseType: 'stream'
        });
        const writer = fs.createWriteStream(filePath);
        response.data.pipe(writer);
        writer.on('finish', () => console.log(`Downloaded ${filePath}`));
    } catch (error) {
        console.error(`Error downloading file ${filePath}:`, error);
    }
}

async function downloadDiagramsForKeyword(keyword) {
    const downloadDirectory = path.join(baseDownloadDirectory, keyword);
    if (!fs.existsSync(downloadDirectory)) {
        fs.mkdirSync(downloadDirectory, { recursive: true });
    }

    let page = 1;
    let allFiles = [];
    let files;

    do {
        files = await searchFiles(`extension:mermaid ${keyword}`, page);
        allFiles = allFiles.concat(files);
        page++;
    } while (files.length === perPage);

    for (const file of allFiles) {
        const fileUrl = file.html_url.replace('github.com', 'raw.githubusercontent.com').replace('/blob', '');
        const uniqueIdentifier = uuidv4();
        const fileExtension = path.extname(fileUrl);
        const fileName = path.basename(fileUrl, fileExtension);
        const uniqueFileName = truncateFileName(`${fileName}_${uniqueIdentifier}${fileExtension}`, maxFileNameLength);
        const filePath = path.join(downloadDirectory, uniqueFileName);
        await downloadFile(fileUrl, filePath);
    }
}

async function main() {
    for (const keyword of keywords) {
        console.log(`Downloading diagrams for keyword: ${keyword}`);
        await downloadDiagramsForKeyword(keyword);
    }
    console.log('All downloads completed.');
}

main();
