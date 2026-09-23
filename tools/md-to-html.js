const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');
const { marked } = require('marked');

const root = 'C:/Users/Isaiah/farm-advisory-agent';
const md = fs.readFileSync(path.join(root, 'SYSTEM_DESIGN.md'), 'utf8');

const cli = path.join(root, 'tools/node_modules/@mermaid-js/mermaid-cli/src/cli.js');
const feed = path.join(root, 'tools/puppeteer-config.json');

function renderMermaid(code, name) {
  const mmd = path.join(os.tmpdir(), name + '.mmd');
  const svgFile = path.join(os.tmpdir(), name + '.svg');
  fs.writeFileSync(mmd, code, 'utf8');
  execFileSync('node', [cli, '-i', mmd, '-o', svgFile, '-p', feed, '-b', 'white', '-w', '2400'], { stdio: 'pipe' });
  const svg = fs.readFileSync(svgFile, 'utf8');
  return '<div class="mermaid-wrap">' + svg + '</div>';
}

const renderer = new marked.Renderer();
renderer.image = (href, title, text) => '<div class="img">' + text + '</div>';
marked.use({ renderer });

let i = 0;
const mdPre = md.replace(/```mermaid[\s\S]*?```/g, (block) => {
  i++;
  const code = block.replace(/```mermaid/, '').replace(/```$/, '');
  return renderMermaid(code, 'block' + i);
});

let htmlBody = marked.parse(mdPre);

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<title>Poultry Advisory Agent - Complete System Design & Stack</title>
<style>
  @page { size: A4; margin: 18mm 16mm 20mm 16mm; }
  html { -webkit-print-color-adjust: exact; }
  body { font-family: "Segoe UI", Arial, sans-serif; font-size: 11pt; line-height: 1.5; color: #1a1f2b; margin:0; }
  h1 { font-size: 20pt; margin: 0 0 4px 0; color:#0b3354; }
  h2 { font-size: 15pt; margin: 22px 0 8px 0; color:#0b3354; border-bottom: 2px solid #d9e2ef; padding-bottom:4px; }
  h3 { font-size: 12.5pt; margin: 14px 0 6px 0; color:#14507e; }
  p { margin: 6px 0; }
  ul, ol { margin: 6px 0 6px 0; padding-left: 22px; }
  li { margin: 3px 0; }
  strong { color:#0b3354; }
  blockquote { border-left:4px solid #7fb0d5; margin:10px 0; padding:4px 12px; background:#f2f7fb; color:#2c3d52; }
  pre { background:#f5f7fa; border:1px solid #dde3ec; border-radius:4px; padding:10px; font-size:8.5pt; overflow-x:hidden; white-space:pre-wrap; word-break:break-word; }
  code { font-family: Consolas, monospace; background:#eef1f6; padding:1px 3px; border-radius:3px; }
  pre code { background:none; padding:0; }
  hr { border:none; border-top:1px solid #cfd8e5; margin:18px 0; }
  table { border-collapse: collapse; width:100%; margin:10px 0; font-size:9.5pt; }
  th, td { border:1px solid #cbd4e1; padding:4px 7px; text-align:left; }
  th { background:#e8eef6; }
  .mermaid-wrap { text-align:center; margin:14px 0; }
  .mermaid-wrap svg { max-width:100%; height:auto; }
  .titleblock { border-bottom:3px solid #0b3354; padding-bottom:12px; margin-bottom:16px; }
  .titleblock em { color:#43536b; }
</style>
</head>
<body>
${htmlBody}
</body>
</html>`;

fs.writeFileSync(path.join(root, 'system-design.html'), html, 'utf8');
console.log('html written: ' + html.length + ' bytes, mermaid blocks rendered: ' + i);