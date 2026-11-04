/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Copia uma imagem (por URL) para a área de transferência — o comprador cola a
 * foto do item direto no e-mail ou WhatsApp da cotação.
 *
 * O clipboard só aceita `image/png` de forma confiável, e as fotos do SISTEN
 * são JPEG comprimido; por isso converte num canvas antes de escrever.
 */

function converterParaPng(blob: Blob): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objUrl = URL.createObjectURL(blob);
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      URL.revokeObjectURL(objUrl);
      if (!ctx) { reject(new Error('sem contexto 2d')); return; }
      ctx.drawImage(img, 0, 0);
      canvas.toBlob(b => (b ? resolve(b) : reject(new Error('toBlob falhou'))), 'image/png');
    };
    img.onerror = () => { URL.revokeObjectURL(objUrl); reject(new Error('falha ao decodificar imagem')); };
    img.src = objUrl;
  });
}

/** Lança erro quando o navegador não deixa copiar — quem chama avisa o usuário. */
export async function copiarImagemParaAreaDeTransferencia(url: string): Promise<void> {
  if (typeof ClipboardItem === 'undefined' || !navigator.clipboard?.write) {
    throw new Error('Este navegador não permite copiar imagem.');
  }
  const blob = await (await fetch(url)).blob();
  const png = blob.type === 'image/png' ? blob : await converterParaPng(blob);
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]);
}
