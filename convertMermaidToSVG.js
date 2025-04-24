const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

const sourceDirectory = '/Users/rijuljain/Documents/Code/text-overlap/mermaid_by_type'; // Base directory with subfolders
const outputDirectory = '/Users/rijuljain/Documents/Code/text-overlap/public/mermaidsvg'; // Directory to save .svg files
const errorLog = path.join(__dirname, 'errors.log');
const processedLog = path.join(__dirname, 'processed.log');

const subdirectories = ["stateDiagram", "pie", "flowchart", "sequenceDiagram", "classDiagram", "graph", "erDiagram", "mindmap", "quadrant", "gitGraph", "journey"];
const fileExtensions = ['.mmd', '.mermaid'];

// Create the output directory if it doesn't exist
if (!fs.existsSync(outputDirectory)) {
  fs.mkdirSync(outputDirectory, { recursive: true });
}

// Initialize log files
fs.writeFileSync(errorLog, '');
fs.writeFileSync(processedLog, '');

function getFilesFromSubdirectories() {
  let files = [];
  for (const subdir of subdirectories) {
    const subdirPath = path.join(sourceDirectory, subdir);
    if (fs.existsSync(subdirPath)) {
      const subdirFiles = fs.readdirSync(subdirPath)
        .filter(file => fileExtensions.includes(path.extname(file)))
        .map(file => path.join(subdirPath, file));
      files = files.concat(subdirFiles);
    }
  }
  return files;
}

const mermaidFiles = getFilesFromSubdirectories();

function convertFile(index) {
  if (index >= mermaidFiles.length) {
    console.log('All files processed.');
    return;
  }

  const filePath = mermaidFiles[index];
  const outputFilePath = path.join(outputDirectory, path.basename(filePath, path.extname(filePath)) + '.svg');

  const command = `mmdc -i "${filePath}" -o "${outputFilePath}"`;
  exec(command, (error, stdout, stderr) => {
    if (error) {
      fs.appendFileSync(errorLog, `Error converting file ${filePath}: ${error}\n`);
      console.error(`Error converting file ${filePath}:`, error);
    } else {
      fs.appendFileSync(processedLog, `Converted ${filePath} to ${outputFilePath}\n`);
      console.log(`Converted ${filePath} to ${outputFilePath}`);
    }
    convertFile(index + 1); // Ensure this is called regardless of error
  });
}

convertFile(0);
