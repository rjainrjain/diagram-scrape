
This repository contains files for: 
 (1) scraping Mermaid diagram files (`.mmd`, `.mermaid`) from GitHub (see `scrapeMermaidFromGithub.js`), 
 (2) converting them to `.svg` (see `convertMermaidToSVG.js`), and 
 (3) rendering them in the browser in order to run bounding box measurement logic on each SVG file and detect overlapping text, outputting a CSV with this information (see `detectTextOverlap.js`).

 It also contains (4) a folder `mermaid` containing `.mmd` and `.mermaid` files scraped from GitHub using the aforementioned code and (5) a folder `svg` containing successfully compiled SVGs from these `.mermaid` files.  
