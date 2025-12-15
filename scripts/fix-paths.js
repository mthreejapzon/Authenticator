const fs = require('fs');
const path = require('path');

// Read the index.html file
const indexPath = path.join(__dirname, '../dist/index.html');
let html = fs.readFileSync(indexPath, 'utf8');

// Replace absolute paths with relative paths
html = html.replace(/href="\/favicon.ico"/g, 'href="favicon.ico"');
html = html.replace(/src="\/_expo\//g, 'src="_expo/');
html = html.replace(/href="\/_expo\//g, 'href="_expo/');

// Add base tag to help with URL resolution in Electron
if (!html.includes('<base')) {
  html = html.replace('<head>', '<head>\n    <base href="app://./" />');
}

// Write it back
fs.writeFileSync(indexPath, html, 'utf8');

console.log('✓ Fixed paths in index.html for Electron');
