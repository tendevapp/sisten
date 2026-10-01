# SISTEN — regras do app

Regras que valem para **todo módulo**, novo ou existente. Módulo novo nasce
seguindo; módulo antigo se alinha quando for mexido.

## 1. Foto e câmera sempre comprimem

Qualquer tela que aceite imagem — anexo, upload de galeria ou captura de câmera
— comprime **antes** de subir para o Storage. Nunca suba o arquivo cru da
câmera.

Use o que já existe, não escreva outra compressão:

| Situação | Use |
|---|---|
| API de módulo que sobe direto ao Storage | `comprimirImagemUpload(file)` — `src/lib/imageCompression.ts` |
| Input de anexo na UI (com preview e validação, aceita PDF) | `prepareAttachment(file)` — mesmo arquivo |

Padrão: 1600px no maior lado, JPEG 0,82; devolve o original quando o navegador
não decodifica o formato (HEIC fora do Safari) ou quando comprimir aumentaria o
arquivo. Ajuste os parâmetros pelo segundo argumento se o caso pedir, mas
continue passando pela função única.

**Por quê:** a foto vem de celular em campo (3–8 MB cada). Sem reduzir, anexar
três fotos vira minutos de espera na rede do pátio, e o egress do Supabase paga
a conta.

## 2. Código de registro de formulário: `MODULO-DDMMYY-INDICE`

Todo formulário identifica seus registros nesse formato — sigla do módulo, data
em DDMMYY, índice sequencial com no mínimo dois dígitos.

```
RID-030926-01     ASE-270826-12
```

Implementação única em `src/lib/codigosFormulario.ts`:

- `gerarCodigoFormulario(prefixo, dataISO, indice)` — monta o código;
- `proximoIndiceCodigo(prefixo, codigosExistentes)` — próximo índice a partir do
  que já está gravado;
- `formatarDataDDMMYY(dataISO)` — fatia a string ISO em vez de usar `new Date`,
  porque `new Date('2026-09-01')` volta como 31/08 em UTC-3.

O recorte do índice (reinicia por dia ou por mês) é decisão do módulo — o RID
reinicia por mês. Documente a escolha junto da função que consulta o banco.

Módulos legados com variações próprias (`SUP-DDMMAA-NN`, `ASE-DDMMAA-SETOR`,
protocolos de portaria com sufixo aleatório) **ficam como estão**: o código já
está impresso em registro de produção e renumerar quebraria o histórico.

## 3. Novos módulos: sem liberação padrão geral (nascem desmarcados)

Todo novo módulo, página ou formulário criado no SISTEN **NUNCA** deve nascer
liberado universalmente (`defaultRoles: '*'`).

- Novos módulos devem nascer desmarcados para o público geral (usar `defaultRoles: ['admin']`
  ou `defaultRoles: []`).
- O acesso a novos módulos deve ser concedido de forma granular pelo administrador através
  da **Gestão de Acessos** (`profiles.page_access`) ou atribuído a papéis/setores específicos.
- Princípio do menor privilégio: um colaborador recém-cadastrado só acessa o essencial
  (Início, Solicitações básicas), sem expor novos módulos operacionais automaticamente.

## 4. Banco de dados: uso exclusivo de `supabase-sisten`

O único banco de dados e servidor Supabase permitido e utilizado no SISTEN é o **`supabase-sisten`** (projeto `fwezzgduywgyhxinjurn`).
- É estritamente proibido direcionar comandos, consultas SQL, migrações ou configurações para outros bancos ou servidores MCP (como `supabase-guigo`).
- Todas as ferramentas MCP de banco, consultas, geração de types e edge functions devem utilizar exclusivamente o servidor `supabase-sisten`.

## Verificação antes de entregar

```bash
npx tsc --noEmit     # o repo tem erros pré-existentes; não introduza novos
npx vitest run
```
