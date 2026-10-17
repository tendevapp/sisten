/**
 * Gera um mapa vetorial da navegação do SISTEN a partir do catálogo de páginas.
 * Uso: node scripts/gerar-mapa-modulos-sisten.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const pagesSource = readFileSync(resolve(root, 'src/lib/pages.ts'), 'utf8');
const appSource = readFileSync(resolve(root, 'src/App.tsx'), 'utf8');

function section(source, start) {
  const match = source.match(new RegExp(`${start}[\\s\\S]*?\\n\\];`));
  if (!match) throw new Error(`Seção não encontrada: ${start}`);
  return match[0];
}

function entriesFrom(source, groupKey = 'group') {
  const pattern = new RegExp(
    String.raw`id:\s*'([^']+)',\s*${groupKey}:\s*'([^']+)',\s*label:\s*'([^']+)'[\s\S]*?path:\s*'([^']+)'`,
    'g',
  );
  return [...source.matchAll(pattern)].map(([, id, group, label, path]) => ({ id, group, label, path }));
}

function detailedFormsFrom(source) {
  const starts = [...source.matchAll(/^  \{\r?\n(?:    \/\/.*\r?\n)*    id: '([^']+)'/gm)];
  return starts.map((start, index) => {
    const end = starts[index + 1]?.index ?? source.length;
    const block = source.slice(start.index, end);
    const group = block.match(/grupoId: '([^']+)'/)?.[1];
    const label = block.match(/label: '([^']+)'/)?.[1];
    const path = block.match(/path: '([^']+)'/)?.[1];
    if (!group || !label || !path) throw new Error(`Formulário incompleto: ${start[1]}`);
    return { id: start[1], group, label, path };
  });
}

const pages = entriesFrom(section(pagesSource, 'export const PAGES: PageDef\\[\\] = \\['));
const forms = detailedFormsFrom(section(pagesSource, 'export const FORMULARIOS_DETALHADOS: FormularioDef\\[\\] = \\['));

const GROUP_ORDER = [
  'GERAL', 'SOLICITAÇÕES', 'DEMANDAS', 'PLANEJAMENTO', 'SUPRIMENTOS', 'ALMOXARIFADO',
  'PRODUÇÃO', 'QUALIDADE', 'FACILITIES', 'RH', 'SSMA', 'FINANCEIRO', 'HELPDESK', 'ADMINISTRAÇÃO',
];

const groupNames = {
  GERAL: 'Geral', 'SOLICITAÇÕES': 'Solicitações', DEMANDAS: 'Demandas', PLANEJAMENTO: 'Planejamento',
  SUPRIMENTOS: 'Suprimentos', ALMOXARIFADO: 'Almoxarifado', 'PRODUÇÃO': 'Produção', QUALIDADE: 'Qualidade',
  FACILITIES: 'Facilities', RH: 'Recursos Humanos', SSMA: 'SSMA', FINANCEIRO: 'Financeiro',
  HELPDESK: 'Helpdesk', 'ADMINISTRAÇÃO': 'Administração',
};

const formGroupNames = {
  ssma: 'SSMA', planejamento: 'Planejamento', almoxarifado: 'Almoxarifado',
  portaria: 'Portaria & Segurança', logistica: 'Logística & Expedição', rh: 'RH & Departamento Pessoal',
};

// Subrotas próprias que existem no roteador, mas não são um item independente
// no catálogo PAGES. As aliases de compatibilidade não entram no diagrama.
const internalPages = {
  '/formularios': [
    ['Portaria — hub', '/formularios/portaria'],
    ['SSMA — hub alternativo', '/formularios/ssma'],
  ],
  '/almoxarifado/movimentacoes': [
    ['Giro de estoque', '/almoxarifado/movimentacoes/giro'],
    ['Idade do estoque', '/almoxarifado/movimentacoes/idade'],
    ['Urgência', '/almoxarifado/movimentacoes/urgencia'],
    ['Mínimo', '/almoxarifado/movimentacoes/minimo'],
  ],
  '/almoxarifado/controle-estoque': [['Dossiê', '/almoxarifado/controle-estoque/dossie']],
  '/almoxarifado/projetos': [
    ['BOM', '/almoxarifado/projetos/bom'], ['Posição', '/almoxarifado/projetos/posicao'],
    ['Recebimento', '/almoxarifado/projetos/recebimento'], ['Pré-montagem', '/almoxarifado/projetos/premontagem'],
    ['Produção', '/almoxarifado/projetos/producao'], ['Sobressalentes', '/almoxarifado/projetos/sobressalentes'],
    ['Painéis', '/almoxarifado/projetos/paineis'],
  ],
  '/planejamento/acompanhamento-diario-tv': [['Dados', '/planejamento/acompanhamento-diario-dados']],
  '/producao/expedicao': [['Dados', '/producao/expedicao/dados']],
  '/rh': [['Relatório ASE', '/rh/relatorio-ase']],
  '/': [['Perfil', '/perfil']],
};

const pagePaths = new Set(pages.map(page => page.path));
const formPaths = new Set(forms.map(form => form.path));
const casePaths = [...appSource.matchAll(/case '([^']+)'/g)].map(([, path]) => path);
const representedInternal = new Set(Object.values(internalPages).flat().map(([, path]) => path));
const unrepresentedRoutes = casePaths.filter(path => !pagePaths.has(path) && !formPaths.has(path) && !representedInternal.has(path));

function esc(value) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

function leaf(label, path, type = 'page') {
  return { label, path, type, children: [] };
}

function pageNode(page) {
  const children = (internalPages[page.path] ?? []).map(([label, path]) => leaf(label, path, 'internal'));
  if (page.path === '/formularios') {
    for (const [groupId, label] of Object.entries(formGroupNames)) {
      const groupForms = forms.filter(form => form.group === groupId).map(form => leaf(form.label, form.path, 'form'));
      if (groupForms.length) children.push({ label, path: '', type: 'form-group', children: groupForms });
    }
  }
  return { label: page.label, path: page.path, type: 'page', children };
}

const modules = GROUP_ORDER.map(group => ({
  label: groupNames[group] ?? group,
  path: '',
  type: 'module',
  children: pages.filter(page => page.group === group).map(pageNode),
})).filter(module => module.children.length);

const topNodes = [
  {
    label: 'Acesso', path: '', type: 'module', children: [
      leaf('Login', '/login', 'system'), leaf('Cadastro', '/signup', 'system'), leaf('Recuperar senha', '/reset-password', 'system'),
    ],
  },
  ...modules,
];

const layout = {
  width: 2450,
  rootX: 72,
  groupX: 272,
  pageX: 660,
  internalX: 1280,
  formGroupX: 1280,
  formX: 1600,
  top: 250,
  row: 39,
  moduleGap: 30,
};

let y = layout.top;
function position(node, depth = 0) {
  node.depth = depth;
  node.y = y;
  if (node.type === 'module' && y !== layout.top) y += layout.moduleGap;
  node.y = y;
  y += layout.row;
  node.children.forEach(child => position(child, depth + 1));
}
topNodes.forEach(node => position(node));
const height = y + 90;

const flat = [];
function collect(node, depth = 0) {
  flat.push({ ...node, depth });
  node.children.forEach(child => collect(child, depth + 1));
}
topNodes.forEach(node => collect(node));

function xFor(node) {
  if (node.type === 'module') return layout.groupX;
  if (node.type === 'form-group') return layout.formGroupX;
  if (node.type === 'form') return layout.formX;
  if (node.type === 'internal') return layout.internalX;
  return layout.pageX;
}

function widthFor(node) {
  if (node.type === 'module') return 330;
  if (node.type === 'form-group') return 290;
  if (node.type === 'form') return 760;
  return 550;
}

const connectors = [];
function lines(parent) {
  const parentX = xFor(parent);
  const parentRight = parentX + widthFor(parent);
  for (const child of parent.children) {
    const childX = xFor(child);
    connectors.push(`<path d="M ${parentRight} ${parent.y + 1} H ${childX - 36} V ${child.y + 1} H ${childX - 17}" class="line line-${child.type}"/>`);
    lines(child);
  }
}
topNodes.forEach(node => {
  connectors.push(`<path d="M ${layout.rootX + 124} 131 H ${layout.groupX - 36} V ${node.y + 1} H ${layout.groupX - 17}" class="line line-module"/>`);
  lines(node);
});

function nodeSvg(node) {
  const x = xFor(node);
  const cls = node.type;
  const path = node.path ? `<tspan class="route">${esc(node.path)}</tspan>` : '';
  return `<g transform="translate(${x},${node.y - 14})" class="node ${cls}">
    <rect width="${widthFor(node)}" height="29" rx="6"/>
    <text x="12" y="19">${esc(node.label)}${path ? `  ${path}` : ''}</text>
  </g>`;
}

const totalPageRoutes = pages.length + forms.length + [...representedInternal].length + 3;
const reportedExceptions = unrepresentedRoutes.filter(path => !['/formularios/almoxarifado-recebimento', '/formularios/logistica-expedicao-relatorio', '/formularios/ssma/rid', '/formularios/ssma/alcoolemia', '/suprimentos/analise-cotacoes', '/suprimentos/diligenciamento', '/almoxarifado/inventario', '/solicitacoes/minhas', '/solicitacoes/todas', '/suprimentos/historico/dashboards', '/suprimentos/demandas', '/suprimentos/importar'].includes(path));

const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${layout.width}" height="${height}" viewBox="0 0 ${layout.width} ${height}">
  <style>
    .bg { fill: #f8fafc; } .title { font: 700 42px Arial, sans-serif; fill: #0f172a; } .subtitle { font: 400 18px Arial, sans-serif; fill: #475569; }
    .summary { font: 600 15px Arial, sans-serif; fill: #0f766e; } .legend { font: 400 13px Arial, sans-serif; fill: #64748b; }
    .line { fill: none; stroke-width: 1.5; stroke-linecap: round; } .line-module { stroke: #0f766e; } .line-page { stroke: #94a3b8; } .line-form-group { stroke: #d97706; } .line-form { stroke: #f59e0b; } .line-internal, .line-system { stroke: #cbd5e1; stroke-dasharray: 3 3; }
    .root rect { fill: #0f766e; } .root text { font: 700 19px Arial, sans-serif; fill: white; } .node text { font: 500 14px Arial, sans-serif; fill: #1e293b; dominant-baseline: middle; } .node .route { font: 400 12px 'Courier New', monospace; fill: #64748b; }
    .module rect { fill: #ccfbf1; stroke: #0f766e; stroke-width: 1.2; } .module text { font-weight: 700; fill: #115e59; } .page rect { fill: #ffffff; stroke: #cbd5e1; } .form-group rect { fill: #ffedd5; stroke: #d97706; } .form-group text { font-weight: 700; fill: #9a3412; } .form rect { fill: #fffbeb; stroke: #fcd34d; } .internal rect, .system rect { fill: #f1f5f9; stroke: #cbd5e1; stroke-dasharray: 4 3; } .internal text, .system text { fill: #475569; }
  </style>
  <rect class="bg" width="100%" height="100%"/>
  <text x="72" y="56" class="title">SISTEN — mapa de módulos e páginas</text>
  <text x="72" y="86" class="subtitle">Árvore de navegação do código • gerado em ${new Date().toLocaleDateString('pt-BR')} • fonte: src/lib/pages.ts + src/App.tsx</text>
  <text x="72" y="113" class="summary">${pages.length} páginas registradas • ${forms.length} formulários • ${[...representedInternal].length} rotas internas • ${totalPageRoutes} destinos mapeados</text>
  <g class="root" transform="translate(${layout.rootX},116)"><rect width="124" height="31" rx="7"/><text x="62" y="20" text-anchor="middle">SISTEN</text></g>
  <text x="72" y="175" class="legend">■ módulo/área  |  □ página de navegação  |  ▧ grupo de formulários  |  ▤ formulário  |  ┄ subrota/tela de sistema</text>
  ${connectors.join('\n  ')}
  ${flat.map(nodeSvg).join('\n  ')}
  <text x="72" y="${height - 35}" class="legend">Critério: páginas do catálogo PAGES, formulários detalhados e subrotas próprias. Aliases/redirecionamentos e abas internas não são duplicados. Rotas de case não representadas por esse critério: ${reportedExceptions.length}.</text>
</svg>`;

writeFileSync(resolve(root, 'docs/mapa-modulos-sisten.svg'), svg, 'utf8');
console.log(`Gerado docs/mapa-modulos-sisten.svg (${pages.length} páginas, ${forms.length} formulários, ${totalPageRoutes} destinos).`);
