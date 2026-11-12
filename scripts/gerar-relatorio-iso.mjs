/**
 * Gerador do Relatório de Melhorias SISTEN para Auditoria ISO
 * Gera:
 * 1. docs/relatorio-melhorias-sisten-iso.html (Relatório completo A4 estilizadíssimo)
 * 2. docs/relatorio-melhorias-sisten-iso.pdf (Documento PDF oficial via Edge Headless)
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { execSync } from 'node:child_process';

const root = process.cwd();

// Função para converter imagem em Base64 Data URI
function getBase64Image(relativePath) {
  const fullPath = resolve(root, relativePath);
  if (!existsSync(fullPath)) {
    console.warn(`Imagem não encontrada: ${relativePath}`);
    return '';
  }
  const ext = relativePath.split('.').pop().toLowerCase();
  const mimeType = ext === 'png' ? 'image/png' : ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : 'image/png';
  const buffer = readFileSync(fullPath);
  return `data:${mimeType};base64,${buffer.toString('base64')}`;
}

console.log('Carregando capturas de tela dos módulos de alto impacto...');
const imgInicio = getBase64Image('docs/manual/images/02_inicio.png');
const imgCentralSol = getBase64Image('docs/manual/images/05_central_solicitacoes.png');
const imgRastreio = getBase64Image('docs/manual/images/06_rastreio_compras.png');
const imgCatalogo = getBase64Image('docs/manual/images/03_catalogo_sap.png');
const imgFormsHub = getBase64Image('docs/manual/images/07_formularios_hub.png');
const imgSsmaHub = getBase64Image('docs/manual/images/08_formulario_ssma.png');
const imgSsmaRid = getBase64Image('docs/manual/images/09_formulario_rid.png');
const imgAlmoxPlanta = getBase64Image('docs/almoxarifado/planta-baixa-almoxarifado.png');
const imgTrilhaTrein = getBase64Image('docs/manual/images/10_trilha_treinamento.png');

console.log('Imagens processadas com sucesso.');

const htmlContent = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>SISTEN — Relatório de Melhorias por Setor e Evidências ISO</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;600&display=swap');

    :root {
      --primary: #0047AB;
      --primary-dark: #002D72;
      --primary-light: #EFF6FF;
      --navy: #0F172A;
      --accent: #0284C7;
      --accent-light: #E0F2FE;
      --success: #059669;
      --success-light: #ECFDF5;
      --warning: #D97706;
      --warning-light: #FFFBEB;
      --danger: #DC2626;
      --danger-light: #FEF2F2;
      --purple: #7C3AED;
      --purple-light: #F5F3FF;
      --slate-50: #F8FAFC;
      --slate-100: #F1F5F9;
      --slate-200: #E2E8F0;
      --slate-300: #CBD5E1;
      --slate-600: #475569;
      --slate-800: #1E293B;
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      color: var(--slate-800);
      background-color: #525659;
      line-height: 1.45;
      font-size: 11.5px;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }

    /* Container de Página A4 */
    .page {
      background: white;
      width: 210mm;
      min-height: 297mm;
      margin: 15px auto;
      padding: 16mm 16mm 18mm 16mm;
      position: relative;
      box-shadow: 0 4px 20px rgba(0,0,0,0.25);
      page-break-after: always;
      break-after: page;
    }

    @media print {
      body {
        background: transparent;
      }
      .page {
        margin: 0;
        width: 100%;
        min-height: 100vh;
        box-shadow: none;
        padding: 14mm 14mm 16mm 14mm;
        page-break-after: always;
        break-after: page;
      }
      @page {
        size: A4 portrait;
        margin: 0;
      }
    }

    /* Cabeçalho da Página */
    .page-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 2px solid var(--primary);
      padding-bottom: 6px;
      margin-bottom: 14px;
      font-size: 8.5px;
      color: var(--slate-600);
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .page-header .brand {
      display: flex;
      align-items: center;
      gap: 6px;
      color: var(--primary-dark);
      font-weight: 800;
      font-size: 10px;
    }

    .page-header .brand-badge {
      background: var(--primary);
      color: white;
      padding: 2px 6px;
      border-radius: 4px;
      font-weight: 700;
      font-size: 9px;
      letter-spacing: 0.5px;
    }

    /* Rodapé da Página */
    .page-footer {
      position: absolute;
      bottom: 10mm;
      left: 16mm;
      right: 16mm;
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-top: 1px solid var(--slate-200);
      padding-top: 6px;
      font-size: 8px;
      color: var(--slate-600);
    }

    .page-footer .confidential {
      font-weight: 600;
      color: var(--slate-600);
    }

    /* Capa Exclusiva */
    .cover-page {
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      background: linear-gradient(135deg, #0A192F 0%, #002D72 50%, #0047AB 100%);
      color: white;
      padding: 25mm 20mm;
    }

    .cover-top {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
    }

    .cover-logo-ten {
      font-size: 24px;
      font-weight: 900;
      letter-spacing: 1px;
      color: #FFFFFF;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .cover-logo-ten span {
      color: #38BDF8;
    }

    .cover-tag-group {
      text-align: right;
    }

    .cover-tag {
      display: inline-block;
      background: rgba(255, 255, 255, 0.15);
      backdrop-filter: blur(8px);
      padding: 4px 12px;
      border-radius: 20px;
      font-size: 9px;
      font-weight: 600;
      letter-spacing: 0.8px;
      text-transform: uppercase;
      border: 1px solid rgba(255, 255, 255, 0.25);
    }

    .cover-title-box {
      margin-top: 40px;
      margin-bottom: 40px;
    }

    .cover-subtitle-pill {
      display: inline-block;
      background: #0284C7;
      color: white;
      font-size: 9px;
      font-weight: 700;
      padding: 4px 10px;
      border-radius: 4px;
      text-transform: uppercase;
      letter-spacing: 1px;
      margin-bottom: 14px;
    }

    .cover-main-title {
      font-size: 32px;
      font-weight: 800;
      line-height: 1.15;
      letter-spacing: -0.5px;
      margin-bottom: 12px;
      color: #FFFFFF;
    }

    .cover-desc {
      font-size: 13.5px;
      line-height: 1.5;
      color: #CBD5E1;
      max-width: 90%;
      font-weight: 300;
    }

    .cover-standards {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 10px;
      margin-top: 25px;
    }

    .standard-card {
      background: rgba(255, 255, 255, 0.08);
      border: 1px solid rgba(255, 255, 255, 0.2);
      border-radius: 8px;
      padding: 10px 8px;
      text-align: center;
    }

    .standard-card .iso-code {
      font-size: 12px;
      font-weight: 800;
      color: #38BDF8;
      margin-bottom: 2px;
    }

    .standard-card .iso-name {
      font-size: 8px;
      color: #E2E8F0;
      text-transform: uppercase;
      letter-spacing: 0.4px;
      font-weight: 500;
    }

    .cover-meta {
      background: rgba(0, 0, 0, 0.3);
      border-radius: 8px;
      padding: 14px 18px;
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 15px;
      border: 1px solid rgba(255, 255, 255, 0.1);
      font-size: 9px;
    }

    .cover-meta-item label {
      display: block;
      color: #94A3B8;
      font-size: 7.5px;
      text-transform: uppercase;
      font-weight: 700;
      margin-bottom: 3px;
    }

    .cover-meta-item div {
      font-weight: 600;
      color: #FFFFFF;
    }

    /* Tipografia e Títulos de Seção */
    h1.sec-title {
      font-size: 15px;
      font-weight: 800;
      color: var(--primary-dark);
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 10px;
      padding-bottom: 4px;
      border-bottom: 1.5px solid var(--slate-200);
    }

    h1.sec-title .num-badge {
      background: var(--primary);
      color: white;
      font-size: 10px;
      padding: 2px 7px;
      border-radius: 4px;
      font-weight: 700;
    }

    h2.sub-title {
      font-size: 11.5px;
      font-weight: 700;
      color: var(--navy);
      margin: 10px 0 6px 0;
      display: flex;
      align-items: center;
      gap: 6px;
    }

    p {
      margin-bottom: 7px;
      color: #334155;
      text-align: justify;
    }

    /* Cards e Callouts */
    .callout {
      padding: 8px 12px;
      border-radius: 6px;
      margin-bottom: 9px;
      font-size: 10px;
      line-height: 1.45;
      border-left: 3.5px solid;
    }

    .callout-info {
      background: var(--primary-light);
      border-color: var(--primary);
      color: #1E3A8A;
    }

    .callout-success {
      background: var(--success-light);
      border-color: var(--success);
      color: #065F46;
    }

    .callout-warning {
      background: var(--warning-light);
      border-color: var(--warning);
      color: #92400E;
    }

    .callout-purple {
      background: var(--purple-light);
      border-color: var(--purple);
      color: #5B21B6;
    }

    /* Big Numbers / Métricas */
    .metric-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 8px;
      margin-bottom: 12px;
    }

    .metric-card {
      background: var(--slate-50);
      border: 1px solid var(--slate-200);
      border-radius: 6px;
      padding: 8px 10px;
      text-align: center;
    }

    .metric-card.accent {
      background: var(--primary-light);
      border-color: #BFDBFE;
    }

    .metric-value {
      font-size: 18px;
      font-weight: 800;
      color: var(--primary);
      line-height: 1.1;
      margin-bottom: 3px;
    }

    .metric-label {
      font-size: 8px;
      font-weight: 600;
      color: var(--slate-600);
      text-transform: uppercase;
      letter-spacing: 0.3px;
    }

    /* Tabelas Corporativas */
    table.data-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 10px;
      font-size: 9px;
    }

    table.data-table th {
      background: var(--slate-100);
      color: var(--navy);
      font-weight: 700;
      text-align: left;
      padding: 5px 8px;
      border: 1px solid var(--slate-200);
      text-transform: uppercase;
      font-size: 8px;
      letter-spacing: 0.4px;
    }

    table.data-table td {
      padding: 5px 8px;
      border: 1px solid var(--slate-200);
      vertical-align: top;
    }

    table.data-table tr:nth-child(even) td {
      background: #FAFAFC;
    }

    .code-tag {
      font-family: 'JetBrains Mono', monospace;
      font-size: 8.5px;
      background: #E2E8F0;
      padding: 1px 4px;
      border-radius: 3px;
      font-weight: 600;
      color: #1E293B;
      display: inline-block;
    }

    .iso-pill {
      font-size: 7.5px;
      font-weight: 700;
      background: #DCFCE7;
      color: #166534;
      padding: 1px 5px;
      border-radius: 3px;
      display: inline-block;
      white-space: nowrap;
    }

    /* Imagens e Capturas de Tela */
    .figure-box {
      background: var(--slate-50);
      border: 1px solid var(--slate-200);
      border-radius: 6px;
      padding: 6px;
      margin: 8px 0 10px 0;
      text-align: center;
    }

    .figure-box img {
      max-width: 100%;
      height: auto;
      border-radius: 4px;
      box-shadow: 0 1px 5px rgba(0,0,0,0.1);
      border: 1px solid var(--slate-200);
      display: block;
      margin: 0 auto;
    }

    .figure-caption {
      font-size: 8px;
      color: var(--slate-600);
      font-weight: 600;
      margin-top: 5px;
      text-align: center;
      letter-spacing: 0.2px;
    }

    .figure-caption strong {
      color: var(--primary-dark);
    }

    /* Layout 2 Colunas */
    .two-cols {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
      align-items: start;
    }

    .sector-badge {
      background: #0284C7;
      color: white;
      font-size: 8.5px;
      font-weight: 700;
      padding: 2px 8px;
      border-radius: 4px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 6px;
      display: inline-block;
    }

    .badge-iso {
      background: #10B981;
      color: white;
      font-size: 8px;
      font-weight: 700;
      padding: 2px 6px;
      border-radius: 3px;
      letter-spacing: 0.4px;
    }

    .list-checks {
      list-style: none;
      margin: 5px 0 8px 0;
      padding: 0;
    }

    .list-checks li {
      position: relative;
      padding-left: 14px;
      margin-bottom: 3px;
      font-size: 9.5px;
      color: #334155;
    }

    .list-checks li::before {
      content: '✓';
      position: absolute;
      left: 0;
      color: var(--success);
      font-weight: 800;
      font-size: 10px;
    }
  </style>
</head>
<body>

  <!-- ==================== PÁGINA 1: CAPA OFICIAL ISO ==================== -->
  <div class="page cover-page">
    <div class="cover-top">
      <div class="cover-logo-ten">
        TEN<span>.</span> SISTEN
      </div>
      <div class="cover-tag-group">
        <div class="cover-tag">Relatório Executivo de Auditoria</div>
        <div style="font-size: 8px; color: #94A3B8; margin-top: 4px; text-transform: uppercase;">Complexo Industrial Jacobina / BA</div>
      </div>
    </div>

    <div class="cover-title-box">
      <div class="cover-subtitle-pill">Evidências de Conformidade Normativa & Governança Operacional</div>
      <h1 class="cover-main-title">Relatório de Melhorias por Setor a partir do SISTEN</h1>
      <p class="cover-desc">
        Mapeamento estruturado das inovações de processos, digitalização de formulários regulamentados, 
        eliminação de controles paralelos e consolidação da rastreabilidade sistêmica nos setores 
        produtivos, administrativos e de suporte da <strong>Torres Eólicas do Nordeste S.A.</strong>
      </p>

      <div class="cover-standards">
        <div class="standard-card">
          <div class="iso-code">ISO 9001:2015</div>
          <div class="iso-name">Gestão da Qualidade & Rastreabilidade</div>
        </div>
        <div class="standard-card">
          <div class="iso-code">ISO 14001:2015</div>
          <div class="iso-name">Gestão Ambiental & Zero Papel</div>
        </div>
        <div class="standard-card">
          <div class="iso-code">ISO 45001:2018</div>
          <div class="iso-name">Saúde & Segurança Ocupacional</div>
        </div>
        <div class="standard-card">
          <div class="iso-code">ISO/IEC 27001</div>
          <div class="iso-name">Segurança da Informação & SoD</div>
        </div>
      </div>
    </div>

    <div class="cover-meta">
      <div class="cover-meta-item">
        <label>Organização & Planta</label>
        <div>Torres Eólicas do Nordeste S.A. (TEN)</div>
      </div>
      <div class="cover-meta-item">
        <label>Sistema Avaliado</label>
        <div>SISTEN (Sistema de Informação TEN) v1.0.1</div>
      </div>
      <div class="cover-meta-item">
        <label>Data & Emissão</label>
        <div>Novembro / 2026 — Rev. 01</div>
      </div>
      <div class="cover-meta-item">
        <label>Escopo Auditado</label>
        <div>14 Grupos Modulares e 20+ Formulários ISO</div>
      </div>
      <div class="cover-meta-item">
        <label>Integração de Base</label>
        <div>SAP ERP (ME5A, ZL0132, ME3N, FBL1N, ZL0024)</div>
      </div>
      <div class="cover-meta-item">
        <label>Base de Dados Exclusiva</label>
        <div>PostgreSQL 17 (supabase-sisten)</div>
      </div>
    </div>
  </div>

  <!-- ==================== PÁGINA 2: SUMÁRIO EXECUTIVO & ARQUITETURA ==================== -->
  <div class="page">
    <div class="page-header">
      <div class="brand"><span class="brand-badge">SISTEN</span> Torres Eólicas do Nordeste S.A.</div>
      <div>DOC-TEN-SISTEN-ISO-2026 | Página 2</div>
    </div>

    <h1 class="sec-title"><span class="num-badge">1</span> Sumário Executivo & Objetivos Estratégicos</h1>

    <p>
      O <strong>SISTEN (Sistema de Informação TEN)</strong> foi concebido e implantado como a espinha dorsal de transformação digital e governança corporativa da Torres Eólicas do Nordeste S.A., em Jacobina/BA. Historicamente, a gestão de demandas industriais, suprimentos, manutenção, portaria, qualidade e segurança dependia de dezenas de planilhas locais dispersas, pastas físicas de papel e mensagens informais, gerando riscos de perda de rastreabilidade, assimetria de informações e defasagem em relação ao ERP SAP.
    </p>

    <div class="metric-grid">
      <div class="metric-card accent">
        <div class="metric-value">100%</div>
        <div class="metric-label">Rastreabilidade em Nuvem</div>
      </div>
      <div class="metric-card">
        <div class="metric-value">+20</div>
        <div class="metric-label">Formulários Padronizados</div>
      </div>
      <div class="metric-card">
        <div class="metric-value">0%</div>
        <div class="metric-label">Uso de Papel nos Fluxos</div>
      </div>
      <div class="metric-card accent">
        <div class="metric-value">4 Normas</div>
        <div class="metric-label">Aderência ISO Plena</div>
      </div>
    </div>

    <div class="callout callout-info">
      <strong>Propósito perante a Auditoria ISO:</strong> Demonstrar formalmente aos auditores líderes que o SISTEN atende com precisão matemática aos requisitos de <em>Informação Documentada</em> (Cláusula 7.5), <em>Controle de Processos Providos Externamente</em> (Cláusula 8.4), <em>Identificação e Rastreabilidade</em> (Cláusula 8.5.2) e <em>Não Conformidade e Ação Corretiva</em> (Cláusula 10.2).
    </div>

    <h1 class="sec-title"><span class="num-badge">2</span> Arquitetura de Governança, Segurança e SoD (ISO 27001)</h1>

    <p>
      A infraestrutura do SISTEN foi arquitetada com estrita observância à segregação de funções (Segregation of Duties - SoD), autenticação segura e trilha de auditoria completa:
    </p>

    <ul class="list-checks">
      <li><strong>Matriz de Controle de Acesso Baseada em Papéis (RBAC):</strong> Cada usuário possui atribuições estritas (<code>requisitante</code>, <code>gestor</code>, <code>comprador</code>, <code>coordenador_suprimentos</code>, <code>atendente</code>, <code>admin</code>), impedindo que quem solicita aprove ou emita o pedido de compra correspondente.</li>
      <li><strong>Trilha de Auditoria Transacional Imutável (<code>activity_log</code>):</strong> Todas as operações sensíveis (aprovações, rejeições, alterações de status, importações de base e cadastros) registram automaticamente carimbo UTC de servidor, IP de origem e chave criptográfica do operador.</li>
      <li><strong>Resiliência Offline-First para Chão de Fábrica:</strong> As rotinas de inspeção de campo (SSMA, Qualidade e Portaria) contam com cache local IndexedDB e sincronização em segundo plano, evitando paralisação operacional em áreas sem cobertura de Wi-Fi industrial.</li>
      <li><strong>Compressão Client-Side Inteligente de Evidências (<code>imageCompression.ts</code>):</strong> Registros fotográficos de desvios, notas e avarias são comprimidos a 1600px / 0,82 JPEG no navegador do dispositivo antes do envio ao storage, poupando tráfego e garantindo nitidez para auditoria.</li>
    </ul>

    <div class="figure-box">
      <img src="${imgInicio}" alt="Dashboard Executivo SISTEN" style="max-height: 180px;">
      <div class="figure-caption"><strong>Figura 1:</strong> Painel de Início do SISTEN — Visão unificada com indicadores executivos, atalhos rápidos e governança de processos em tempo real.</div>
    </div>

    <div class="page-footer">
      <span class="confidential">CONFIDENCIAL — Torres Eólicas do Nordeste S.A. | Apresentação em Auditoria ISO</span>
      <span>Relatório Sistêmico de Melhorias</span>
    </div>
  </div>

  <!-- ==================== PÁGINA 3: ALMOXARIFADO ==================== -->
  <div class="page">
    <div class="page-header">
      <div class="brand"><span class="brand-badge">SISTEN</span> Torres Eólicas do Nordeste S.A.</div>
      <div>DOC-TEN-SISTEN-ISO-2026 | Página 3</div>
    </div>

    <div class="sector-badge">Setor Auditado: Almoxarifado & Gestão de Materiais</div>
    <span class="badge-iso" style="margin-left: 6px;">ISO 9001: 7.1.5, 8.5.2, 8.5.4 | AUASB ASA 501</span>

    <h1 class="sec-title"><span class="num-badge">3.1</span> Setor Almoxarifado: Módulos do Sistema e Formulários Oficiais</h1>

    <p>
      O Almoxarifado da TEN passou por uma completa reestruturação operacional com o SISTEN. O setor centraliza o recebimento de matérias-primas críticas para as torres eólicas, custódia de itens consumíveis ZL0024, expedição interna e controle de inventário físico.
    </p>

    <div class="two-cols">
      <div>
        <h2 class="sub-title">1. Módulos Operacionais do Sistema</h2>
        <ul class="list-checks">
          <li><strong>Estoque ZL0024 Valorizado:</strong> Posição física e contábil em tempo real cruzada com a última compra (<code>vw_estoque_analise</code>).</li>
          <li><strong>Movimentações MB51:</strong> Diagnóstico automatizado de giro, idade do estoque, itens obsoletos e alertas de consumo de segurança.</li>
          <li><strong>Controle de Estoque & Dossiê:</strong> Parâmetros globais de reposição e exceções configuráveis por material.</li>
          <li><strong>Inventário Cíclico Avançado:</strong> Contagem cega 80/20 com suporte a 3 etapas de contagem, reserva concorrente transacional no banco e registro obrigatório de causa raiz de divergência.</li>
          <li><strong>Módulo Projetos & BOM de Torres:</strong> Rastreabilidade da estrutura de produto das torres (BOM, painéis, pré-montagem e sobressalentes).</li>
          <li><strong>Gemba 3D Virtual:</strong> Mapeamento espacial tridimensional do armazém e localização exata das estantes.</li>
        </ul>
      </div>

      <div>
        <h2 class="sub-title">2. Formulários Oficiais Padronizados</h2>
        <ul class="list-checks">
          <li><span class="code-tag">FRM.ALM-0001</span> <strong>Recebimento Físico, Ficha Cega e NCR:</strong> Conferência de volumes, notas fiscais, fotos de avaria de carga e emissão de relatório de não conformidade de fornecedor.</li>
          <li><span class="code-tag">FRM.ALM-0014</span> <strong>Requisição no Balcão:</strong> Retirada de estoque ZL0024 com leitura rápida de QR Code, identificação do colaborador, finalidade e assinatura eletrônica.</li>
          <li><span class="code-tag">FRM.ALM-0013</span> <strong>Solicitação Extraordinária:</strong> Saída de materiais estruturais críticos antes do lançamento da NF no SAP, com justificativa e regularização posterior.</li>
          <li><span class="code-tag">FRM.ALM-0015</span> <strong>Inventário Cíclico Digital:</strong> Interface de contagem cega com validação instantânea contra o saldo de corte da ZL0024.</li>
          <li><span class="code-tag">FRM.ALM-0016</span> <strong>Cadastro de Itens:</strong> Padronização técnica de especificações, Nível 1/2 e fotos para catálogo de compras.</li>
        </ul>
      </div>
    </div>

    <div class="callout callout-success" style="margin-top: 6px;">
      <strong>Conformidade ISO 9001 (Preservação e Rastreabilidade):</strong> A eliminação de requisições em papel e a implementação da <em>Requisição no Balcão com QR Code</em> erradicaram retiradas informais sem baixa contábil. A acuracidade do estoque físico versus SAP atingiu níveis históricos auditáveis.
    </div>

    <div class="figure-box">
      <img src="${imgAlmoxPlanta}" alt="Mapeamento Físico e Gemba do Almoxarifado" style="max-height: 185px;">
      <div class="figure-caption"><strong>Figura 2:</strong> Mapeamento Espacial e Planta Baixa do Almoxarifado — Integração com o Módulo Gemba 3D para endereçamento e inventário cíclico setorial.</div>
    </div>

    <div class="page-footer">
      <span class="confidential">CONFIDENCIAL — Torres Eólicas do Nordeste S.A. | Apresentação em Auditoria ISO</span>
      <span>Relatório Sistêmico de Melhorias</span>
    </div>
  </div>

  <!-- ==================== PÁGINA 4: SUPRIMENTOS & COMPRAS ==================== -->
  <div class="page">
    <div class="page-header">
      <div class="brand"><span class="brand-badge">SISTEN</span> Torres Eólicas do Nordeste S.A.</div>
      <div>DOC-TEN-SISTEN-ISO-2026 | Página 4</div>
    </div>

    <div class="sector-badge">Setor Auditado: Suprimentos, Compras & Fornecedores</div>
    <span class="badge-iso" style="margin-left: 6px;">ISO 9001: 8.4, 8.4.2 | Auditoria Financeira</span>

    <h1 class="sec-title"><span class="num-badge">3.2</span> Setor Suprimentos: Módulos, Auditoria com IPCA e Rastreio</h1>

    <p>
      O setor de Suprimentos opera com integração direta aos dados do SAP ERP (transações ME5A, ZL0132, ME3N e ME3M), garantindo total transparência no ciclo que vai da Requisição Interna (RI) à entrada física do material (MIGO).
    </p>

    <div class="two-cols">
      <div>
        <h2 class="sub-title">1. Módulos do Sistema Suprimentos</h2>
        <ul class="list-checks">
          <li><strong>Central de Compras Unificada:</strong> Fila inteligente de RIs Sem PO e Sem MIGO, agrupadas por comprador e grupo de mercadoria, com edição em lote e histórico de observações.</li>
          <li><strong>Auditoria de Preços com IPCA:</strong> Motor analítico matemático que corrige o histórico de compras pela inflação oficial (IBGE) e calcula quartis (P25, mediana P50 e P75) para blindar contra compras com sobrepreço.</li>
          <li><strong>Gestão de Contratos de Fornecimento:</strong> Monitoramento de saldo financeiro, vigência, alertas de renovação e anexos digitalizados de instrumentos contratuais.</li>
          <li><strong>Estimador Automatizado de Frete:</strong> Simulação tarifária de frete rodoviário por faixa de peso, cubagem e tipo de veículo (Fiorino a Carreta).</li>
          <li><strong>Pendências de Recebimento & RNC:</strong> Tratativa de divergências de entrega apontadas pelo almoxarifado em canal direto com os compradores.</li>
        </ul>
      </div>

      <div>
        <h2 class="sub-title">2. Formulários & Rastreabilidade de Compras</h2>
        <ul class="list-checks">
          <li><span class="code-tag">FRM.SUP-0005</span> <strong>Avaliação de Fornecedores (AVF/OCF):</strong> Homologação, avaliação anual e registro de ocorrências de fornecimento (pontualidade, qualidade e conformidade fiscal).</li>
          <li><strong>Portal Rastreio Compras:</strong> Timeline interativa aberta para todos os solicitantes da fábrica, eliminando cobranças por e-mail e permitindo solicitação formal de prioridade (escala 1 a 5).</li>
          <li><strong>Catálogo SAP Integrado:</strong> Ferramenta unificada de pesquisa no cadastro de materiais de 8 dígitos, impedindo abertura de itens em duplicidade.</li>
        </ul>
      </div>
    </div>

    <div class="figure-box">
      <img src="${imgRastreio}" alt="Rastreio de Compras SISTEN" style="max-height: 180px;">
      <div class="figure-caption"><strong>Figura 3:</strong> Central de Rastreio de Compras — Linha do tempo ponto a ponto de cada requisição interna com lead times e faróis de status.</div>
    </div>

    <div class="figure-box" style="margin-top: 6px;">
      <img src="${imgCatalogo}" alt="Catálogo Padronizado SAP" style="max-height: 140px;">
      <div class="figure-caption"><strong>Figura 4:</strong> Catálogo SAP de Materiais — Padronização de descrições técnicas de engenharia e saneamento de cadastros de itens.</div>
    </div>

    <div class="page-footer">
      <span class="confidential">CONFIDENCIAL — Torres Eólicas do Nordeste S.A. | Apresentação em Auditoria ISO</span>
      <span>Relatório Sistêmico de Melhorias</span>
    </div>
  </div>

  <!-- ==================== PÁGINA 5: SSMA & SAÚDE OCUPACIONAL ==================== -->
  <div class="page">
    <div class="page-header">
      <div class="brand"><span class="brand-badge">SISTEN</span> Torres Eólicas do Nordeste S.A.</div>
      <div>DOC-TEN-SISTEN-ISO-2026 | Página 5</div>
    </div>

    <div class="sector-badge">Setor Auditado: SSMA (Saúde, Segurança e Meio Ambiente)</div>
    <span class="badge-iso" style="margin-left: 6px;">ISO 45001: 6.1.2, 8.1.2 | ISO 14001: 8.2 | NR-06</span>

    <h1 class="sec-title"><span class="num-badge">3.3</span> Setor SSMA: Gestão de Desvios (RID), Alcoolemia e Ficha de EPI</h1>

    <p>
      O setor de SSMA alcançou nível de excelência e rastreabilidade total perante as normas ISO 45001 e ISO 14001 com a digitalização de seus controles operacionais, eliminando completamente fichas físicas de papel e planilhas descentralizadas.
    </p>

    <div class="two-cols">
      <div>
        <h2 class="sub-title">1. Módulos do Sistema SSMA</h2>
        <ul class="list-checks">
          <li><strong>Hub Central SSMA:</strong> Painel de monitoramento proativo de indicadores de segurança, desvios e conformidade ocupacional.</li>
          <li><strong>Relatório Gerencial de Desvios:</strong> Indicadores gráficos de taxa de fechamento de desvios, áreas com maior incidência de condições inseguras e tempo médio de correção.</li>
          <li><strong>Matriz de Risco Ocupacional por Função:</strong> Amarração das exigências de EPI de acordo com a função e o PPRA/PGR vigente na fábrica.</li>
        </ul>
      </div>

      <div>
        <h2 class="sub-title">2. Formulários Oficiais Digitalizados</h2>
        <ul class="list-checks">
          <li><span class="code-tag">FRM.SSMA-0001</span> <strong>RID - Registro de Identificação de Desvio:</strong> Notificação instantânea de atos e condições inseguras com evidência fotográfica, setor, gravidade, causa imediata e plano de ação corretivo com responsável.</li>
          <li><span class="code-tag">FRM.SOC-0042</span> <strong>Alcoolemia & Termo Psicoativo:</strong> Testagem preventiva com bafômetro certificado pelo INMETRO, algoritmo de sorteio aleatório e emissão de termo eletrônico assinado na tela.</li>
          <li><span class="code-tag">FRM.SEG-0008</span> <strong>Ficha de EPI Digital:</strong> Termo de entrega vinculado ao colaborador com controle de CA, histórico de substituições e assinatura digital do funcionário.</li>
        </ul>
      </div>
    </div>

    <div class="figure-box">
      <img src="${imgSsmaRid}" alt="Formulário RID SSMA" style="max-height: 195px;">
      <div class="figure-caption"><strong>Figura 5:</strong> Formulário Oficial FRM.SSMA-0001 (RID) — Registro de desvio com upload de foto, classificação de risco e plano de ação imediato.</div>
    </div>

    <div class="figure-box" style="margin-top: 6px;">
      <img src="${imgSsmaHub}" alt="Hub Central de SSMA" style="max-height: 140px;">
      <div class="figure-caption"><strong>Figura 6:</strong> Hub Operacional de SSMA — Gestão centralizada de termos de responsabilidade de EPI, alcoolemia e segurança ocupacional.</div>
    </div>

    <div class="page-footer">
      <span class="confidential">CONFIDENCIAL — Torres Eólicas do Nordeste S.A. | Apresentação em Auditoria ISO</span>
      <span>Relatório Sistêmico de Melhorias</span>
    </div>
  </div>

  <!-- ==================== PÁGINA 6: QUALIDADE & AUDITORIA DE RNC ==================== -->
  <div class="page">
    <div class="page-header">
      <div class="brand"><span class="brand-badge">SISTEN</span> Torres Eólicas do Nordeste S.A.</div>
      <div>DOC-TEN-SISTEN-ISO-2026 | Página 6</div>
    </div>

    <div class="sector-badge">Setor Auditado: Gestão da Qualidade & Auditoria</div>
    <span class="badge-iso" style="margin-left: 6px;">ISO 9001: 8.7, 9.1, 10.2 (RNC & Ações Corretivas)</span>

    <h1 class="sec-title"><span class="num-badge">3.4</span> Setor Qualidade: Gestão de RNC, Calibração e Checklists</h1>

    <p>
      O módulo de Qualidade do SISTEN atende com precisão cirúrgica aos requisitos da ABNT NBR ISO 9001:2015 no que tange ao tratamento de não conformidades de fornecedores, processos fabris e inspeções de liberação de torres eólicas.
    </p>

    <div class="two-cols">
      <div>
        <h2 class="sub-title">1. Módulos do Sistema de Qualidade</h2>
        <ul class="list-checks">
          <li><strong>Centro de Gestão de RNC (FRM.QUA-0026):</strong> Sistema integrado de abertura, investigação de causa raiz (metodologia dos 5 Porquês / Ishikawa) e planos de ação 5W2H com verificação formal de eficácia.</li>
          <li><strong>Gestão de Equipamentos & Instrumentos de Medição:</strong> Controle rigoroso de calibração periódica (paquímetros, trenas, torquímetros, micrômetros) com alerta automático de vencimento de certificados.</li>
          <li><strong>Painel de Qualidade Fabril:</strong> Monitoramento de índices de retrabalho e desvios dimensionais por posto de trabalho.</li>
        </ul>
      </div>

      <div>
        <h2 class="sub-title">2. Formulários e Checklists Oficiais</h2>
        <ul class="list-checks">
          <li><span class="code-tag">FRM.QUA-0026</span> <strong>Relatório de Não Conformidade (RNC):</strong> Emissão do documento oficial de RNC com anexos fotográficos, parecer do comitê de qualidade e prazos regulamentados.</li>
          <li><strong>Checklist de Inspeção de Expedição:</strong> Verificação dimensional e visual final de tramos de torres antes da liberação para transporte rodoviário.</li>
          <li><strong>Checklist de Internos Mecânicos:</strong> Verificação detalhada de plataformas, escadas, cabos e suportes internos com tolerâncias e fotos comprobatórias.</li>
        </ul>
      </div>
    </div>

    <div class="callout callout-purple" style="margin-top: 8px;">
      <strong>Evidência de Melhoria Contínua (Cláusula 10.2):</strong> A RNC digital não permite o encerramento sem a devida comprovação fotográfica da ação corretiva executada e a assinatura do responsável técnico da Qualidade, garantindo um ciclo PDCA à prova de auditoria.
    </div>

    <h1 class="sec-title" style="margin-top: 15px;"><span class="num-badge">3.5</span> Setor Produção Industrial: Apontamentos e Rastreabilidade</h1>

    <p>
      A fabricação de torres eólicas da TEN envolve processos de alta responsabilidade estrutural. O módulo de Produção migrou e aprimorou o antigo sistema NAV1, unificando os lançamentos de chão de fábrica no SISTEN.
    </p>

    <ul class="list-checks">
      <li><strong>Apontamento das Etapas Críticas:</strong> Lançamento de corte plasma, chanfro, calandra, soldagem longitudinal e circunferencial (arco submerso), montagem de flanges e jateamento/pintura.</li>
      <li><strong>Rastreabilidade Serial de Tramos e Chapas:</strong> Cada tramo de torre possui número de série rastreável, com vínculo à chapa de aço, lote de consumível de solda e operador credenciado.</li>
      <li><strong>Plano de Expedição Sincronizado:</strong> Integração direta entre o avanço da linha fabril e a fila de carregamento de veículos pesados.</li>
    </ul>

    <div class="page-footer">
      <span class="confidential">CONFIDENCIAL — Torres Eólicas do Nordeste S.A. | Apresentação em Auditoria ISO</span>
      <span>Relatório Sistêmico de Melhorias</span>
    </div>
  </div>

  <!-- ==================== PÁGINA 7: PLANEJAMENTO, ENGENHARIA & PORTARIA ==================== -->
  <div class="page">
    <div class="page-header">
      <div class="brand"><span class="brand-badge">SISTEN</span> Torres Eólicas do Nordeste S.A.</div>
      <div>DOC-TEN-SISTEN-ISO-2026 | Página 7</div>
    </div>

    <div class="sector-badge">Setores Auditados: Planejamento, Kaizen, Portaria & Segurança</div>
    <span class="badge-iso" style="margin-left: 6px;">ISO 9001: 7.1.6, 8.5.4, 10.3 | Lean Manufacturing</span>

    <h1 class="sec-title"><span class="num-badge">3.6</span> Setor Planejamento & Engenharia: Gestão à Vista e Kaizen</h1>

    <div class="two-cols">
      <div>
        <h2 class="sub-title">1. Gestão à Vista em Tempo Real</h2>
        <p>
          O módulo de Planejamento gerencia painéis de <em>Acompanhamento Diário para TVs de Chão de Fábrica</em>, expondo metas horárias e produção realizada por turno, alinhando a comunicação entre operadores e a liderança industrial.
        </p>
      </div>
      <div>
        <h2 class="sub-title">2. Formulário Oficial de Inovação</h2>
        <ul class="list-checks">
          <li><span class="code-tag">FRM.ENG-0017</span> <strong>Aqui TEN Melhoria! (Kaizen):</strong> Canal corporativo onde qualquer colaborador registra oportunidades de eliminação de desperdícios Lean, causa raiz, solução implementada e ganhos financeiros obtidos.</li>
        </ul>
      </div>
    </div>

    <h1 class="sec-title" style="margin-top: 15px;"><span class="num-badge">3.7</span> Setor Portaria & Segurança Patrimonial</h1>

    <p>
      A Portaria da TEN controla todo o fluxo de entrada e saída de veículos, carretas de chapas de aço e colaboradores. O módulo de Portaria substituiu livros de ocorrência manuais de papel por uma suíte completa de formulários digitais padronizados.
    </p>

    <table class="data-table">
      <thead>
        <tr>
          <th style="width: 25%;">Código Formulário</th>
          <th style="width: 35%;">Nome & Finalidade</th>
          <th style="width: 40%;">Impacto e Evidência Auditável ISO</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td><span class="code-tag">FRM.SGP-0010</span></td>
          <td><strong>Passagem de Plantão & Ocorrências</strong></td>
          <td>Substituição do livro preto de ocorrências. Registro digital de custódia de materiais e troca de turno da vigilância.</td>
        </tr>
        <tr>
          <td><span class="code-tag">FRM.SGP-0009</span></td>
          <td><strong>Chegada de Transportes</strong></td>
          <td>Controle pontual de ônibus fretados, vans e veículos de passageiros com horários exatos e auditoria de rotas.</td>
        </tr>
        <tr>
          <td><span class="code-tag">FRM.SGP-0011</span></td>
          <td><strong>Equipamentos de Terceiros</strong></td>
          <td>Controle de entrada e saída de ferramentas de prestadores de serviço com fotos e notas, prevenindo perdas patrimoniais.</td>
        </tr>
        <tr>
          <td><span class="code-tag">FRM.SGP-0020</span></td>
          <td><strong>Carretas de Chapas de Aço</strong></td>
          <td>Pesagem na balança, conferência fiscal de notas e romaneios de matéria-prima pesada para a linha de produção.</td>
        </tr>
        <tr>
          <td><span class="code-tag">FRM.SGP-0013</span></td>
          <td><strong>Briefing de Segurança</strong></td>
          <td>Lista de presença eletrônica de integração diária de visitantes e terceiros com assinatura digital.</td>
        </tr>
        <tr>
          <td><span class="code-tag">FRM.SGP-0015</span></td>
          <td><strong>Teste de Alcoolemia (Portaria)</strong></td>
          <td>Triagem preventiva aleatória no acesso ao complexo fabril em conformidade com as diretrizes de segurança da TEN.</td>
        </tr>
      </tbody>
    </table>

    <div class="figure-box">
      <img src="${imgFormsHub}" alt="Hub Central de Formulários Padronizados" style="max-height: 145px;">
      <div class="figure-caption"><strong>Figura 7:</strong> Hub Central de Formulários Padronizados — Governança visual de todos os formulários regulamentados da fábrica divididos por setor.</div>
    </div>

    <div class="page-footer">
      <span class="confidential">CONFIDENCIAL — Torres Eólicas do Nordeste S.A. | Apresentação em Auditoria ISO</span>
      <span>Relatório Sistêmico de Melhorias</span>
    </div>
  </div>

  <!-- ==================== PÁGINA 8: RH, LOGÍSTICA & FACILITIES ==================== -->
  <div class="page">
    <div class="page-header">
      <div class="brand"><span class="brand-badge">SISTEN</span> Torres Eólicas do Nordeste S.A.</div>
      <div>DOC-TEN-SISTEN-ISO-2026 | Página 8</div>
    </div>

    <div class="sector-badge">Setores Auditados: RH & Treinamentos, Logística & Facilities</div>
    <span class="badge-iso" style="margin-left: 6px;">ISO 9001: 7.1.3, 7.2 | ISO 45001: NRs Obrigatórias</span>

    <h1 class="sec-title"><span class="num-badge">3.8</span> Setor Recursos Humanos & Treinamentos (Gente & Gestão)</h1>

    <p>
      O RH opera no SISTEN com gestão integrada de colaboradores, turnos, controle de horas extras e, com grande destaque para a auditoria, a <strong>Matriz de Treinamentos (LNT)</strong> e as inovadoras <strong>Trilhas Gamificadas de Procedimentos Operacionais (POs)</strong>.
    </p>

    <div class="two-cols">
      <div>
        <h2 class="sub-title">1. Matriz de Treinamentos e NRs</h2>
        <ul class="list-checks">
          <li><strong>Matriz LNT:</strong> Levantamento de Necessidades de Treinamento cruzando função versus exigências legais (NR-10, NR-12, NR-33, NR-35).</li>
          <li><strong>Cronograma & Aderência:</strong> Indicadores visuais de colaboradores com treinamentos em dia ou a renovar.</li>
          <li><span class="code-tag">FRM.RHU-0007</span> <strong>ASE - Autorização de Serviços Extraordinários:</strong> Solicitação antecipada de horas extras com justificativa, lista nominal de equipe e aprovação hierárquica.</li>
        </ul>
      </div>

      <div>
        <h2 class="sub-title">2. Inovação: Trilhas Gamificadas de POs</h2>
        <p>
          Os Procedimentos Operacionais (POs) foram transformados em cursos interativos com animações, quizzes com banco de questões aleatórias, feedback imediato e emissão automática de certificados com código de autenticidade para a auditoria.
        </p>
      </div>
    </div>

    <div class="figure-box">
      <img src="${imgTrilhaTrein}" alt="Trilha de Treinamento Gamificada de PO" style="max-height: 165px;">
      <div class="figure-caption"><strong>Figura 8:</strong> Trilha de Treinamento Gamificada de Procedimentos Operacionais (POs) — Capacitação interativa de colaboradores com quizzes e certificados digitais.</div>
    </div>

    <h1 class="sec-title" style="margin-top: 12px;"><span class="num-badge">3.9</span> Setor Logística & Expedição de Tramos</h1>

    <ul class="list-checks">
      <li><span class="code-tag">FRM.LOG-0001</span> <strong>Registro de Expedição de Tramos:</strong> Controle minucioso de horários de chegada de carretas especiais, acoplamento de pranchas, amarração e liberação.</li>
      <li><span class="code-tag">FRM.LOG-0002</span> <strong>Relatório de Lead Time de Expedição:</strong> Monitoramento contínuo de cumprimento do SLA de carregamento de 24 horas, liberação de escolta e batedores rodoviários.</li>
    </ul>

    <h1 class="sec-title" style="margin-top: 12px;"><span class="num-badge">3.10</span> Setor Facilities & Serviços Prediais</h1>

    <p>
      Controle de frotas de veículos leves, rotas otimizadas de transporte fretado e ordens de serviços prediais centralizadas, garantindo conservação de infraestrutura predial conforme requisito 7.1.3 da ISO 9001.
    </p>

    <div class="page-footer">
      <span class="confidential">CONFIDENCIAL — Torres Eólicas do Nordeste S.A. | Apresentação em Auditoria ISO</span>
      <span>Relatório Sistêmico de Melhorias</span>
    </div>
  </div>

  <!-- ==================== PÁGINA 9: FINANCEIRO, HELPDESK & SOLICITAÇÕES ==================== -->
  <div class="page">
    <div class="page-header">
      <div class="brand"><span class="brand-badge">SISTEN</span> Torres Eólicas do Nordeste S.A.</div>
      <div>DOC-TEN-SISTEN-ISO-2026 | Página 9</div>
    </div>

    <div class="sector-badge">Setores Auditados: Financeiro, TI/Helpdesk & Solicitações Corporativas</div>
    <span class="badge-iso" style="margin-left: 6px;">ISO 9001: 7.1.4, 8.4 | Governança Financeira</span>

    <h1 class="sec-title"><span class="num-badge">3.11</span> Setor Financeiro, Contabilidade & Controladoria</h1>

    <p>
      O módulo Financeiro atua na conciliação direta das contas a pagar (extração FBL1N do SAP ERP), assegurando total transparência na aplicação de recursos:
    </p>

    <ul class="list-checks">
      <li><strong>Contas a Pagar & Projeção de Caixa:</strong> Acompanhamento de títulos a vencer e vencidos, com bloqueio/liberação para pagamento e classificação por centro de custo.</li>
      <li><strong>Reconciliação PO x Pgto:</strong> Confronto trilateral automático entre Pedido de Compra (PO), Nota Fiscal emitida e Entrada Física (MIGO).</li>
      <li><strong>Realizado por Rubrica & Faturamento Goldwind:</strong> Confronto Orçado versus Realizado por rubricas orçamentárias e controle de medição do cliente GW Jacobina.</li>
      <li><strong>Compras Mercado Livre:</strong> Gestão de adiantamentos e baixas parciais de compras emergenciais de pequeno valor com comprovação fiscal obrigatória.</li>
    </ul>

    <h1 class="sec-title" style="margin-top: 14px;"><span class="num-badge">3.12</span> Setor TI, Jurídico & Helpdesk Centralizado</h1>

    <p>
      Atendimento unificado a chamados de suporte técnico, manutenção e apoio jurídico, com fila única em estilo Kanban, prazos regulamentados (SLA de primeiro atendimento e resolução) e avaliação formal de satisfação (CSAT). O time Jurídico dispõe de fluxo específico para elaboração e validação de minutas contratuais.
    </p>

    <h1 class="sec-title" style="margin-top: 14px;"><span class="num-badge">3.13</span> Central de Solicitações Corporativas (Portal Unificado)</h1>

    <p>
      A Central de Solicitações é o ponto focal de entrada de todas as demandas da fábrica, unificando três frentes em uma interface moderna: Compras de Materiais, Cadastros no SAP e Chamados de Suporte.
    </p>

    <div class="figure-box">
      <img src="${imgCentralSol}" alt="Central de Solicitações SISTEN" style="max-height: 185px;">
      <div class="figure-caption"><strong>Figura 9:</strong> Central de Solicitações — Fila única corporativa com abas de alçada ("Minhas", "Todas" e "Aprovações") e filtros de busca inteligente.</div>
    </div>

    <div class="page-footer">
      <span class="confidential">CONFIDENCIAL — Torres Eólicas do Nordeste S.A. | Apresentação em Auditoria ISO</span>
      <span>Relatório Sistêmico de Melhorias</span>
    </div>
  </div>

  <!-- ==================== PÁGINA 10: MATRIZ COMPARATIVA ANTES x DEPOIS & CONCLUSÃO ==================== -->
  <div class="page">
    <div class="page-header">
      <div class="brand"><span class="brand-badge">SISTEN</span> Torres Eólicas do Nordeste S.A.</div>
      <div>DOC-TEN-SISTEN-ISO-2026 | Página 10</div>
    </div>

    <h1 class="sec-title"><span class="num-badge">4</span> Matriz de Transformação: Cenário Anterior vs. SISTEN</h1>

    <table class="data-table">
      <thead>
        <tr>
          <th style="width: 18%;">Setor / Processo</th>
          <th style="width: 28%;">Cenário Anterior (Manual/Planilha)</th>
          <th style="width: 32%;">Cenário Atual SISTEN (Digital/Integrado)</th>
          <th style="width: 22%;">Requisito ISO Atendido</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td><strong>Almoxarifado</strong><br><span style="font-size:7.5px; color:#64748B;">Recebimento e Baixas</span></td>
          <td>Controle em papéis físicos sujeitos a perdas. Baixas informais sem registro imediato.</td>
          <td>Ficha cega com fotos (FRM.ALM-0001) e Requisição no Balcão com QR Code (FRM.ALM-0014).</td>
          <td><span class="iso-pill">ISO 9001: 8.5.2, 8.5.4</span></td>
        </tr>
        <tr>
          <td><strong>Almoxarifado</strong><br><span style="font-size:7.5px; color:#64748B;">Inventário Físico</span></td>
          <td>Contagens manuais esparsas sem conciliação estrita com a base ZL0024.</td>
          <td>Inventário cíclico com 3 contagens cegas, reserva concorrente e causa raiz obrigatória.</td>
          <td><span class="iso-pill">AUASB ASA 501 / ISA 501</span></td>
        </tr>
        <tr>
          <td><strong>Suprimentos</strong><br><span style="font-size:7.5px; color:#64748B;">Requisições e RIs</span></td>
          <td>Solicitações por e-mail e formulários físicos. Dificuldade de rastreamento de prazos.</td>
          <td>Fila única ME5A/ZL0132, timeline de rastreio com faróis de lead time e aprovação por setor.</td>
          <td><span class="iso-pill">ISO 9001: 8.4, 7.5</span></td>
        </tr>
        <tr>
          <td><strong>Suprimentos</strong><br><span style="font-size:7.5px; color:#64748B;">Preços de Compra</span></td>
          <td>Comparações pontuais de cotações sem consideração de inflação acumulada.</td>
          <td>Auditoria automatizada com correção monetária IPCA e cálculo de quartis P25/P50/P75.</td>
          <td><span class="iso-pill">Governança & Compliance</span></td>
        </tr>
        <tr>
          <td><strong>SSMA</strong><br><span style="font-size:7.5px; color:#64748B;">Desvios e Ficha EPI</span></td>
          <td>Blocos de papel para RID e fichas manuais de EPI com risco de perda de assinaturas.</td>
          <td>RID digital instantâneo com fotos (FRM.SSMA-0001) e Ficha de EPI com assinatura eletrônica.</td>
          <td><span class="iso-pill">ISO 45001: 6.1.2, 8.1.2</span></td>
        </tr>
        <tr>
          <td><strong>Qualidade</strong><br><span style="font-size:7.5px; color:#64748B;">Gestão de RNCs</span></td>
          <td>Planilhas de RNC desarticuladas do recebimento físico e do comprador.</td>
          <td>Fluxo digital FRM.QUA-0026 com 5 Porquês, 5W2H, evidências e checagem de eficácia.</td>
          <td><span class="iso-pill">ISO 9001: 10.2 (PDCA)</span></td>
        </tr>
        <tr>
          <td><strong>Portaria</strong><br><span style="font-size:7.5px; color:#64748B;">Acesso e Plantão</span></td>
          <td>Livros pretos de ocorrências escritos à mão e fichas de papel na guarita.</td>
          <td>Plataforma digital integrada com 6 formulários padronizados (passagem, carretas, transportes).</td>
          <td><span class="iso-pill">ISO 9001: 7.5 | ISO 27001</span></td>
        </tr>
        <tr>
          <td><strong>RH & Treinamentos</strong><br><span style="font-size:7.5px; color:#64748B;">Capacitação de POs</span></td>
          <td>Treinamentos presenciais tradicionais com baixa comprovação de retenção técnica.</td>
          <td>Trilhas gamificadas de Procedimentos Operacionais com quizzes e certificados digitais.</td>
          <td><span class="iso-pill">ISO 9001: 7.2 (Competência)</span></td>
        </tr>
      </tbody>
    </table>

    <h1 class="sec-title" style="margin-top: 14px;"><span class="num-badge">5</span> Parecer Conclusivo para Auditoria</h1>

    <p>
      A implementação do <strong>SISTEN</strong> consolidou um salto de maturidade operacional na <strong>Torres Eólicas do Nordeste S.A.</strong> A plataforma estabelece conformidade inequívoca com os padrões internacionais das normas ISO 9001, ISO 14001, ISO 45001 e ISO 27001, comprovando governança corporativa, transparência de dados e melhoria contínua dos processos industriais.
    </p>

    <div style="margin-top: 25px; padding-top: 15px; border-top: 1px solid var(--slate-300); display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 20px; text-align: center; font-size: 8.5px;">
      <div>
        <div style="border-bottom: 1px solid var(--slate-400); height: 25px; margin-bottom: 4px;"></div>
        <strong>Coordenação de TI & Sistemas</strong><br>SISTEN Core Team
      </div>
      <div>
        <div style="border-bottom: 1px solid var(--slate-400); height: 25px; margin-bottom: 4px;"></div>
        <strong>Gestão da Qualidade & Auditoria</strong><br>TEN Jacobina / BA
      </div>
      <div>
        <div style="border-bottom: 1px solid var(--slate-400); height: 25px; margin-bottom: 4px;"></div>
        <strong>Diretoria Industrial / Operações</strong><br>Torres Eólicas do Nordeste S.A.
      </div>
    </div>

    <div class="page-footer">
      <span class="confidential">CONFIDENCIAL — Torres Eólicas do Nordeste S.A. | Apresentação em Auditoria ISO</span>
      <span>Relatório Sistêmico de Melhorias</span>
    </div>
  </div>

</body>
</html>
`;

const htmlPath = resolve(root, 'docs/relatorio-melhorias-sisten-iso.html');
const pdfPath = resolve(root, 'docs/relatorio-melhorias-sisten-iso.pdf');

console.log('Gravando documento HTML...');
writeFileSync(htmlPath, htmlContent, 'utf8');
console.log(`HTML gravado com sucesso em: ${htmlPath}`);

console.log('Compilando PDF oficial via Microsoft Edge Headless...');
try {
  const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
  const fileUrl = `file:///${htmlPath.replace(/\\/g, '/')}`;
  const scriptPs = `Start-Process -FilePath "${edgePath}" -ArgumentList @('--headless=new', '--disable-gpu', '--no-pdf-header-footer', '--print-to-pdf=\\"${pdfPath}\\"', '\\"${fileUrl}\\"') -Wait`;
  execSync(`powershell -Command "${scriptPs.replace(/"/g, '\\"')}"`);
  console.log(`PDF compilado com sucesso em: ${pdfPath}`);
} catch (err) {
  console.error('Erro ao compilar PDF:', err);
}
