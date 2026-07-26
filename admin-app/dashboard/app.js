// 호원 앵커(RISE) 성과관리 플랫폼 — 2차년도(2026) 대시보드
// 데이터 원천: 옵시디언 성과관리 볼트 → build_data2.js → data2.js (window.__RISE2__)
// 1차년도(2025) 뷰·데이터(data.js)는 2026-07 개편으로 제거됨 — git 이력에서 복원 가능.
(() => {
  // ---------- helpers ----------
  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => Array.from(el.querySelectorAll(sel));
  const h = (tag, attrs = {}, children = []) => {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class') el.className = v;
      else if (k === 'html') el.innerHTML = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
      else el.setAttribute(k, v);
    }
    for (const c of [].concat(children)) {
      if (c == null) continue;
      el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    }
    return el;
  };
  const fmtN = v => (v == null || v === '') ? '—' : Number(v).toLocaleString('ko-KR');

  function kpiCard(label, value, unit, foot) {
    return h('div', { class: 'kpi' }, [
      h('div', { class: 'label' }, [label]),
      h('div', { class: 'value' }, [String(fmtN(value)), h('span', { class: 'unit' }, [unit])]),
      foot ? h('div', { class: 'foot' }, [foot]) : null
    ]);
  }
  function sectionHead(title, desc, right) {
    return h('div', { class: 'section-head' }, [
      h('div', {}, [
        h('div', { class: 'section-title' }, [title]),
        desc ? h('div', { class: 'section-desc' }, [desc]) : null
      ]),
      right ? h('div', { class: 'right' }, right) : null
    ]);
  }

  // ---------- navigation ----------
  const VIEWS = [
    { id: 'year2', label: '2차년도 현황', desc: '2026 실적·예산 집행' }
  ];
  let _currentView = 'year2';

  function crumbHtml(v) {
    return `호원 앵커(RISE) · <strong>${v.label}</strong> · ${v.desc}`;
  }

  async function setView(id) {
    _currentView = id;
    $$('.nav button').forEach(b => b.classList.toggle('active', b.dataset.view === id));
    $$('#mobile-quicknav .q').forEach(b => b.classList.toggle('active', b.dataset.view === id));
    const v = VIEWS.find(x => x.id === id);
    if (v) $('#crumb').innerHTML = crumbHtml(v);
    const target = $(`#view-${id}`);
    if (target) {
      const topbar = $('.topbar');
      const quick = $('#mobile-quicknav');
      const offset = (topbar ? topbar.offsetHeight : 0) + (quick && getComputedStyle(quick).display !== 'none' ? quick.offsetHeight : 0) + 8;
      const y = target.getBoundingClientRect().top + window.scrollY - offset;
      window.scrollTo({ top: Math.max(0, y), behavior: 'smooth' });
    }
    document.body.classList.remove('nav-open');
  }

  function buildSidebar() {
    const nav = $('#nav');
    if (!nav) return;
    nav.innerHTML = '';
    const counts = {
      year2: (window.__RISE2__ && window.__RISE2__.totals) ? window.__RISE2__.totals.programs : ''
    };
    VIEWS.forEach(v => {
      const btn = h('button', { 'data-view': v.id, onclick: () => setView(v.id) }, [
        h('span', { class: 'dot' }),
        document.createTextNode(v.label),
        counts[v.id] !== '' ? h('span', { class: 'count' }, [String(counts[v.id])]) : null
      ]);
      if (v.id === _currentView) btn.classList.add('active');
      nav.appendChild(btn);
    });
  }

  function buildMobileQuickNav() {
    const wrap = $('#mobile-quicknav');
    if (!wrap) return;
    wrap.innerHTML = '';
    VIEWS.forEach(v => {
      const b = h('button', { class: 'q', 'data-view': v.id, onclick: () => setView(v.id) }, [v.label]);
      if (v.id === _currentView) b.classList.add('active');
      wrap.appendChild(b);
    });
  }

  // ---------- year2 (2차년도 현황) ----------
  function y2Data() { return window.__RISE2__ || null; }

  // 2축 분류 (설계 §12): 예산항목 9종(간접비는 TANKer 제외) × TANKer 4종
  const BUDGET_ITEMS = ['장학금', '교육·연구 프로그램 운영·개발', '실험실습 장비·기자재',
    '지역 연계 협업 지원', '기업지원 협력 활동', '성과 활용 확산', '교육 연구 환경 개선', '기타운영', '간접비'];
  const TANKER = { T: '지역인재육성', A: '지역현장강화', N: '지역기업연계', K: '취창업 실현' };
  const TANKER_KEYS = ['T', 'A', 'N', 'K'];

  // 사업단 표시명: 수정사업계획서 풀네임 (과제코드)
  const divName = d => d.fullName || d.key;
  const divNameWithCode = d => d.code ? `${divName(d)} (${d.code})` : divName(d);
  // 차트 축은 약칭(깔끔) — 풀네임(코드)은 툴팁에서 표시

  function y2Status(status) {
    const active = status === '진행';
    return h('span', { class: `y2-status ${active ? 'active' : 'pending'}` }, [active ? '진행' : '자료 대기']);
  }

  function y2BarRow(label, pct, valText, muted) {
    return h('div', { class: 'bar-row' }, [
      h('div', { class: 'lbl' }, [label]),
      h('div', { class: `bar ${muted ? 'muted' : ''}` }, [ h('i', { style: `width:${Math.min(pct, 100).toFixed(1)}%` }) ]),
      h('div', { class: 'val' }, [valText])
    ]);
  }

  // 집행률 리스트: 풀네임은 길어서 이름 줄 + 바 줄의 2단 구성
  function y2RateRow(d) {
    const muted = d.status !== '진행';
    return h('div', { class: 'y2-rate-row' }, [
      h('div', { class: 'y2-rate-name' }, [divNameWithCode(d)]),
      h('div', { class: 'y2-rate-bar' }, [
        h('div', { class: `bar ${muted ? 'muted' : ''}` }, [ h('i', { style: `width:${Math.min(d.budget.rate, 100).toFixed(1)}%` }) ]),
        h('div', { class: 'val' }, [d.budget.spentWon ? `${d.budget.rate}%` : '—'])
      ])
    ]);
  }

  // 사업단 상세 — 입력관리와 같은 내용의 읽기 전용 뷰 (단일/전체 공용 본문 빌더)
  function y2DivDetailNodes(d) {
    const TK = k => k ? `${k} ${TANKER[k] || ''}` : '—';
    return [
        h('div', { class: 'y2-modal-kpis' }, [
          h('span', {}, [`집행률 ${d.budget.rate}%`]),
          h('span', {}, [`집행 ${fmtN(d.budget.spentWon)}원 / 편성 ${fmtN(d.budget.totalM)}백만원`]),
          h('span', {}, [`프로그램 ${d.programs.length}건 · 참여학생 ${d.students}명`]),
          h('span', {}, [`만족도 ${d.satisfaction.avg != null ? d.satisfaction.avg + ` (n=${d.satisfaction.n})` : '—'}`]),
          h('span', {}, [`미검증 ${d.unverified}건`])
        ]),
        h('h3', {}, [`프로그램 실적 (${d.programs.length})`]),
        d.programs.length ? h('div', { class: 'y2-tblwrap' }, [h('table', { class: 'tbl' }, [
          h('thead', {}, [h('tr', {}, ['상태','프로그램명','유형','TANKer','예산항목','교육기관','참여','시간','만족도','소요예산','내부결재'].map(c => h('th', {}, [c])))]),
          h('tbody', {}, d.programs.map(p => h('tr', {}, [
            h('td', {}, [p.status === '입력반영' ? '🟢' : p.status === '검토완료' ? '🟡' : '🔴']),
            h('td', { class: 'strong' }, [p.name]),
            h('td', {}, [p.category || '—']),
            h('td', {}, [p.tanker ? `${p.tanker}${p.tankerSub ? '·' + p.tankerSub : ''}` : '—']),
            h('td', {}, [p.budgetItem || '—']),
            h('td', {}, [p.org || '—']),
            h('td', { class: 'num' }, [p.students != null ? `${p.students}명` : '—']),
            h('td', {}, [p.hours || '—']),
            h('td', { class: 'num' }, [p.satis != null ? `${p.satis}${p.satisN ? ` (n=${p.satisN})` : ' 🔴'}` : '—']),
            h('td', { class: 'num' }, [
              p.budget != null ? `${fmtN(p.budget)}원` : '—',
              p.execType ? h('div', { class: 'y2-exec-sub' }, [p.execType]) : null
            ]),
            h('td', {}, [p.approval || '—'])
          ])))
        ])]) : h('div', { class: 'empty' }, ['접수된 프로그램이 없습니다.']),
        // 주요 실적(수상 등) — 카드의 기타실적 표시
        ...d.programs.filter(p => p.extra).map(p =>
          h('div', { class: 'y2-extra' }, [
            h('span', { class: 'y2-extra-k' }, ['🏆 주요 실적']),
            h('span', { class: 'y2-extra-p' }, [`[${p.name}]`]),
            h('span', {}, [p.extra])
          ])),
        h('h3', {}, [`지출 기록 (${d.spending.length})`]),
        d.spending.length ? h('div', { class: 'y2-tblwrap' }, [h('table', { class: 'tbl' }, [
          h('thead', {}, [h('tr', {}, ['검증','일자','지출건명','예산항목','TANKer','집행방식','금액','근거문서'].map(c => h('th', {}, [c])))]),
          h('tbody', {}, d.spending.map(x => h('tr', {}, [
            h('td', {}, [x.verified ? '🟢' : '🔴']),
            h('td', {}, [x.date || '—']),
            h('td', { class: 'strong' }, [x.name]),
            h('td', {}, [x.item || '—']),
            h('td', {}, [TK(x.tanker)]),
            h('td', {}, [x.execType || '—']),
            h('td', { class: 'num' }, [`${fmtN(x.amount)}원`]),
            h('td', {}, [x.doc || '—'])
          ])))
        ])]) : h('div', { class: 'empty' }, ['기록된 지출이 없습니다.']),
        h('h3', {}, ['예산 항목별 편성·집행 (주관대학분, 백만원)']),
        (d.budgetPlan && d.budgetPlan.length) ? h('div', { class: 'y2-tblwrap' }, [h('table', { class: 'tbl' }, [
          h('thead', {}, [h('tr', {}, ['예산항목','편성','집행','집행률'].map(c => h('th', { class: c === '예산항목' ? '' : 'num' }, [c])))]),
          h('tbody', {}, (() => {
            const spentBy = {};
            d.spending.forEach(x => { if (x.item) spentBy[x.item] = (spentBy[x.item] || 0) + x.amount; });
            const rows = d.budgetPlan.map(bp => {
              const spent = spentBy[bp.item] || 0;
              const rate = bp.plannedM ? (spent / (bp.plannedM * 1e6) * 100) : 0;
              return h('tr', {}, [
                h('td', {}, [bp.item + (bp.flagged ? ' 🔴' : '')]),
                h('td', { class: 'num' }, [String(bp.plannedM)]),
                h('td', { class: 'num' }, [spent ? (spent / 1e6).toFixed(2) : '—']),
                h('td', { class: 'num' }, [spent ? `${rate.toFixed(1)}%` : '—'])
              ]);
            });
            const planSum = d.budgetPlan.reduce((a, b) => a + b.plannedM, 0);
            rows.push(h('tr', { class: 'strong' }, [
              h('td', {}, ['합계']),
              h('td', { class: 'num strong' }, [String(Math.round(planSum * 100) / 100)]),
              h('td', { class: 'num strong' }, [d.budget.spentWon ? (d.budget.spentWon / 1e6).toFixed(2) : '—']),
              h('td', { class: 'num strong' }, [d.budget.spentWon ? `${d.budget.rate}%` : '—'])
            ]));
            return rows;
          })())
        ])]) : h('div', { class: 'empty' }, ['항목별 편성 정보 없음']),
        h('h3', {}, ['2025년도 이월금 집행 계획 (백만원)']),
        (d.carryPlan && d.carryPlan.length) ? h('div', { class: 'y2-tblwrap' }, [h('table', { class: 'tbl' }, [
          h('thead', {}, [h('tr', {}, ['예산항목', '이월금 편성', '집행(재원=이월금)'].map((c, i) => h('th', { class: i ? 'num' : '' }, [c])))]),
          h('tbody', {}, [
            ...d.carryPlan.map(cp => {
              const spent = d.spending.filter(x => x.fund === '이월금' && x.item === cp.item).reduce((a, x) => a + x.amount, 0);
              return h('tr', {}, [
                h('td', {}, [cp.item]),
                h('td', { class: 'num' }, [String(cp.plannedM)]),
                h('td', { class: 'num' }, [spent ? `${fmtN(spent)}원` : '—'])
              ]);
            }),
            h('tr', { class: 'strong' }, [
              h('td', {}, ['합계']),
              h('td', { class: 'num strong' }, [String(d.carry.totalM)]),
              h('td', { class: 'num strong' }, [d.carry.spentWon ? `${fmtN(d.carry.spentWon)}원 (${d.carry.rate}%)` : '—'])
            ])
          ])
        ])]) : h('div', { class: 'empty' }, ['이월금 없음']),
        h('h3', {}, ['성과지표']),
        h('div', { class: 'y2-tblwrap' }, [h('table', { class: 'tbl' }, [
          h('thead', {}, [h('tr', {}, ['구분','지표명','단위','’25 목표','’25 실적','’25 달성도','’26 목표'].map(c => h('th', {}, [c])))]),
          h('tbody', {}, d.indicators.map(i => h('tr', {}, [
            h('td', {}, [i.group]),
            h('td', {}, [i.name]),
            h('td', {}, [i.unit || '—']),
            h('td', { class: 'num' }, [String(i.target25 || '—')]),
            h('td', { class: 'num' }, [String(i.actual25 || '—')]),
            h('td', { class: 'num' }, [i.rate25 !== '' ? `${i.rate25}%` : '—']),
            h('td', { class: 'num strong' }, [String(i.target || '—')])
          ])))
        ])])
    ];
  }

  function y2OpenModal(bodyNodes, headNode) {
    const prev = document.getElementById('y2-modal');
    if (prev) prev.remove();
    const close = () => { const m = document.getElementById('y2-modal'); if (m) m.remove(); document.removeEventListener('keydown', esc); };
    const esc = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', esc);
    const modal = h('div', { id: 'y2-modal', class: 'y2-modal', onclick: (e) => { if (e.target.id === 'y2-modal') close(); } }, [
      h('div', { class: 'y2-modal-card' }, [
        h('div', { class: 'y2-modal-head' }, [
          headNode,
          h('button', { class: 'y2-modal-close', onclick: close, 'aria-label': '닫기' }, ['✕'])
        ]),
        ...bodyNodes
      ])
    ]);
    document.body.appendChild(modal);
  }

  // 단일 사업단 모달
  function y2DivModal(d) {
    y2OpenModal(y2DivDetailNodes(d), h('div', {}, [
      h('div', { class: 'y2-code' }, [d.code || d.key]),
      h('h2', {}, [divName(d)]),
      h('div', { class: 'muted' }, [
        `책임자 ${d.lead || '—'} · 조회 전용 (수정은 입력관리에서) · `,
        h('a', { href: '#', class: 'y2-alllink', onclick: (e) => { e.preventDefault(); y2AllModal(); } }, ['전체 사업단 보기 →'])
      ])
    ]));
  }

  // 전체보기 — 9개 사업단 상세를 한 화면에
  function y2AllModal() {
    const Y2 = y2Data();
    if (!Y2) return;
    const body = [];
    Y2.divisions.forEach((d, i) => {
      body.push(h('div', { class: 'y2-all-div' }, [
        h('div', { class: 'y2-all-head' }, [
          h('span', { class: 'y2-code' }, [d.code || d.key]),
          h('h2', {}, [divName(d)]),
          y2Status(d.status),
          h('span', { class: 'muted' }, [d.lead ? `책임자 ${d.lead}` : ''])
        ]),
        ...(d.status === '진행' || d.programs.length || d.spending.length
          ? y2DivDetailNodes(d)
          : [h('div', { class: 'y2-modal-kpis' }, [
              h('span', {}, [`편성 ${fmtN(d.budget.totalM)}백만원`]),
              h('span', {}, ['결과보고서 인박스 투입 대기'])
            ])])
      ]));
    });
    y2OpenModal(body, h('div', {}, [
      h('h2', {}, ['전체 사업단 상세 (9개 단위)']),
      h('div', { class: 'muted' }, ['조회 전용 — 자료 대기 사업단은 요약만 표시됩니다'])
    ]));
  }

  function y2DivCard(d) {
    const waiting = d.status !== '진행';
    const satis = d.satisfaction.avg != null ? `${d.satisfaction.avg}` : '—';
    return h('div', { class: `card y2-divcard ${waiting ? 'waiting' : ''}`, role: 'button', tabindex: '0',
                      onclick: () => y2DivModal(d),
                      onkeydown: (e) => { if (e.key === 'Enter') y2DivModal(d); } }, [
      h('div', { class: 'h' }, [ h('span', { class: 'y2-code' }, [d.code || d.key]), y2Status(d.status) ]),
      h('h3', { class: 'y2-name' }, [divName(d)]),
      h('div', { class: 'y2-full' }, [d.lead ? `책임자 ${d.lead}` : '']),
      y2BarRow('집행률', d.budget.rate, `${d.budget.rate}%`, waiting),
      h('div', { class: 'y2-mini' }, [
        h('div', { class: 'm' }, [h('b', {}, [String(d.programs.length)]), h('span', {}, ['프로그램'])]),
        h('div', { class: 'm' }, [h('b', {}, [String(d.students)]), h('span', {}, ['참여학생'])]),
        h('div', { class: 'm' }, [h('b', {}, [satis]), h('span', {}, [d.satisfaction.avg != null ? `만족도(n=${d.satisfaction.n})` : '만족도'])]),
        h('div', { class: 'm' }, [h('b', {}, [String(d.spread.사업단연계 + d.spread.초광역)]), h('span', {}, ['연계실적'])])
      ]),
      h('div', { class: 'note' }, [
        waiting ? '결과보고서 인박스 투입 대기'
                : `편성 ${fmtN(d.budget.totalM)}백만원 · 집행 ${fmtN(d.budget.spentWon)}원${d.unverified ? ` · 미검증 ${d.unverified}건 🔴` : ''}`
      ])
    ]);
  }

  function buildYear2() {
    const el = $('#view-year2');
    if (!el) return;
    const Y2 = y2Data();
    el.innerHTML = '';
    el.appendChild(h('div', { class: 'view-anchor' }, ['2차년도 현황 · 2026 실적·예산 집행 (성과관리 연동)']));
    if (!Y2) {
      el.appendChild(h('section', { class: 'section' }, [
        sectionHead('2차년도 현황', 'data2.js가 로드되지 않았습니다'),
        h('div', { class: 'card' }, [h('div', { class: 'empty' }, ['build_data2.js 실행 후 재배포가 필요합니다.'])])
      ]));
      return;
    }
    const T = Y2.totals;
    const divs = Y2.divisions;

    // TANKer ON 특성화 체계 배너
    const TK_META = [
      { k: 'T', en: 'Talent', kr: '지역인재 육성' },
      { k: 'A', en: 'Action', kr: '지역현장 강화' },
      { k: 'N', en: 'Network', kr: '지역기업 연계' },
      { k: 'K', en: 'K-brand', kr: '취·창업 실현' },
    ];
    el.appendChild(h('section', { class: 'section' }, [
      h('div', { class: 'card y2-tkbanner' }, [
        h('div', { class: 'tkb-top' }, [
          h('span', { class: 'tkb-kicker' }, ['앵커산업 4대 추진방향']),
          h('div', { class: 'tkb-headline' }, ['대학이 바뀌면 지역이 바뀐다'])
        ]),
        h('div', { class: 'tkb-flow' }, [
          h('div', { class: 'tkb-tiles' }, TK_META.flatMap((t, i) => [
            i ? h('span', { class: 'tkb-plus' }, ['+']) : null,
            h('div', { class: 'tkb-tile' }, [
              h('div', { class: 'tkb-letter' }, [t.k]),
              h('div', { class: 'tkb-en' }, [t.en]),
              h('div', { class: 'tkb-kr' }, [t.kr])
            ])
          ])),
          h('span', { class: 'tkb-plus' }, ['+']),
          h('div', { class: 'tkb-anchor' }, [
            h('div', { class: 'tkb-anchor-badge' }, ['앵커']),
            h('div', { class: 'tkb-anchor-name' }, ['Anchor']),
            h('div', { class: 'tkb-anchor-sub' }, ['지역 성장 인재양성 체계'])
          ]),
          h('span', { class: 'tkb-arrow' }, ['➜']),
          h('div', { class: 'tkb-result' }, [
            h('div', { class: 'tkb-result-kicker' }, ['호원 20·60 취·창업']),
            h('div', { class: 'tkb-result-name' }, ['TANKer ', h('span', { class: 'on' }, ['ON'])]),
            h('div', { class: 'tkb-result-sub' }, ['전북지역 내 취·창업 앵커체계 구축']),
            h('div', { class: 'tkb-result-formula' }, ['[ TANK + Anchor ] ON'])
          ])
        ]),
        h('div', { class: 'tkb-foot' }, ['호원 20·60 취·창업 TANKer ON 특성화 시스템'])
      ])
    ]));

    // KPI + 경보
    el.appendChild(h('section', { class: 'section' }, [
      sectionHead('2차년도 요약', `${Y2.yearLabel} · 자동 집계 ${new Date(Y2.generatedAt).toLocaleDateString('ko-KR')}`,
        [h('span', { class: 'chip ghost' }, [Y2.source])]),
      h('div', { class: 'grid-4' }, [
        kpiCard('자료 접수 사업단', T.activeDivisions, ' / 8', '결과보고서 접수 기준'),
        kpiCard('프로그램 실적', T.programs, '건', `참여학생 ${fmtN(T.students)}명`),
        kpiCard('집행액(반영분)', T.spentWon, '원', `편성 ${fmtN(T.budgetM)}백만원 · 집행률 ${T.rate}%`),
        kpiCard('미검증 항목', T.unverified, '건', '🔴 확정 전 잠정값')
      ]),
      Y2.warnings && Y2.warnings.length ? h('ul', { class: 'callout-list y2-warn-list' },
        Y2.warnings.map(w => h('li', { class: 'warn' }, [
          h('div', { class: 'k' }, ['⚠️ 확인']),
          h('div', { class: 'v' }, [w])
        ]))) : null
    ]));

    // 사업단별 카드
    el.appendChild(h('section', { class: 'section' }, [
      sectionHead('사업단별 현황', '2차년도 수정사업계획서 기준 단위과제 — 카드 클릭 시 상세, 수치는 프로그램 카드·지출 기록 합산값',
        [h('button', { class: 'chip y2-exec-btn', onclick: () => y2AllModal() }, ['전체 상세보기'])]),
      h('div', { class: 'y2-divgrid' }, divs.map(y2DivCard))
    ]));

    // 예산 차트 + 집행 현황
    el.appendChild(h('section', { class: 'section' }, [
      sectionHead('예산 편성·집행', '단위: 백만원 — 집행은 접수된 지출 문서만 반영'),
      h('div', { class: 'grid-2' }, [
        h('div', { class: 'card y2-budget-card' }, [
          h('h3', {}, ['사업단별 편성 대비 집행']),
          h('div', { class: 'chart-wrap y2-budget-wrap' }, [h('canvas', { id: 'y2-budget-chart' })])
        ]),
        h('div', { class: 'card' }, [
          h('h3', {}, ['집행률 현황']),
          h('div', { class: 'y2-ringrow' }, [
            h('div', { class: 'y2-ring', style: `background:conic-gradient(#1c7293 ${Math.min(T.rate, 100) * 3.6}deg, #e9eef3 0deg)` }, [
              h('span', {}, [`${T.rate}%`])
            ]),
            h('div', { class: 'y2-ring-meta' }, [
              h('b', {}, ['전체 집행률']),
              h('span', {}, [`집행 ${fmtN(T.spentWon)}원`]),
              h('span', {}, [`편성 ${fmtN(T.budgetM)}백만원`])
            ])
          ]),
          h('div', {}, divs.map(y2RateRow)),
          h('div', { class: 'note' }, ['집행률 = 반영된 지출 ÷ 편성 총액. 지급요청 공문이 전부 접수되기 전까지는 실제보다 낮게 표시됩니다.'])
        ])
      ])
    ]));

    // 이월금 집행현황 (2025년도 이월금 — 수정사업계획서 이월금 집행 계획 기준)
    const carryDivs = divs.filter(d => d.carry && d.carry.totalM > 0);
    const carryTotalM = carryDivs.reduce((a, d) => a + d.carry.totalM, 0);
    const carrySpent = carryDivs.reduce((a, d) => a + d.carry.spentWon, 0);
    el.appendChild(h('section', { class: 'section' }, [
      sectionHead('이월금 집행현황', `2025년도 이월금 총 ${fmtN(Math.round(carryTotalM * 100) / 100)}백만원 — 출처: 수정사업계획서 「2025년도 이월금 집행 계획」 · 집행은 지출 기록의 재원=이월금 합산`,
        [h('span', { class: 'chip ghost' }, [`집행 ${fmtN(carrySpent)}원 (${carryTotalM ? (carrySpent / (carryTotalM * 1e6) * 100).toFixed(1) : 0}%)`])]),
      h('div', { class: 'card' }, [
        h('div', { class: 'y2-tblwrap' }, [h('table', { class: 'tbl' }, [
          h('thead', {}, [h('tr', {}, ['사업단', '이월금 편성(백만)', '집행(원)', '집행률', '주요 편성 항목'].map((c, i) => h('th', { class: i ? 'num' : '' }, [c])))]),
          h('tbody', {}, [
            ...carryDivs.map(d => h('tr', {}, [
              h('td', { class: 'y2-divcell', title: divNameWithCode(d) }, [d.key]),
              h('td', { class: 'num' }, [String(d.carry.totalM)]),
              h('td', { class: 'num' }, [d.carry.spentWon ? fmtN(d.carry.spentWon) : '—']),
              h('td', { class: 'num' }, [d.carry.spentWon ? `${d.carry.rate}%` : '—']),
              h('td', { style: 'white-space:normal;word-break:keep-all;' }, [
                (d.carryPlan || []).map(cp => `${cp.item} ${cp.plannedM}`).join(' · ') || '—'
              ])
            ])),
            h('tr', { class: 'strong' }, [
              h('td', {}, ['합계']),
              h('td', { class: 'num strong' }, [String(Math.round(carryTotalM * 100) / 100)]),
              h('td', { class: 'num strong' }, [carrySpent ? fmtN(carrySpent) : '—']),
              h('td', { class: 'num strong' }, [carrySpent ? `${(carrySpent / (carryTotalM * 1e6) * 100).toFixed(1)}%` : '—']),
              h('td', {}, [''])
            ])
          ])
        ])]),
        h('div', { class: 'note' }, ['이월금 지출은 지출 기록에 재원=이월금으로 기재 시 자동 집계됩니다. 늘봄은 계획서에 3~4월 기집행 표기 존재 — 지급 문서 확보 시 반영.'])
      ])
    ]));

    // 예산항목 × TANKer 매트릭스
    const allPrograms = divs.flatMap(d => d.programs);
    const allSpending = divs.flatMap(d => d.spending);
    const cell = {};  // item → tanker → {count, amount}
    BUDGET_ITEMS.forEach(it => { cell[it] = {}; });
    const put = (item, tk, count, amount) => {
      if (!item) item = '(미분류)';
      if (!cell[item]) cell[item] = {};
      const key = item === '간접비' ? '제외' : (TANKER[tk] ? tk : '미지정');
      const c = cell[item][key] || (cell[item][key] = { count: 0, amount: 0 });
      c.count += count; c.amount += amount;
    };
    allPrograms.forEach(p => put(p.budgetItem, p.tanker, 1, 0));
    allSpending.forEach(s => put(s.item, s.tanker, 0, s.amount));
    const tankerTotals = {};
    TANKER_KEYS.forEach(k => {
      tankerTotals[k] = {
        count: allPrograms.filter(p => p.tanker === k).length,
        amount: allSpending.filter(s => s.tanker === k).reduce((a, s) => a + s.amount, 0)
      };
    });
    const execCounts = {};
    allPrograms.forEach(p => { if (p.execType) execCounts[p.execType] = (execCounts[p.execType] || 0) + 1; });
    const matrixRows = Object.keys(cell).filter(it => Object.keys(cell[it]).length || BUDGET_ITEMS.includes(it));
    // 셀 표기: 백만원 단위 압축 (정확한 원 단위는 마우스오버 title)
    const fmtCell = c => {
      if (!c || (!c.count && !c.amount)) return '';
      const parts = [];
      if (c.count) parts.push(`${c.count}건`);
      if (c.amount) parts.push(`${(c.amount / 1e6).toFixed(1)}백만`);
      return parts.join(' · ');
    };
    const cellTitle = c => c && c.amount ? `${fmtN(c.amount)}원` : '';
    el.appendChild(h('section', { class: 'section' }, [
      sectionHead('예산항목 × TANKer 매트릭스', '축1: 예산항목 9종(인건비 없음·간접비는 TANKer 제외) · 축2: TANKer 주분류 기준 — 셀 = 건수 · 집행액(백만원)'),
      h('div', { class: 'grid-2 y2-matrix-grid' }, [
        h('div', { class: 'card' }, [
          h('div', { class: 'y2-tblwrap' }, [h('table', { class: 'tbl y2-matrix' }, [
            h('thead', {}, [h('tr', {}, [
              h('th', {}, ['예산항목']),
              ...TANKER_KEYS.map(k => h('th', {
                class: 'num y2-tkh y2-tkh-btn', 'data-tk': k, title: `${TANKER[k]} 관련 프로그램·지출 보기`,
                onclick: (e) => {
                  const box = $('#y2-tk-detail');
                  const th = e.currentTarget;
                  const already = th.classList.contains('active');
                  $$('.y2-tkh-btn').forEach(x => x.classList.remove('active'));
                  if (already) { box.innerHTML = ''; return; }
                  th.classList.add('active');
                  const rows = [];
                  divs.forEach(d => {
                    d.programs.forEach(p => { if (p.tanker === k || p.tankerSub === k) rows.push({ kind: p.tanker === k ? '프로그램' : '프로그램(부분류)', div: d, name: p.name, item: p.budgetItem, students: p.students, amount: p.budget }); });
                    d.spending.forEach(x => { if (x.tanker === k) rows.push({ kind: '지출', div: d, name: x.name, item: x.item, students: null, amount: x.amount }); });
                  });
                  box.innerHTML = '';
                  box.appendChild(h('div', { class: 'y2-exec-list' }, [
                    h('div', { class: 'y2-exec-list-head' }, [`${k} ${TANKER[k]} — 관련 ${rows.length}건`]),
                    rows.length ? h('div', { class: 'y2-tblwrap' }, [h('table', { class: 'tbl' }, [
                      h('thead', {}, [h('tr', {}, ['구분', '사업단', '내용', '예산항목', '참여', '금액'].map(c => h('th', {}, [c])))]),
                      h('tbody', {}, rows.map(r => h('tr', {}, [
                        h('td', {}, [r.kind]),
                        h('td', { class: 'y2-divcell' }, [divName(r.div)]),
                        h('td', {}, [r.name]),
                        h('td', {}, [r.item || '—']),
                        h('td', { class: 'num' }, [r.students != null ? `${r.students}명` : '—']),
                        h('td', { class: 'num' }, [r.amount != null ? `${fmtN(r.amount)}원` : '—'])
                      ])))
                    ])]) : h('div', { class: 'empty' }, [`${TANKER[k]} 분류의 실적이 아직 없습니다.`])
                  ]));
                }
              }, [
                h('div', { class: 'l' }, [k]),
                h('div', { class: 'n' }, [TANKER[k]])
              ])),
              h('th', { class: 'num' }, ['합계'])
            ])]),
            h('tbody', {}, (() => {
              const maxAmt = Math.max(1, ...matrixRows.flatMap(it => Object.values(cell[it]).map(c => c.amount)));
              return matrixRows.map(it => {
                const isIndirect = it === '간접비';
                const rowCells = cell[it];
                const sum = Object.values(rowCells).reduce((a, c) => ({ count: a.count + c.count, amount: a.amount + c.amount }), { count: 0, amount: 0 });
                const heat = c => c && c.amount ? `background:rgba(28,114,147,${(0.08 + 0.3 * c.amount / maxAmt).toFixed(2)})` : '';
                return h('tr', { class: isIndirect ? 'y2-indirect' : '' }, [
                  h('td', {}, [it]),
                  ...(isIndirect
                    ? [h('td', { class: 'num y2-excluded', colspan: '4', title: cellTitle(rowCells['제외']) }, [fmtCell(rowCells['제외']) || 'TANKer 분류 제외'])]
                    : TANKER_KEYS.map(k => h('td', { class: 'num', style: heat(rowCells[k]), title: cellTitle(rowCells[k]) }, [fmtCell(rowCells[k]) || '—']))),
                  h('td', { class: 'num strong', title: cellTitle(sum) }, [fmtCell(sum) || '—'])
                ]);
              });
            })())
          ])]),
          h('div', { id: 'y2-tk-detail' }),
          h('div', { class: 'note' }, ['건수=프로그램(주분류 기준), 금액=지출 기록 — 셀 색 농도는 집행액 비중. T·A·N·K 헤더를 클릭하면 관련 프로그램·지출 목록이 표시됩니다.'])
        ]),
        h('div', { class: 'card' }, [
          h('h3', {}, ['TANKer 전략별 집행 분포']),
          h('div', { class: 'chart-wrap y2-donut-wrap' }, [h('canvas', { id: 'y2-tanker-donut' })]),
          h('div', { class: 'y2-tanker-dist' }, TANKER_KEYS.map(k =>
            y2BarRow(`${k} ${TANKER[k]}`,
              T.spentWon ? (tankerTotals[k].amount / T.spentWon) * 100 : 0,
              tankerTotals[k].count || tankerTotals[k].amount ? `${tankerTotals[k].count}건` : '—',
              !tankerTotals[k].amount))),
          h('div', { class: 'divider' }),
          h('h3', {}, ['집행방식']),
          h('div', { class: 'y2-exec' },
            ['자체운영', '용역(수의계약)', '용역(입찰)'].map(t =>
              h('button', {
                class: `chip y2-exec-btn ${execCounts[t] ? '' : 'ghost'}`,
                'data-exec': t,
                onclick: (e) => {
                  const box = $('#y2-exec-detail');
                  const btn = e.currentTarget;
                  const already = btn.classList.contains('active');
                  $$('.y2-exec-btn').forEach(b => b.classList.remove('active'));
                  if (already) { box.innerHTML = ''; return; }
                  btn.classList.add('active');
                  const rows = [];
                  divs.forEach(d => {
                    d.programs.forEach(p => { if (p.execType === t) rows.push({ kind: '프로그램', div: d, name: p.name, item: p.budgetItem, amount: p.budget }); });
                    d.spending.forEach(x => { if (x.execType === t) rows.push({ kind: '지출', div: d, name: x.name, item: x.item, amount: x.amount }); });
                  });
                  box.innerHTML = '';
                  box.appendChild(h('div', { class: 'y2-exec-list' }, [
                    h('div', { class: 'y2-exec-list-head' }, [`${t} — ${rows.length}건`]),
                    rows.length ? h('table', { class: 'tbl' }, [
                      h('thead', {}, [h('tr', {}, ['구분', '사업단', '내용', '예산항목', '금액'].map(c => h('th', {}, [c])))]),
                      h('tbody', {}, rows.map(r => h('tr', {}, [
                        h('td', {}, [r.kind]),
                        h('td', { class: 'y2-divcell' }, [divName(r.div)]),
                        h('td', {}, [r.name]),
                        h('td', {}, [r.item || '—']),
                        h('td', { class: 'num' }, [r.amount != null ? `${fmtN(r.amount)}원` : '—'])
                      ])))
                    ]) : h('div', { class: 'empty' }, ['해당 집행방식의 실적이 아직 없습니다.'])
                  ]));
                }
              }, [`${t} ${execCounts[t] || 0}건`]))),
          h('div', { id: 'y2-exec-detail' }),
          h('div', { class: 'note' }, ['칩을 클릭하면 해당 집행방식의 프로그램·지출 목록이 표시됩니다.'])
        ])
      ])
    ]));

    // 프로그램 실적 표
    const progRows = [];
    divs.forEach(d => d.programs.forEach(p => progRows.push({ divLabel: divNameWithCode(d), ...p })));
    el.appendChild(h('section', { class: 'section' }, [
      sectionHead('프로그램 실적', `${progRows.length}건 — 프로그램 1건 = 1행 (표준 서식)`),
      h('div', { class: 'card' }, [
        progRows.length ? h('div', { class: 'y2-tblwrap' }, [h('table', { class: 'tbl' }, [
          h('thead', {}, [h('tr', {}, ['사업단(단위과제)','프로그램명','유형','TANKer','예산항목','교육기관','참여학생','교육시간','만족도','소요예산','상태'].map(c => h('th', {}, [c])))]),
          h('tbody', {}, progRows.map(p => h('tr', {}, [
            h('td', { class: 'y2-divcell' }, [p.divLabel]),
            h('td', {}, [p.name]),
            h('td', {}, [p.category || '—']),
            h('td', {}, [p.tanker ? h('span', { class: 'y2-tk', title: TANKER[p.tanker] || '' }, [`${p.tanker}${p.tankerSub ? '·' + p.tankerSub : ''}`]) : '—']),
            h('td', {}, [p.budgetItem || '—']),
            h('td', {}, [p.org || '—']),
            h('td', { class: 'num' }, [p.students != null ? `${p.students}명` : '—']),
            h('td', {}, [p.hours || '—']),
            h('td', { class: 'num' }, [p.satis != null ? `${p.satis}${p.satisN ? ` (n=${p.satisN})` : ' 🔴'}` : '—']),
            h('td', { class: 'num' }, [
              p.budget != null ? `${fmtN(p.budget)}원` : '—',
              p.execType ? h('div', { class: 'y2-exec-sub' }, [p.execType]) : null
            ]),
            h('td', {}, [p.status === '검토완료' || p.status === '입력반영' ? '🟢 ' + p.status : '🔴 ' + p.status])
          ])))
        ])]) : h('div', { class: 'empty' }, ['접수된 프로그램 실적이 없습니다.'])
      ])
    ]));

    // 지출 기록 표
    const spendRows = [];
    divs.forEach(d => d.spending.forEach(x => spendRows.push({ divLabel: divNameWithCode(d), ...x })));
    el.appendChild(h('section', { class: 'section' }, [
      sectionHead('지출 기록', `${spendRows.length}건 — 지급요청 공문 전수 기록`),
      h('div', { class: 'card' }, [
        spendRows.length ? h('div', { class: 'y2-tblwrap' }, [h('table', { class: 'tbl' }, [
          h('thead', {}, [h('tr', {}, ['사업단(단위과제)','일자','지출건명','예산항목','금액','근거문서','검증'].map(c => h('th', {}, [c])))]),
          h('tbody', {}, spendRows.map(x => h('tr', {}, [
            h('td', { class: 'y2-divcell' }, [x.divLabel]),
            h('td', {}, [x.date || '—']),
            h('td', {}, [x.name]),
            h('td', {}, [x.item || '—']),
            h('td', { class: 'num' }, [`${fmtN(x.amount)}원`]),
            h('td', {}, [x.doc || '—']),
            h('td', {}, [x.verified ? '🟢' : '🔴'])
          ])))
        ])]) : h('div', { class: 'empty' }, ['기록된 지출이 없습니다.'])
      ])
    ]));

    // 성과지표 (’26 목표 + 프로그램 연관)
    // 연관: 카드의 지표매핑 태그가 지표의 구분 토큰(지자체➊, 자체➋ …)으로 시작하면 연결
    function linkedPrograms(d, group) {
      return d.programs.filter(p => (p.indicators || []).some(t => t.startsWith(group)));
    }
    el.appendChild(h('section', { class: 'section' }, [
      sectionHead('성과지표 현황 (’26)', '정본: 1차연도 종합연차보고서 pp.21-22 — 근거 프로그램은 카드의 지표매핑으로 자동 연결'),
      h('div', { class: 'card' }, divs.map(d => {
        const linkedTotal = d.indicators.reduce((a, i) => a + linkedPrograms(d, i.group).length, 0);
        return h('details', { class: 'y2-ind' }, [
          h('summary', {}, [`${divNameWithCode(d)} — 지표 ${d.indicators.length}개${linkedTotal ? ` · 연관 프로그램 ${linkedTotal}건` : ''}`]),
          d.indicators.length ? h('div', { class: 'y2-tblwrap' }, [h('table', { class: 'tbl' }, [
            h('thead', {}, [h('tr', {}, ['구분','지표명','단위','’25 목표','’25 실적','’25 달성도','’26 목표','’26 실적(누적)','근거 프로그램'].map(c => h('th', {}, [c])))]),
            h('tbody', {}, d.indicators.map(i => {
              const linked = linkedPrograms(d, i.group);
              return h('tr', {}, [
                h('td', {}, [i.group]),
                h('td', {}, [i.name]),
                h('td', {}, [i.unit || '—']),
                h('td', { class: 'num' }, [String(i.target25 || '—')]),
                h('td', { class: 'num' }, [String(i.actual25 || '—')]),
                h('td', { class: 'num' }, [i.rate25 !== '' ? `${i.rate25}%` : '—']),
                h('td', { class: 'num strong' }, [String(i.target || '—')]),
                h('td', { class: 'num na' }, ['집계 대기']),
                h('td', { class: 'y2-linkcell' }, [
                  linked.length
                    ? h('span', {}, linked.map(p => h('span', { class: 'y2-linkchip', title: p.name }, [p.name.length > 14 ? p.name.slice(0, 13) + '…' : p.name])))
                    : h('span', { class: 'muted' }, ['—'])
                ])
              ]);
            }))
          ])]) : h('div', { class: 'empty' }, ['지표 정보 없음'])
        ]);
      }))
    ]));

    el.appendChild(h('div', { class: 'note' }, [
      `데이터 원천: 성과관리 시스템 (원장·프로그램 카드·지출 기록) · 생성 ${new Date(Y2.generatedAt).toLocaleString('ko-KR')}`
    ]));
  }

  let _y2Chart = null;
  let _y2Donut = null;
  function renderYear2Charts() {
    if (!window.Chart) return;
    const Y2 = y2Data();
    if (!Y2) return;

    // TANKer 도넛: 집행액 기준 (전부 0이면 프로그램 건수 기준)
    const donutCtx = document.getElementById('y2-tanker-donut');
    if (donutCtx) {
      if (_y2Donut) { _y2Donut.destroy(); _y2Donut = null; }
      const progs = Y2.divisions.flatMap(d => d.programs);
      const spends = Y2.divisions.flatMap(d => d.spending);
      const amounts = TANKER_KEYS.map(k => spends.filter(s => s.tanker === k).reduce((a, s) => a + s.amount, 0));
      const counts = TANKER_KEYS.map(k => progs.filter(p => p.tanker === k).length);
      const useAmount = amounts.some(v => v > 0);
      const data = useAmount ? amounts : counts;
      _y2Donut = new Chart(donutCtx, {
        type: 'doughnut',
        data: {
          labels: TANKER_KEYS.map(k => `${k} ${TANKER[k]}`),
          datasets: [{
            data,
            backgroundColor: ['#0a2540', '#1c7293', '#f5b700', '#f26b4f'],
            borderColor: '#fff', borderWidth: 2
          }]
        },
        options: {
          responsive: true, maintainAspectRatio: false, cutout: '58%',
          plugins: {
            legend: { display: false },
            tooltip: { callbacks: { label: (c) => useAmount
              ? `${c.label}: ${Number(c.parsed).toLocaleString('ko-KR')}원`
              : `${c.label}: ${c.parsed}건` } }
          }
        }
      });
    }

    const ctx = document.getElementById('y2-budget-chart');
    if (!ctx) return;
    if (_y2Chart) { _y2Chart.destroy(); _y2Chart = null; }
    _y2Chart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: Y2.divisions.map(d => d.key),
        datasets: [
          { label: '편성(백만원)', data: Y2.divisions.map(d => d.budget.totalM), backgroundColor: '#b9cfe4', borderWidth: 0, borderRadius: 2 },
          { label: '집행(백만원)', data: Y2.divisions.map(d => d.budget.spentWon / 1e6), backgroundColor: '#f5b700', borderWidth: 0, borderRadius: 2 }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false, indexAxis: 'y',
        categoryPercentage: 0.72, barPercentage: 0.95,
        plugins: {
          legend: { position: 'bottom', labels: { boxWidth: 22, boxHeight: 10, borderRadius: 3, useBorderRadius: true, font: { size: 11.5 }, padding: 16 } },
          tooltip: {
            backgroundColor: 'rgba(10,37,64,.94)', padding: 12, cornerRadius: 8, titleFont: { size: 12 },
            callbacks: {
              title: (items) => divNameWithCode(Y2.divisions[items[0].dataIndex]),
              label: (c) => `${c.dataset.label}: ${Math.round(c.parsed.x * 1e6).toLocaleString('ko-KR')}원`
            }
          }
        },
        scales: {
          x: { beginAtZero: true, grid: { color: '#eef2f6' }, border: { display: false },
               ticks: { font: { size: 11 }, color: '#7b8894' },
               title: { display: true, text: '백만원', font: { size: 10.5 }, color: '#98a4af' } },
          y: { ticks: { font: { size: 12.5, weight: 700 }, color: '#22303c', autoSkip: false },
               grid: { display: false }, border: { display: false } }
        }
      }
    });
  }

  // ---------- init ----------
  function init() {
    buildSidebar();
    buildMobileQuickNav();
    buildYear2();
    requestAnimationFrame(() => { renderYear2Charts(); });

    const today = $('#today');
    if (today) today.textContent = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });

    const v = VIEWS.find(x => x.id === _currentView);
    if (v && $('#crumb')) $('#crumb').innerHTML = crumbHtml(v);

    // mobile drawer
    const toggle = $('#nav-toggle');
    const backdrop = $('#nav-backdrop');
    if (toggle) toggle.addEventListener('click', () => document.body.classList.toggle('nav-open'));
    if (backdrop) backdrop.addEventListener('click', () => document.body.classList.remove('nav-open'));

    // scroll-spy (단일 뷰지만 활성 표시 일관성 유지)
    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver(entries => {
        entries.forEach(en => {
          if (!en.isIntersecting) return;
          const id = en.target.id.replace('view-', '');
          _currentView = id;
          $$('.nav button').forEach(b => b.classList.toggle('active', b.dataset.view === id));
          $$('#mobile-quicknav .q').forEach(b => b.classList.toggle('active', b.dataset.view === id));
        });
      }, { rootMargin: '-40% 0px -55% 0px' });
      $$('.view').forEach(sec => io.observe(sec));
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
