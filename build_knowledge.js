// AI 질의용 지식 번들 생성기 — 옵시디언 성과분석 볼트 → admin-app/knowledge/kb.json
// 사용: node build_knowledge.js [볼트경로]   (build_data2.js와 같은 갱신 절차에서 함께 실행)
const fs = require('fs');
const path = require('path');

const VAULT = process.argv[2] || 'G:/홍인기_옵시디언/LLM_Wiki/2_Wiki/★★★2차년도 앵커사업단 성과분석★★★';
const OUT_DIR = path.join(__dirname, 'admin-app', 'knowledge');
const DIVISIONS = ['본부', '보건', '컬쳐', 'JB집', '성인', '드론', '축제', '맛잡고', '늘봄'];

const read = p => fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
const exists = p => fs.existsSync(p);

const kb = { generatedAt: new Date().toISOString(), source: path.basename(VAULT), common: [], divisions: {} };

// 공통 문서 (전 사업단 컨텍스트)
for (const f of ['00_설계문서 - 성과관리 구조.md', '00_분석대장.md', '01_종합현황.md',
  '02_연계 프로그램 대장.md', path.join('유사중복', '00_유사중복 점검 대장.md')]) {
  const p = path.join(VAULT, f);
  if (exists(p)) kb.common.push({ file: f.replace(/\\/g, '/'), text: read(p) });
}

// 사업단별 문서: 원장 + 프로그램 카드 + 지출대장
for (const d of DIVISIONS) {
  const docs = [];
  const ledger = path.join(VAULT, '원장', `${d}.md`);
  if (exists(ledger)) docs.push({ file: `원장/${d}.md`, text: read(ledger) });
  const cardDir = path.join(VAULT, '성과추출', d);
  if (exists(cardDir)) {
    for (const f of fs.readdirSync(cardDir).filter(x => x.endsWith('.md')).sort()) {
      docs.push({ file: `성과추출/${d}/${f}`, text: read(path.join(cardDir, f)) });
    }
  }
  const spend = path.join(VAULT, '지출대장', `${d} 지출대장.md`);
  if (exists(spend)) docs.push({ file: `지출대장/${d} 지출대장.md`, text: read(spend) });
  kb.divisions[d] = docs;
}

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(path.join(OUT_DIR, 'kb.json'), JSON.stringify(kb, null, 1));
const nDocs = kb.common.length + Object.values(kb.divisions).reduce((a, v) => a + v.length, 0);
const bytes = fs.statSync(path.join(OUT_DIR, 'kb.json')).size;
console.log(`kb.json generated: 공통 ${kb.common.length} + 사업단 문서 ${nDocs - kb.common.length}건, ${(bytes / 1024).toFixed(0)}KB`);
