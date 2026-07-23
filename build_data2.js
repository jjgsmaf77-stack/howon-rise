#!/usr/bin/env node
// build_data2.js — 옵시디언 성과관리 볼트(원천)에서 data2.js를 생성한다.
// 사용: node build_data2.js [볼트경로]
// 원칙: 숫자는 볼트 A층(카드)·지출대장에만 존재하며, 여기서는 합산만 한다.

const fs = require('fs');
const path = require('path');

const VAULT = process.argv[2] || 'G:/홍인기_옵시디언/LLM_Wiki/2_Wiki/성과관리';
const OUT = path.join(__dirname, 'data2.js');

const DIVISIONS = ['보건', '컬쳐', 'JB집', '성인', '드론', '축제', '맛잡고', '늘봄'];
const WARN = []; // 파싱 중 무시/탈락된 항목 — 침묵 탈락 금지

// ---------- helpers ----------
function readIf(p) {
  try { return fs.readFileSync(p, 'utf8'); } catch { return null; }
}

function parseFrontmatter(src) {
  const m = src.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return {};
  const fm = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([^:#\s][^:]*):\s*(.*)$/);
    if (!kv) continue;
    const key = kv[1].trim();
    let val = kv[2].trim();
    if (val === '' ) continue;
    if (val === 'null') { fm[key] = null; continue; }
    if (/^\[.*\]$/.test(val)) {
      // 먼저 원문 그대로 파싱 시도 — 값 안의 어포스트로피("'26" 등)를 깨뜨리지 않기 위함
      try { fm[key] = JSON.parse(val); continue; } catch {}
      try { fm[key] = JSON.parse(val.replace(/'/g, '"')); continue; } catch {}
      WARN.push(`frontmatter 배열 파싱 실패: ${key}: ${val}`);
    }
    const unq = val.replace(/^"(.*)"$/, '$1');
    fm[key] = (unq !== '' && !isNaN(Number(unq)) && !/^0\d/.test(unq)) ? Number(unq) : unq;
  }
  return fm;
}

// markdown 표에서 데이터 행을 [ [cell,...], ... ]로 추출 (헤더행·구분행 제외)
function parseTables(src) {
  const tables = [];
  const lines = src.split(/\r?\n/);
  let cur = null;
  for (const line of lines) {
    if (/^\s*\|.*\|\s*$/.test(line)) {
      const cells = line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim());
      if (!cur) { cur = { header: cells, rows: [] }; continue; }
      if (cells.every(c => /^:?-+:?$/.test(c) || c === '')) continue; // 구분행
      cur.rows.push(cells);
    } else if (cur) { tables.push(cur); cur = null; }
  }
  if (cur) tables.push(cur);
  return tables;
}

const num = s => {
  if (s == null) return null;
  const m = String(s).replace(/[,\s원%]/g, '').match(/-?\d+(\.\d+)?/);
  return m ? Number(m[0]) : null;
};

// ---------- 카드 (A층) ----------
function loadCards(div) {
  const dir = path.join(VAULT, '성과추출', div);
  let files = [];
  try { files = fs.readdirSync(dir).filter(f => f.endsWith('.md')); } catch { return []; }
  return files.map(f => {
    const src = fs.readFileSync(path.join(dir, f), 'utf8');
    const fm = parseFrontmatter(src);
    if (fm.type !== '프로그램실적') return null;
    return {
      file: f.replace(/\.md$/, ''),
      name: fm['프로그램명'] || f,
      category: fm['프로그램유형'] || '',
      org: fm['교육기관'] || '',
      period: String(fm['운영기간'] || ''),
      students: typeof fm['참여학생수'] === 'number' ? fm['참여학생수'] : null,
      hours: String(fm['교육시간'] || ''),
      satis: typeof fm['만족도'] === 'number' ? fm['만족도'] : null,
      satisN: typeof fm['만족도_응답자수'] === 'number' ? fm['만족도_응답자수'] : null,
      satisScale: typeof fm['만족도_척도'] === 'number' ? fm['만족도_척도'] : 5,
      budget: typeof fm['소요예산'] === 'number' ? fm['소요예산'] : null,
      budgetItem: fm['예산항목'] || '',
      indicators: Array.isArray(fm['지표매핑']) ? fm['지표매핑'] : [],
      status: fm['상태'] || '추출완료',
      approval: fm['내부결재'] || '',
    };
  }).filter(Boolean);
}

// ---------- 지출대장 ----------
function loadSpending(div) {
  const src = readIf(path.join(VAULT, '지출대장', `${div} 지출대장.md`));
  if (!src) return [];
  const t = parseTables(src).find(t => t.header.includes('지출건명'));
  if (!t) return [];
  const idx = k => t.header.indexOf(k);
  const rows = [];
  for (const r of t.rows) {
    const amount = num(r[idx('금액(원)')]);
    if (amount == null || amount === 0) {
      // 합계행 등 숫자 없는 행은 조용히 넘기되, 지출건명이 있는 행이 떨어지면 경고
      const name = r[idx('지출건명')] || '';
      if (name && !/합계|총계|누적/.test(name)) WARN.push(`${div} 지출대장: 금액 해석 불가로 제외된 행 — "${name}"`);
      continue;
    }
    rows.push({
      date: r[idx('일자')] || '',
      name: r[idx('지출건명')] || '',
      item: r[idx('예산항목')] || '',
      amount, // 음수(환수·정정)도 그대로 합산
      doc: (r[idx('근거문서(내부결재)')] || '').replace(/\[\[|\]\]/g, ''),
      verified: /🟢/.test(r[idx('검증')] || ''),
    });
  }
  return rows;
}

// ---------- 원장 (B층): frontmatter + 지표 표 ----------
function loadLedger(div) {
  const src = readIf(path.join(VAULT, '원장', `${div}.md`));
  if (!src) return null;
  const fm = parseFrontmatter(src);
  const t = parseTables(src).find(t => t.header.includes('지표명') && t.header.some(h => h.includes('목표')));
  const indicators = t ? t.rows.map(r => ({
    group: r[0] || '',
    name: r[1] || '',
    base: r[2] ?? '',
    target: r[3] ?? '',
    prev: r[4] ?? '',
  })).filter(i => i.name) : [];
  return {
    code: fm['과제코드'] || '',
    fullName: fm['과제명'] || '',
    lead: String(fm['책임자'] || ''),
    budgetTotalM: num(fm['예산_총계']) || 0,
    budgetMainM: num(fm['예산_주관대학']) || 0,
    budgetOpM: num(fm['예산_운영비']) || 0,
    indicators,
  };
}

// ---------- 집계 ----------
const divisions = DIVISIONS.map(key => {
  const ledger = loadLedger(key) || { code: '', fullName: '', lead: '', budgetTotalM: 0, budgetMainM: 0, budgetOpM: 0, indicators: [] };
  const cards = loadCards(key);
  const spending = loadSpending(key);

  const spentWon = spending.reduce((s, e) => s + e.amount, 0);
  const budgetWon = ledger.budgetTotalM * 1_000_000;
  const students = cards.reduce((s, c) => s + (c.students || 0), 0);

  const rated = cards.filter(c => c.satis != null && c.satisN != null);
  // 척도 정규화: 카드별 척도(5점/100점 혼재 가능)를 5점 기준으로 환산해 가중평균
  const wSum = rated.reduce((s, c) => s + (c.satis / (c.satisScale || 5)) * 5 * c.satisN, 0);
  const wN = rated.reduce((s, c) => s + c.satisN, 0);
  const satisAvg = wN ? +(wSum / wN).toFixed(2) : null;
  const satisExcluded = cards.filter(c => c.satis != null && c.satisN == null).length;

  // '확인' 표기가 붙은 태그(예: "행사(분류확인)")는 미확정 — 집계에서 제외
  const countTag = tag => cards.filter(c => c.indicators.some(i => i.includes(tag) && !i.includes('확인'))).length;
  const spread = {
    초광역: countTag('초광역'),
    사업단연계: countTag('사업단연계'),
    MOU: countTag('MOU'),
    언론보도: countTag('언론'),
    행사: countTag('행사'),
  };
  const spreadPending = cards.filter(c => c.indicators.some(i => i.includes('분류확인') || i.includes('확인'))).length;

  const unverified = cards.filter(c => c.status !== '검토완료' && c.status !== '입력반영').length
    + spending.filter(e => !e.verified).length;

  return {
    key,
    code: ledger.code,
    fullName: ledger.fullName,
    lead: ledger.lead,
    budget: { totalM: ledger.budgetTotalM, mainM: ledger.budgetMainM, opM: ledger.budgetOpM, spentWon, rate: budgetWon ? +(spentWon / budgetWon * 100).toFixed(1) : 0 },
    programs: cards,
    spending,
    students,
    satisfaction: { avg: satisAvg, n: wN, scale: 5, excluded: satisExcluded },
    spread,
    spreadPending,
    indicators: ledger.indicators,
    unverified,
    status: cards.length || spending.length ? '진행' : '자료대기',
  };
});

const totals = {
  budgetM: divisions.reduce((s, d) => s + d.budget.totalM, 0),
  spentWon: divisions.reduce((s, d) => s + d.budget.spentWon, 0),
  programs: divisions.reduce((s, d) => s + d.programs.length, 0),
  students: divisions.reduce((s, d) => s + d.students, 0),
  unverified: divisions.reduce((s, d) => s + d.unverified, 0),
  activeDivisions: divisions.filter(d => d.status === '진행').length,
};
totals.rate = totals.budgetM ? +(totals.spentWon / (totals.budgetM * 1_000_000) * 100).toFixed(2) : 0;

const out = {
  generatedAt: new Date().toISOString(),
  year: 2026,
  yearLabel: '2차년도(2026)',
  source: '옵시디언 성과관리 볼트 (A층 카드·지출대장 합산)',
  divisions,
  totals,
  warnings: [
    totals.activeDivisions < 8 ? `프로그램 자료 접수: ${totals.activeDivisions}/8 사업단 — 나머지 사업단 결과보고서 투입 필요` : null,
    '집행률은 인박스에 투입된 지출 문서만 반영 (비프로그램성 지출 미반영 시 실제보다 낮음)',
    totals.unverified ? `미검증(🔴) 항목 ${totals.unverified}건 — 확정 전 수치는 잠정값` : null,
    ...WARN.map(w => `[빌드 경고] ${w}`),
  ].filter(Boolean),
};

fs.writeFileSync(OUT, '// 2차년도 성과관리 데이터 — build_data2.js가 옵시디언 볼트에서 자동 생성. 직접 수정 금지.\n'
  + 'window.__RISE2__ = ' + JSON.stringify(out, null, 2) + ';\n');
console.log(`data2.js generated: ${divisions.length} divisions, ${totals.programs} programs, spent ${totals.spentWon.toLocaleString()}원, unverified ${totals.unverified}`);
if (WARN.length) { console.warn('빌드 경고 ' + WARN.length + '건:'); WARN.forEach(w => console.warn('  - ' + w)); }
