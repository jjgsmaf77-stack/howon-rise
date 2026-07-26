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

// ---------- 2축 분류 체계 (설계문서 §12, 2026-07-26 확정) ----------
// 축1: 예산항목 표준 9종 (인건비 없음 — 단위과제 규칙 / 간접비는 TANKer 제외)
const BUDGET_ITEMS = ['장학금', '교육·연구 프로그램 운영·개발', '실험실습 장비·기자재',
  '지역 연계 협업 지원', '기업지원 협력 활동', '성과 활용 확산', '교육 연구 환경 개선', '기타운영', '간접비'];
const LEGACY_ITEM_MAP = {
  '교육·연구 프로그램 개발·운영비': '교육·연구 프로그램 운영·개발',
  '지역 연계·협업 지원비': '지역 연계 협업 지원',
  '성과 활용·확산 지원비': '성과 활용 확산',
  '실험·실습장비 및 기자재 구입·운영비': '실험실습 장비·기자재',
  '교육·연구 환경 개선비': '교육 연구 환경 개선',
  '그 밖의 사업운영 경비': '기타운영',
  '기업 지원·협력 활동비': '기업지원 협력 활동',
};
// 축2: TANKer — 주분류 1개 필수(간접비 제외) + 부분류(참고용)
const TANKER = { T: '지역인재육성', A: '지역현장강화', N: '지역기업연계', K: '취창업 실현' };
const EXEC_TYPES = ['자체운영', '용역(수의계약)', '용역(입찰)'];

function normItem(s, ctx) {
  s = (s || '').trim();
  if (!s) return '';
  if (BUDGET_ITEMS.includes(s)) return s;
  if (LEGACY_ITEM_MAP[s]) return LEGACY_ITEM_MAP[s];
  WARN.push(`${ctx}: 표준 예산항목(9종)이 아님 — "${s}"`);
  return s;
}
function checkTanker(tanker, item, ctx) {
  if (item === '간접비') {
    if (tanker) WARN.push(`${ctx}: 간접비는 TANKer 분류 제외인데 "${tanker}" 지정됨`);
    return '';
  }
  if (tanker && !TANKER[tanker]) { WARN.push(`${ctx}: TANKer 값 오류 — "${tanker}" (T/A/N/K)`); return ''; }
  if (!tanker && item) WARN.push(`${ctx}: TANKer 주분류 미지정 🔴`);
  return tanker || '';
}

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
      budgetItem: normItem(fm['예산항목'], `${div}/${f}`),
      tanker: checkTanker(String(fm['TANKer'] || '').trim(), normItem(fm['예산항목'], ''), `${div}/${f}`),
      tankerSub: String(fm['TANKer_부분류'] || '').trim(),
      execType: String(fm['집행방식'] || '').trim(),
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
    const cell = k => idx(k) >= 0 ? (r[idx(k)] || '') : '';
    const item = normItem(cell('예산항목'), `${div} 지출대장`);
    rows.push({
      date: cell('일자'),
      name: cell('지출건명'),
      item,
      tanker: checkTanker(cell('TANKer').trim(), item, `${div} 지출대장/${cell('지출건명')}`),
      execType: cell('집행방식').trim(),
      amount, // 음수(환수·정정)도 그대로 합산
      doc: cell('근거문서(내부결재)').replace(/\[\[|\]\]/g, ''),
      verified: /🟢/.test(cell('검증')),
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
  // 정본 표 헤더: 구분|지표명|단위|’25 목표|’25 실적|’25 달성도|’26 목표|’26 실적(누적)|달성률|근거 프로그램
  const col = name => t ? t.header.findIndex(h => h.replace(/[’']/g, '').includes(name)) : -1;
  const pick = (r, i) => (i >= 0 && r[i] != null && r[i] !== '-') ? r[i] : '';
  const indicators = t ? t.rows.map(r => ({
    group: pick(r, col('구분')) || r[0] || '',
    name: pick(r, col('지표명')),
    unit: pick(r, col('단위')),
    target25: pick(r, col('25 목표')),
    actual25: pick(r, col('25 실적')),
    rate25: pick(r, col('25 달성도')),
    target: pick(r, col('26 목표')),
  })).filter(i => i.name) : [];
  // 항목별 편성 (수정사업계획서 당해연도 예산 집행 계획 — §3 표)
  const bt = parseTables(src).find(t => t.header.includes('예산항목') && t.header.includes('편성'));
  const budgetPlan = bt ? bt.rows
    .filter(r => r[0] && !r[0].includes('총계'))
    .map(r => ({ item: r[0].replace(/\*/g, '').trim(), plannedM: num(r[1]),
                 flagged: /🔴/.test(r[1] || '') }))
    .filter(x => x.plannedM != null) : [];

  return {
    code: fm['과제코드'] || '',
    fullName: fm['과제명'] || '',
    lead: String(fm['책임자'] || ''),
    budgetTotalM: num(fm['예산_총계']) || 0,
    budgetMainM: num(fm['예산_주관대학']) || 0,
    budgetOpM: num(fm['예산_운영비']) || 0,
    budgetPlan,
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
    budgetPlan: ledger.budgetPlan,
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
  source: '성과관리 시스템 자동 집계 (프로그램 카드·지출 기록 합산)',
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
