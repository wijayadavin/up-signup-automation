#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function addJsExtensionsToImports(directory) {
  const files = fs.readdirSync(directory);
  
  for (const file of files) {
    const filePath = path.join(directory, file);
    const stat = fs.statSync(filePath);
    
    if (stat.isDirectory()) {
      addJsExtensionsToImports(filePath);
    } else if (file.endsWith('.js')) {
      let content = fs.readFileSync(filePath, 'utf8');
      
      // Add .js extension to relative imports
      content = content.replace(
        /from ['"](\.\/[^'"]*?)['"]/g,
        (match, importPath) => {
          if (!importPath.endsWith('.js')) {
            return `from '${importPath}.js'`;
          }
          return match;
        }
      );
      
      // Add .js extension to relative imports without ./
      content = content.replace(
        /from ['"]([^'"]*?)['"]/g,
        (match, importPath) => {
          if ((importPath.startsWith('./') || importPath.startsWith('../')) && !importPath.endsWith('.js') && !importPath.includes('*')) {
            return `from '${importPath}.js'`;
          }
          return match;
        }
      );
      
      fs.writeFileSync(filePath, content);
    }
  }
}

// Start from the dist directory
const distDir = path.join(__dirname, '..', 'dist');
if (fs.existsSync(distDir)) {
  addJsExtensionsToImports(distDir);
  console.log('Import extensions fixed');
} else {
  console.error('dist directory not found. Run npm run build first.');
}
