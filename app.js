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

  // 사업단 표시명: 수정사업계획서 풀네임 (과제코드)
  const divName = d => d.fullName || d.key;
  const divNameWithCode = d => d.code ? `${divName(d)} (${d.code})` : divName(d);
  // 차트용 멀티라인 라벨: 긴 풀네임을 어절 단위로 2~3줄 분할
  function chartLabel(d) {
    const words = divName(d).split(' ');
    const lines = [];
    let cur = '';
    for (const w of words) {
      if ((cur + ' ' + w).trim().length > 14 && cur) { lines.push(cur); cur = w; }
      else cur = (cur + ' ' + w).trim();
    }
    if (cur) lines.push(cur);
    return lines.slice(0, 3);
  }

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

  function y2DivCard(d) {
    const waiting = d.status !== '진행';
    const satis = d.satisfaction.avg != null ? `${d.satisfaction.avg}` : '—';
    return h('div', { class: `card y2-divcard ${waiting ? 'waiting' : ''}` }, [
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
      sectionHead('사업단별 현황', '2차년도 수정사업계획서 기준 단위과제 — 수치는 프로그램 카드·지출 기록 합산값'),
      h('div', { class: 'y2-divgrid' }, divs.map(y2DivCard))
    ]));

    // 예산 차트 + 집행 현황
    el.appendChild(h('section', { class: 'section' }, [
      sectionHead('예산 편성·집행', '단위: 백만원 — 집행은 접수된 지출 문서만 반영'),
      h('div', { class: 'grid-2' }, [
        h('div', { class: 'card' }, [
          h('h3', {}, ['사업단별 편성 대비 집행']),
          h('div', { class: 'chart-wrap tall' }, [h('canvas', { id: 'y2-budget-chart' })])
        ]),
        h('div', { class: 'card' }, [
          h('h3', {}, ['집행률 현황']),
          h('div', {}, divs.map(y2RateRow)),
          h('div', { class: 'note' }, ['집행률 = 반영된 지출 ÷ 편성 총액. 지급요청 공문이 전부 접수되기 전까지는 실제보다 낮게 표시됩니다.'])
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
          h('thead', {}, [h('tr', {}, ['사업단(단위과제)','프로그램명','유형','교육기관','참여학생','교육시간','만족도','소요예산','상태'].map(c => h('th', {}, [c])))]),
          h('tbody', {}, progRows.map(p => h('tr', {}, [
            h('td', { class: 'y2-divcell' }, [p.divLabel]),
            h('td', {}, [p.name]),
            h('td', {}, [p.category || '—']),
            h('td', {}, [p.org || '—']),
            h('td', { class: 'num' }, [p.students != null ? `${p.students}명` : '—']),
            h('td', {}, [p.hours || '—']),
            h('td', { class: 'num' }, [p.satis != null ? `${p.satis}${p.satisN ? ` (n=${p.satisN})` : ' 🔴'}` : '—']),
            h('td', { class: 'num' }, [p.budget != null ? `${fmtN(p.budget)}원` : '—']),
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

    // 성과지표 목표 ('26)
    el.appendChild(h('section', { class: 'section' }, [
      sectionHead('성과지표 목표 (’26)', '출처: 2차연도 종합수정사업계획서 — 실적(누적)은 프로그램 집계 후 자동 반영'),
      h('div', { class: 'card' }, divs.map(d => h('details', { class: 'y2-ind' }, [
        h('summary', {}, [`${divNameWithCode(d)} — 지표 ${d.indicators.length}개`]),
        d.indicators.length ? h('div', { class: 'y2-tblwrap' }, [h('table', { class: 'tbl' }, [
          h('thead', {}, [h('tr', {}, ['구분','지표명','기준값','’26 목표','’25 실적','’26 실적(누적)'].map(c => h('th', {}, [c])))]),
          h('tbody', {}, d.indicators.map(i => h('tr', {}, [
            h('td', {}, [i.group]),
            h('td', {}, [i.name]),
            h('td', { class: 'num' }, [String(i.base || '—')]),
            h('td', { class: 'num' }, [String(i.target || '—')]),
            h('td', { class: 'num' }, [String(i.prev || '—')]),
            h('td', { class: 'num na' }, ['집계 대기'])
          ])))
        ])]) : h('div', { class: 'empty' }, ['지표 정보 없음'])
      ])))
    ]));

    el.appendChild(h('div', { class: 'note' }, [
      `데이터 원천: 성과관리 시스템 (원장·프로그램 카드·지출 기록) · 생성 ${new Date(Y2.generatedAt).toLocaleString('ko-KR')}`
    ]));
  }

  let _y2Chart = null;
  function renderYear2Charts() {
    if (!window.Chart) return;
    const Y2 = y2Data();
    if (!Y2) return;
    const ctx = document.getElementById('y2-budget-chart');
    if (!ctx) return;
    if (_y2Chart) { _y2Chart.destroy(); _y2Chart = null; }
    _y2Chart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: Y2.divisions.map(chartLabel),
        datasets: [
          { label: '편성(백만원)', data: Y2.divisions.map(d => d.budget.totalM), backgroundColor: 'rgba(10,37,64,0.18)', borderColor: '#0a2540', borderWidth: 1 },
          { label: '집행(백만원)', data: Y2.divisions.map(d => d.budget.spentWon / 1e6), backgroundColor: 'rgba(28,114,147,0.75)', borderColor: '#1c7293', borderWidth: 1 }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false, indexAxis: 'y',
        plugins: {
          legend: { position: 'bottom' },
          tooltip: { callbacks: { label: (c) =>
            `${c.dataset.label}: ${Math.round(c.parsed.x * 1e6).toLocaleString('ko-KR')}원`
          } }
        },
        scales: { x: { beginAtZero: true }, y: { ticks: { font: { size: 10.5 }, autoSkip: false } } }
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
