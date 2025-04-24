let overlapCount = 0;
let filesWithOverlap = 0;
let totalOverlaps = 0;
const csvData = [];

// Add column labels
csvData.push({
  fileNumber: 'File Number',
  totalOverlapCount: 'Total Overlap Count',
  fileOverlapCount: 'Overlap Count in File',
  text1: 'Text 1',
  text2: 'Text 2',
  intersectionPoints: 'Intersection Points'
});

const BATCH_SIZE = 100; // Adjust the batch size as needed
const container = document.getElementById('svgContainer');

function isOverlapping(bbox1, bbox2) {
    return !(bbox2.x > bbox1.x + bbox1.width ||
             bbox2.x + bbox2.width < bbox1.x ||
             bbox2.y > bbox1.y + bbox1.height ||
             bbox2.y + bbox2.height < bbox1.y);
}

function getIntersectionPoints(bbox1, bbox2) {
    const points = [];
    const xOverlap = Math.max(bbox1.x, bbox2.x);
    const yOverlap = Math.max(bbox1.y, bbox2.y);
    const xEndOverlap = Math.min(bbox1.x + bbox1.width, bbox2.x + bbox2.width);
    const yEndOverlap = Math.min(bbox1.y + bbox1.height, bbox2.y + bbox2.height);

    if (xOverlap < xEndOverlap && yOverlap < yEndOverlap) {
        points.push({ x: xOverlap, y: yOverlap });
        points.push({ x: xEndOverlap, y: yOverlap });
        points.push({ x: xOverlap, y: yEndOverlap });
        points.push({ x: xEndOverlap, y: yEndOverlap });
    }

    return points;
}

function processSVG(svgDoc, file, fileIndex) {
    const textElements = svgDoc.querySelectorAll("text");
    const boundingBoxes = [];

    // bounding boxes of text elements
    textElements.forEach(text => {
        const bbox = text.getBoundingClientRect();
        if (bbox) {
            boundingBoxes.push({ element: text, bbox: bbox });
        }
    });

    console.log(`Processing file: ${file}`);
    //console.log(`Bounding Boxes:`, boundingBoxes);

    let fileOverlapCount = 0;

    // check overlapping elements and print results
    for (let i = 0; i < boundingBoxes.length; i++) {
        for (let j = i + 1; j < boundingBoxes.length; j++) {
            const bbox1 = boundingBoxes[i].bbox;
            const bbox2 = boundingBoxes[j].bbox;
            const text1 = boundingBoxes[i].element;
            const text2 = boundingBoxes[j].element;

            //console.log(`Checking overlap between: ${text1.textContent} and ${text2.textContent}`);
            //console.log(`bbox1:`, bbox1);
            //console.log(`bbox2:`, bbox2);

            if (bbox1 && bbox2 && isOverlapping(bbox1, bbox2)) {
                const intersectionPoints = getIntersectionPoints(bbox1, bbox2);
                //console.log(`Intersection Points:`, intersectionPoints);

                if (intersectionPoints.length > 0) {
                    const verticalOverlap = intersectionPoints[2].y - intersectionPoints[0].y;
                    if (verticalOverlap >= 1) {
                        overlapCount++;
                        fileOverlapCount++;
                        totalOverlaps++;
                        console.log(`${overlapCount} ${file}: ${text1.textContent} and ${text2.textContent} overlap at:`, intersectionPoints);

                        csvData.push({
                            fileNumber: filesWithOverlap + 1,
                            totalOverlapCount: overlapCount,
                            fileOverlapCount: fileOverlapCount,
                            text1: text1.textContent,
                            text2: text2.textContent,
                            intersectionPoints: JSON.stringify(intersectionPoints)
                        });
                    }
                }
            }
        }
    }

    if (fileOverlapCount > 0) {
        filesWithOverlap++;
    }
}

async function processBatch(svgFiles, start, end) {
    for (let i = start; i < end && i < svgFiles.length; i++) {
        if (i < 50) { continue; }
        const file = svgFiles[i];
        const encodedFileName = encodeURIComponent(file);
        const objectElement = document.createElement('object');
        objectElement.data = `/mermaidsvg/${encodedFileName}`;
        objectElement.type = 'image/svg+xml';

        await new Promise((resolve) => {
            objectElement.addEventListener('load', function() {
                const svgDoc = objectElement.contentDocument;
                processSVG(svgDoc, file, i);
                container.removeChild(objectElement);
                resolve();
            });

            container.appendChild(objectElement);
        });
    }
}

async function processFilesInBatches(svgFiles) {
    for (let i = 0; i < svgFiles.length; i += BATCH_SIZE) {
        await processBatch(svgFiles, i, i + BATCH_SIZE);
    }

    // Log filesWithOverlap and calculate the average only after all batches are processed
    console.log(`Files with at least one overlap: ${filesWithOverlap}`);
    if (filesWithOverlap > 0) {
        const avgOverlaps = totalOverlaps / filesWithOverlap;
        console.log(`Average number of overlaps per file with overlaps: ${avgOverlaps}`);
    }

    /*// Add summary to CSV data
    csvData.push({
        fileNumber: filesWithOverlap,
        totalOverlapCount: overlapCount,
        fileOverlapCount: filesWithOverlap,
        text1: '',
        text2: '',
        intersectionPoints: ''
    });*/
}

function downloadCSV() {
    const csv = Papa.unparse(csvData);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);

    link.setAttribute('href', url);
    link.setAttribute('download', 'overlaps.csv');
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

document.getElementById('processButton').addEventListener('click', () => {
    fetch('/mermaidsvg')
        .then(response => response.json())
        .then(svgFiles => {
            console.log(`Fetched ${svgFiles.length} SVG files.`);
            return processFilesInBatches(svgFiles);
        })
        .catch(error => console.error('Error fetching SVG files:', error));
});

document.getElementById('downloadCSV').addEventListener('click', downloadCSV);
