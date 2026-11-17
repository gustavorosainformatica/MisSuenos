import crypto from 'node:crypto';
import { get, run } from './db.js';

const DURACAO_MAXIMA_MS = 8 * 60 * 60 * 1000;
const TEMPO_INATIVIDADE_MS = 30 * 60 * 1000;
const COOKIE_PRODUCAO = '__Host-erp_session';
const COOKIE_LOCAL = 'erp_session';

function sha256(valor) {
  return crypto.createHash('sha256').update(valor).digest('hex');
}

function csrfDaSessao(token) {
  return crypto.createHmac('sha256', token).update('erp-csrf-v1').digest('base64url');
}

function compararSeguro(a, b) {
  const bufferA = Buffer.from(String(a || ''));
  const bufferB = Buffer.from(String(b || ''));
  return bufferA.length === bufferB.length && crypto.timingSafeEqual(bufferA, bufferB);
}

export function obterTokenDaRequisicao(req) {
  const cookies = String(req.headers?.cookie || '').split(';');
  for (const parte of cookies) {
    const separador = parte.indexOf('=');
    if (separador < 0) continue;
    const nome = parte.slice(0, separador).trim();
    if (nome === COOKIE_PRODUCAO || nome === COOKIE_LOCAL) {
      try { return decodeURIComponent(parte.slice(separador + 1).trim()); } catch { return null; }
    }
  }
  return null;
}

export async function criarSessao(usuarioId) {
  const agora = Date.now();
  const token = crypto.randomBytes(32).toString('base64url');
  const criadaEm = new Date(agora).toISOString();
  const expiraEm = new Date(agora + DURACAO_MAXIMA_MS).toISOString();

  await run(`
    INSERT INTO sessoes_operadores (usuario_id, token_hash, criada_em, ultima_atividade, expira_em, revogada_em)
    VALUES (?, ?, ?, ?, ?, NULL)
  `, [Number(usuarioId), sha256(token), criadaEm, criadaEm, expiraEm]);

  return { token, csrfToken: csrfDaSessao(token), expiraEm };
}

export async function validarSessaoRequisicao(req) {
  const token = obterTokenDaRequisicao(req);
  if (!token || token.length > 256) return null;

  const tokenHash = sha256(token);
  const sessao = await get(`
    SELECT id, usuario_id, criada_em, ultima_atividade, expira_em, revogada_em
    FROM sessoes_operadores WHERE token_hash = ?
  `, [tokenHash]);
  if (!sessao || sessao.revogada_em) return null;

  const agora = Date.now();
  const expiraEm = Date.parse(sessao.expira_em);
  const ultimaAtividade = Date.parse(sessao.ultima_atividade);
  if (!Number.isFinite(expiraEm) || !Number.isFinite(ultimaAtividade) || agora >= expiraEm || agora - ultimaAtividade >= TEMPO_INATIVIDADE_MS) {
    await run('UPDATE sessoes_operadores SET revogada_em = ? WHERE id = ?', [new Date(agora).toISOString(), sessao.id]);
    return null;
  }

  await run('UPDATE sessoes_operadores SET ultima_atividade = ? WHERE id = ?', [new Date(agora).toISOString(), sessao.id]);
  return {
    id: sessao.id,
    usuarioId: Number(sessao.usuario_id),
    token,
    csrfToken: csrfDaSessao(token),
    expiraEm: sessao.expira_em
  };
}

export async function revogarSessaoRequisicao(req) {
  const token = obterTokenDaRequisicao(req);
  if (!token) return false;
  const resultado = await run(`
    UPDATE sessoes_operadores SET revogada_em = ?
    WHERE token_hash = ? AND revogada_em IS NULL
  `, [new Date().toISOString(), sha256(token)]);
  return resultado.rowsAffected > 0;
}

export function validarTokenCsrf(sessao, tokenCsrf) {
  return !!sessao && compararSeguro(sessao.csrfToken, tokenCsrf);
}

function cookieSeguro(req) {
  return process.env.NODE_ENV === 'production' || req.headers?.['x-forwarded-proto'] === 'https' || !!req.socket?.encrypted;
}

export function definirCookieSessao(res, req, token, maxAgeSegundos = DURACAO_MAXIMA_MS / 1000) {
  const seguro = cookieSeguro(req);
  const nome = seguro ? COOKIE_PRODUCAO : COOKIE_LOCAL;
  const partes = [`${nome}=${encodeURIComponent(token)}`, 'Path=/', 'HttpOnly', 'SameSite=Strict', `Max-Age=${Math.max(0, Math.floor(maxAgeSegundos))}`];
  if (seguro) partes.push('Secure');
  res.setHeader('Set-Cookie', partes.join('; '));
}

export function limparCookieSessao(res) {
  res.setHeader('Set-Cookie', [
    `${COOKIE_LOCAL}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`,
    `${COOKIE_PRODUCAO}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`
  ]);
}

export function duracaoSessaoSegundos() {
  return DURACAO_MAXIMA_MS / 1000;
}
