/**
 * Módulo de Armazenamento de Arquivos: Cloudflare R2 / Fallback Local
 * Autor: Gustavo Rosa Informática
 * 
 * Funcionalidade:
 * - Se as credenciais do Cloudflare R2 estiverem configuradas no .env:
 *   Faz upload diretamente para o Cloudflare R2 (API S3 global, 10 GB gratuitos, zero egress).
 * - Se não estiverem configuradas:
 *   Salva no diretório local public/uploads/ (modo desenvolvimento/offline seguro).
 * 
 * Suporta: Imagens de produtos, fotos de couros/loncas, ordens de serviço e PDFs de notas fiscais.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BASE_DIR = path.join(__dirname, '..');
const LOCAL_UPLOADS_DIR = path.join(BASE_DIR, 'public', 'uploads');

// Garante que a pasta de uploads local exista
if (!fs.existsSync(LOCAL_UPLOADS_DIR)) {
  fs.mkdirSync(LOCAL_UPLOADS_DIR, { recursive: true });
}

// Tenta carregar .env se existir
try {
  const envPath = path.join(BASE_DIR, '.env');
  if (fs.existsSync(envPath)) {
    const dotenv = await import('dotenv');
    dotenv.config({ path: envPath });
  }
} catch {
  // Ignora se dotenv não estiver carregado
}

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || 'missuenos-storage';
const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL || ''; // Ex: https://pub-xxxx.r2.dev ou https://midia.missuenos.com.br

let s3Client = null;
let isR2Configurado = false;

if (R2_ACCOUNT_ID && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY) {
  try {
    const { S3Client } = await import('@aws-sdk/client-s3');
    s3Client = new S3Client({
      region: 'auto',
      endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: R2_ACCESS_KEY_ID,
        secretAccessKey: R2_SECRET_ACCESS_KEY
      }
    });
    isR2Configurado = true;
    console.log(`[STORAGE] Conectado ao Cloudflare R2 | Bucket: ${R2_BUCKET_NAME}`);
  } catch (err) {
    console.warn('[STORAGE AVISO] Falha ao inicializar cliente R2, usando fallback local:', err.message);
  }
} else {
  console.log('[STORAGE] Credenciais R2 não informadas. Operando com armazenamento local em /public/uploads/');
}

/**
 * Normaliza o nome do arquivo para padrão seguro
 */
function sanitizarNomeArquivo(nomeOriginal) {
  const ext = path.extname(nomeOriginal).toLowerCase();
  const base = path.basename(nomeOriginal, ext)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // remove acentos
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, 40);
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
  return `${base}_${timestamp}_${random}${ext}`;
}

/**
 * Faz upload de um arquivo para o Cloudflare R2 ou para o disco local
 * @param {Object} params
 * @param {Buffer|Uint8Array} params.buffer Conteúdo do arquivo
 * @param {string} params.nomeOriginal Nome original do arquivo
 * @param {string} params.mimetype Tipo MIME (ex: image/jpeg, application/pdf)
 * @param {string} [params.pasta] Subpasta lógica (ex: 'couros', 'ordens', 'produtos', 'nfe')
 * @returns {Promise<{ url: string, key: string, tamanho: number, provedor: string }>}
 */
export async function salvarArquivo({ buffer, nomeOriginal, mimetype = 'application/octet-stream', pasta = 'geral' }) {
  const nomeSanitizado = sanitizarNomeArquivo(nomeOriginal);
  const key = `${pasta}/${nomeSanitizado}`;
  const tamanho = buffer.length;

  if (isR2Configurado && s3Client) {
    try {
      const { PutObjectCommand } = await import('@aws-sdk/client-s3');
      await s3Client.send(new PutObjectCommand({
        Bucket: R2_BUCKET_NAME,
        Key: key,
        Body: buffer,
        ContentType: mimetype
      }));

      let urlFinal = '';
      if (R2_PUBLIC_URL) {
        urlFinal = `${R2_PUBLIC_URL.replace(/\/+$/, '')}/${key}`;
      } else {
        // Gera URL pré-assinada de leitura válida por 7 dias se o bucket for privado
        const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner');
        const { GetObjectCommand } = await import('@aws-sdk/client-s3');
        urlFinal = await getSignedUrl(s3Client, new GetObjectCommand({
          Bucket: R2_BUCKET_NAME,
          Key: key
        }), { expiresIn: 60 * 60 * 24 * 7 });
      }

      console.log(`[STORAGE R2] Upload concluído: ${key} (${(tamanho / 1024).toFixed(1)} KB)`);
      return {
        url: urlFinal,
        key: key,
        tamanho: tamanho,
        provedor: 'CLOUDFLARE_R2',
        nomeArquivo: nomeSanitizado,
        mimetype: mimetype
      };
    } catch (err) {
      console.error('[STORAGE R2 ERRO] Falha no upload para R2, salvando localmente como fallback:', err.message);
    }
  }

  // Fallback Local (public/uploads/[pasta])
  const pastaLocal = path.join(LOCAL_UPLOADS_DIR, pasta);
  if (!fs.existsSync(pastaLocal)) {
    fs.mkdirSync(pastaLocal, { recursive: true });
  }

  const caminhoCompleto = path.join(pastaLocal, nomeSanitizado);
  fs.writeFileSync(caminhoCompleto, buffer);

  const urlLocal = `/uploads/${pasta}/${nomeSanitizado}`;
  console.log(`[STORAGE LOCAL] Arquivo salvo em disco: ${urlLocal} (${(tamanho / 1024).toFixed(1)} KB)`);

  return {
    url: urlLocal,
    key: key,
    tamanho: tamanho,
    provedor: 'LOCAL',
    nomeArquivo: nomeSanitizado,
    mimetype: mimetype
  };
}

/**
 * Deleta um arquivo do storage
 */
export async function deletarArquivo(key) {
  if (isR2Configurado && s3Client) {
    try {
      const { DeleteObjectCommand } = await import('@aws-sdk/client-s3');
      await s3Client.send(new DeleteObjectCommand({
        Bucket: R2_BUCKET_NAME,
        Key: key
      }));
      console.log(`[STORAGE R2] Arquivo deletado: ${key}`);
      return true;
    } catch (err) {
      console.error('[STORAGE R2 ERRO] Falha ao deletar no R2:', err.message);
    }
  }

  // Se for local
  const caminhoLocal = path.join(LOCAL_UPLOADS_DIR, ...key.split('/'));
  if (fs.existsSync(caminhoLocal)) {
    fs.unlinkSync(caminhoLocal);
    console.log(`[STORAGE LOCAL] Arquivo local deletado: ${key}`);
    return true;
  }

  return false;
}

/**
 * Retorna o status atual do provedor de storage
 */
export function getStorageStatus() {
  return {
    provedor: isR2Configurado ? 'CLOUDFLARE_R2' : 'LOCAL',
    bucket: isR2Configurado ? R2_BUCKET_NAME : null,
    pastaLocal: LOCAL_UPLOADS_DIR,
    r2Configurado: isR2Configurado,
    urlPublica: R2_PUBLIC_URL || null
  };
}
