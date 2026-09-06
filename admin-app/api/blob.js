// Blob 서명 전용 함수 — 파이썬 앱이 발급한 HMAC 티켓을 검증한 뒤에만 presigned URL을 내준다.
// 티켓 형식: base64url(JSON{p:pathname, o:[ops], e:만료(ms), u:사용자}) + '.' + hex(HMAC-SHA256(SESSION_SECRET, base64부))
// t.p가 '/'로 끝나면 접두(prefix) 범위 티켓: 그 아래 모든 경로에 대해 op 수행 가능 (회수기의 list/정리용).
const crypto = require('crypto');
const { issueSignedToken, presignUrl, del, list } = require('@vercel/blob');

const MAX_SIZE = 500 * 1024 * 1024; // 500MB — main.py SUBMIT_MAX_BYTES와 일치

function verifyTicket(ticket) {
  const secret = process.env.SESSION_SECRET;
  if (!secret || typeof ticket !== 'string' || ticket.length > 2000) return null;
  const dot = ticket.lastIndexOf('.');
  if (dot < 0) return null;
  const body = ticket.slice(0, dot);
  const sig = ticket.slice(dot + 1);
  const expect = crypto.createHmac('sha256', secret).update(body).digest('hex');
  if (sig.length !== expect.length ||
      !crypto.timingSafeEqual(Buffer.from(sig, 'utf8'), Buffer.from(expect, 'utf8'))) return null;
  let data;
  try { data = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')); } catch { return null; }
  if (!data || typeof data.p !== 'string' || !Array.isArray(data.o)) return null;
  if (typeof data.e !== 'number' || Date.now() > data.e) return null;
  if (!data.p.startsWith('submissions/') || data.p.includes('..')) return null;
  return data;
}

function scopeAllows(t, pathname) {
  if (typeof pathname !== 'string' || pathname.includes('..')) return false;
  if (t.p === pathname) return true;
  return t.p.endsWith('/') && pathname.startsWith(t.p);
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.status(405).json({ error: 'POST only' }); return; }
  try {
    const { ticket, op, pathname } = req.body || {};
    const t = verifyTicket(ticket);
    if (!t) { res.status(401).json({ error: '유효하지 않은 티켓' }); return; }
    if (!scopeAllows(t, pathname)) { res.status(403).json({ error: '경로 불일치' }); return; }
    if (!t.o.includes(op)) { res.status(403).json({ error: '허용되지 않은 작업' }); return; }
    const token = process.env.BLOB_READ_WRITE_TOKEN;

    if (op === 'del') {
      await del(pathname, { token });
      res.status(200).json({ ok: true });
      return;
    }
    if (op === 'list') {
      if (!t.p.endsWith('/') || pathname !== t.p) { res.status(403).json({ error: 'list는 접두 범위 티켓 전용' }); return; }
      const { blobs } = await list({ prefix: t.p, token, limit: 1000 });
      res.status(200).json({ blobs: blobs.map(b => ({ pathname: b.pathname, size: b.size, uploadedAt: b.uploadedAt })) });
      return;
    }
    if (op !== 'put' && op !== 'get') { res.status(400).json({ error: '지원하지 않는 작업' }); return; }

    const signed = await issueSignedToken({
      token, pathname, operations: [op],
      // put은 대용량 저속 업로드를 감안해 2시간, get은 30분
      validUntil: Date.now() + (op === 'put' ? 120 : 30) * 60 * 1000,
      ...(op === 'put' ? { maximumSizeInBytes: MAX_SIZE } : {}),
    });
    const opts = op === 'put'
      ? { access: 'private', operation: 'put', pathname, addRandomSuffix: false }
      : { access: 'private', operation: 'get', pathname, useCache: false };
    const { presignedUrl } = await presignUrl(signed, opts);
    res.status(200).json({ presignedUrl });
  } catch (e) {
    res.status(502).json({ error: '서명 처리 실패: ' + (e && e.message ? e.message.slice(0, 200) : 'unknown') });
  }
};
