(() => {
  const { META, PROJECTS, COMMON_INDICATORS, SELF_INDICES,
          PROJECT_PERFORMANCE_COLUMNS, PROJECT_PERFORMANCE_ROWS,
          INFRASTRUCTURE, COMMUNITY } = window.__RISE__;

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
  const deepClone = (o) => JSON.parse(JSON.stringify(o));

  // ---------- store ----------
  const STORE_KEY = 'rise.platform.v1';
  const Store = {
    state: null,
    listeners: new Set(),
    init() {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) {
        try { this.state = this.migrate(JSON.parse(raw)); return; } catch {}
      }
      this.state = this.seed();
    },
    seed() {
      return {
        common: COMMON_INDICATORS.map(i => ({ name: i.name, unit: i.unit, data: { ...i.data } })),
        self: SELF_INDICES.map(s => ({
          name: s.name, desc: s.desc,
          items: s.items.map(it => ({ name: it.name, project: it.project, rows: it.rows, 목표: null, 실적: null, 단위: '' }))
        })),
        projects: PROJECT_PERFORMANCE_ROWS.map(r => deepClone(r)),
        infra: { groups: INFRASTRUCTURE.groups.map(g => ({ name: g.name, items: g.items.map(it => ({ ...it })) })) },
        community: {
          students:  COMMUNITY.students.map(p => ({ ...p })),
          companies: COMMUNITY.companies.map(p => ({ ...p })),
          corpPosts: COMMUNITY.corpPosts.map(p => ({ ...p })),
          stats:     { ...COMMUNITY.stats }
        }
      };
    },
    migrate(s) {
      // Ensure shape is present, merge with seed where missing
      const base = this.seed();
      base.common = (s.common && s.common.length === base.common.length) ? s.common : base.common;
      base.self = (s.self && s.self.length === base.self.length)
        ? s.self.map((g, i) => ({
            ...base.self[i],
            items: g.items.map((it, j) => ({ ...base.self[i].items[j], ...it }))
          }))
        : base.self;
      base.projects = (s.projects && s.projects.length === base.projects.length) ? s.projects : base.projects;
      base.infra = s.infra || base.infra;
      base.community = s.community && s.community.students ? s.community : base.community;
      return base;
    },
    save() {
      localStorage.setItem(STORE_KEY, JSON.stringify(this.state));
      pingSaveIndicator();
      this.listeners.forEach(fn => fn());
    },
    reset() {
      localStorage.removeItem(STORE_KEY);
      this.state = this.seed();
      this.save();
    },
    exportJson() {
      const blob = new Blob([JSON.stringify(this.state, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `RISE_성과데이터_${new Date().toISOString().slice(0,10)}.json`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    },
    importJson(obj) {
      this.state = this.migrate(obj);
      this.save();
    },
    onChange(fn) { this.listeners.add(fn); }
  };

  // ---------- KPI computed from store ----------
  function getKpi() {
    const sum = (name) => {
      const ind = Store.state.common.find(i => i.name === name);
      if (!ind) return 0;
      return Object.values(ind.data).reduce((a, b) => a + (b || 0), 0);
    };
    return {
      totalMOU: sum('MOU 건수'),
      totalPress: sum('언론보도 건수'),
      totalEvents: sum('행사 운영 건수'),
      totalCrossRegion: sum('초광역 지산학 연계 건수'),
      totalCrossProject: sum('사업단 연계 건수'),
      projectCount: PROJECTS.length,
      indexCount: SELF_INDICES.length,
      subIndicatorCount: SELF_INDICES.reduce((a, b) => a + b.items.length, 0)
    };
  }

  // ---------- edit primitives ----------
  // parseNum: "" → null, else Number
  const parseNum = (s) => {
    if (s == null) return null;
    const str = String(s).trim().replace(/,/g, '');
    if (str === '') return null;
    const n = Number(str);
    return isNaN(n) ? null : n;
  };

  // numeric inline-edit field
  function numEdit(getVal, setVal, opts = {}) {
    const input = h('input', {
      type: 'text',
      class: 'edit-num',
      inputmode: 'decimal',
      placeholder: opts.placeholder || '—',
      value: getVal() == null ? '' : String(getVal())
    });
    input.addEventListener('blur', () => {
      const v = parseNum(input.value);
      setVal(v);
      input.value = v == null ? '' : String(v);
      Store.save();
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') input.blur();
      if (e.key === 'Escape') { input.value = getVal() == null ? '' : String(getVal()); input.blur(); }
    });
    return input;
  }

  // text inline-edit field (single line)
  function txtEdit(getVal, setVal, opts = {}) {
    const input = h('input', {
      type: 'text',
      class: 'edit-txt',
      placeholder: opts.placeholder || '—',
      value: getVal() || ''
    });
    input.addEventListener('blur', () => {
      const v = input.value.trim();
      setVal(v || '');
      Store.save();
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') input.blur();
      if (e.key === 'Escape') { input.value = getVal() || ''; input.blur(); }
    });
    return input;
  }

  // multiline text edit (textarea)
  function txtAreaEdit(getVal, setVal, opts = {}) {
    const ta = h('textarea', {
      class: 'edit-txtarea',
      rows: opts.rows || 2,
      placeholder: opts.placeholder || '—'
    });
    ta.value = getVal() || '';
    ta.addEventListener('blur', () => {
      const v = ta.value.trim();
      setVal(v || '');
      Store.save();
    });
    return ta;
  }

  // ---------- save indicator ----------
  let saveTimer = null;
  function pingSaveIndicator() {
    const el = $('#save-indicator');
    if (!el) return;
    el.classList.remove('saved');
    el.classList.add('saving');
    el.textContent = '저장 중';
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      el.classList.remove('saving');
      el.classList.add('saved');
      el.textContent = '저장됨';
    }, 280);
  }

  // ---------- navigation ----------
  const VIEWS = [
    { id: 'overview',   label: '개요',             desc: '성과 종합' },
    { id: 'common',     label: '공통지표',         desc: '교육부 공통지표' },
    { id: 'self',       label: '대학자체지표',     desc: '5대 지수 체계' },
    { id: 'project',    label: '과제별 성과',      desc: '8개 과제' },
    { id: 'infra',      label: '기타 구축',         desc: '거버넌스·인프라' },
    { id: 'community',  label: '커뮤니티',         desc: '학생 · 기업체' },
    { id: 'formula',    label: '산식·정의',         desc: '지표 방법론' }
  ];

  // ---------- password-protected views ----------
  const PROTECTED_VIEWS = new Set(['formula']);
  const PW_HASH = 'a069a4137161ad159f43df3bb9342d0637eeebcafefbe01a64b9d69ac338eb25';
  const LOCK_KEY = 'rise.unlocked.v1';

  async function sha256Hex(text) {
    const buf = new TextEncoder().encode(text);
    const digest = await crypto.subtle.digest('SHA-256', buf);
    return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2,'0')).join('');
  }
  function isUnlocked(viewId) {
    if (!PROTECTED_VIEWS.has(viewId)) return true;
    try { return sessionStorage.getItem(LOCK_KEY) === '1'; } catch { return false; }
  }
  function promptPassword() {
    return new Promise((resolve) => {
      const modal = h('div', { class: 'pw-modal', role: 'dialog', 'aria-modal': 'true' }, [
        h('div', { class: 'pw-card' }, [
          h('div', { class: 'pw-icon' }),
          h('h3', {}, ['접근 제한']),
          h('p', {}, ['산식·정의 영역은 인증된 관리자만 열람할 수 있습니다. 비밀번호를 입력하세요.']),
          h('input', { type: 'password', class: 'pw-input', placeholder: '비밀번호', autocomplete: 'off' }),
          h('div', { class: 'pw-err', 'aria-live': 'polite' }, ['']),
          h('div', { class: 'pw-actions' }, [
            h('button', { class: 'tb-btn', 'data-role': 'cancel' }, ['취소']),
            h('button', { class: 'tb-btn primary', 'data-role': 'ok' }, ['확인'])
          ])
        ])
      ]);
      document.body.appendChild(modal);
      const input = modal.querySelector('.pw-input');
      const err = modal.querySelector('.pw-err');
      const close = (ok) => { modal.remove(); resolve(ok); };
      const submit = async () => {
        err.textContent = '';
        const v = input.value;
        if (!v) { err.textContent = '비밀번호를 입력해 주세요.'; input.focus(); return; }
        const hash = await sha256Hex(v);
        if (hash === PW_HASH) {
          try { sessionStorage.setItem(LOCK_KEY, '1'); } catch {}
          close(true);
        } else {
          err.textContent = '비밀번호가 일치하지 않습니다.';
          input.value = ''; input.focus();
          modal.querySelector('.pw-card').classList.remove('shake');
          // reflow then re-add
          void modal.offsetWidth;
          modal.querySelector('.pw-card').classList.add('shake');
        }
      };
      modal.querySelector('[data-role="ok"]').addEventListener('click', submit);
      modal.querySelector('[data-role="cancel"]').addEventListener('click', () => close(false));
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); submit(); }
        if (e.key === 'Escape') close(false);
      });
      setTimeout(() => input.focus(), 30);
    });
  }

  let _currentView = 'overview';
  async function setView(id) {
    // Scroll-nav mode: all views visible. Only formula still gates on password.
    if (id === 'formula' && !isUnlocked(id)) {
      const ok = await promptPassword();
      if (!ok) return;
      buildFormula();   // reveal content after unlock
      buildSidebar();
    }
    _currentView = id;
    $$('.nav button').forEach(b => b.classList.toggle('active', b.dataset.view === id));
    const v = VIEWS.find(x => x.id === id);
    $('#crumb').innerHTML = `호원RISE · <strong>${v.label}</strong> · ${v.desc}`;
    const target = document.getElementById(`view-${id}`);
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // ---------- mobile quick nav ----------
  function buildMobileQuickNav() {
    const host = $('#mobile-quicknav');
    if (!host) return;
    host.innerHTML = '';
    VIEWS.forEach(v => {
      const btn = h('button', {
        class: 'q',
        'data-view': v.id,
        onclick: () => setView(v.id)
      }, [v.label]);
      if (v.id === _currentView) btn.classList.add('active');
      host.appendChild(btn);
    });
  }

  // ---------- sidebar ----------
  function buildSidebar() {
    const nav = $('#nav');
    nav.innerHTML = '';
    const kpi = getKpi();
    const counts = {
      overview: '',
      common: Store.state.common.length,
      self: kpi.subIndicatorCount,
      project: Store.state.projects.length,
      infra: Store.state.infra.groups.reduce((a,b) => a + b.items.length, 0),
      community: (Store.state.community?.students?.length || 0) + (Store.state.community?.companies?.length || 0),
      formula: ''
    };
    VIEWS.forEach(v => {
      const btn = h('button', { 'data-view': v.id, onclick: () => setView(v.id) }, [
        h('span', { class: 'dot' }),
        document.createTextNode(v.label),
        counts[v.id] !== '' ? h('span', { class: 'count' }, [String(counts[v.id])]) : null
      ]);
      if (v.id === _currentView) btn.classList.add('active');
      if (PROTECTED_VIEWS.has(v.id)) {
        btn.classList.add('protected');
        if (isUnlocked(v.id)) btn.classList.add('unlocked');
      }
      nav.appendChild(btn);
    });
  }

  // ---------- overview ----------
  function buildOverview() {
    const el = $('#view-overview');
    el.innerHTML = '';
    el.appendChild(h('div', { class: 'view-anchor' }, ['개요 · 성과 종합']));
    const KPI = getKpi();

    const hero = h('section', { class: 'hero' }, [
      h('div', { class: 'kicker' }, ['HOWON UNIVERSITY · RISE PROGRAM']),
      h('h1', {}, [META.title]),
      h('p', { class: 'lead' }, [`목표 — ${META.goal}`]),
      h('p', { class: 'lead', style: 'margin-top:-14px' }, [`비전 — ${META.vision}`]),
      h('div', { class: 'hero-grid' }, [
        kpiInHero('과제 수',        KPI.projectCount, '개 과제'),
        kpiInHero('자체지표 체계',  KPI.indexCount,   '대 지수'),
        kpiInHero('세부 지표',       KPI.subIndicatorCount, '개 항목'),
        kpiInHero('외부 파급',       KPI.totalMOU + KPI.totalPress + KPI.totalEvents, '건 누적')
      ])
    ]);
    el.appendChild(hero);

    const kpiSec = h('section', { class: 'section' }, [
      sectionHead('성과확산도 현황', '공통지표 중 외부 확산·연계 실적 5종 (A3 지표 구성)'),
      h('div', { class: 'grid-4' }, [
        kpiCard('초광역 지산학 연계', KPI.totalCrossRegion, '건', '타 지역·권역 기관과의 연계·협력 활동'),
        kpiCard('사업단 연계',         KPI.totalCrossProject, '건', 'RISE 사업단 간 공동 추진 실적'),
        kpiCard('MOU 체결',            KPI.totalMOU, '건', '대내외 협력기관 간 업무협약'),
        kpiCard('언론보도',            KPI.totalPress, '건', '외부 언론매체 보도 실적'),
        kpiCard('공식 행사 운영',      KPI.totalEvents, '건', '포럼·워크숍·성과공유회·설명회 등'),
        kpiCard('과제 규모',            KPI.projectCount, '개', '8대 핵심 과제 추진 중'),
        kpiCard('자체지표 체계',        KPI.indexCount, '대', '5대 지수 × 하위 24종 지표'),
        kpiCard('세부 지표',             KPI.subIndicatorCount, '개', '지수별 세부 측정 항목')
      ])
    ]);
    el.appendChild(kpiSec);

    const distSec = h('section', { class: 'section' }, [
      sectionHead('과제별 성과확산 분포', 'MOU · 언론보도 · 행사 · 연계 건수의 과제별 분포'),
      h('div', { class: 'grid-2' }, [
        h('div', { class: 'card' }, [
          h('div', { class: 'h3-row' }, [h('h3', {}, ['과제별 MOU 체결']), h('span', { class: 'aux' }, [`총 ${KPI.totalMOU}건`])]),
          barList(indData('MOU 건수'))
        ]),
        h('div', { class: 'card' }, [
          h('div', { class: 'h3-row' }, [h('h3', {}, ['과제별 언론보도']), h('span', { class: 'aux' }, [`총 ${KPI.totalPress}건`])]),
          barList(indData('언론보도 건수'))
        ]),
        h('div', { class: 'card' }, [
          h('div', { class: 'h3-row' }, [h('h3', {}, ['과제별 공식 행사']), h('span', { class: 'aux' }, [`총 ${KPI.totalEvents}건`])]),
          barList(indData('행사 운영 건수'))
        ]),
        h('div', { class: 'card' }, [
          h('div', { class: 'h3-row' }, [h('h3', {}, ['과제별 초광역·사업단 연계']),
            h('span', { class: 'aux' }, [`총 ${KPI.totalCrossRegion + KPI.totalCrossProject}건`])]),
          stackedLinkList()
        ])
      ])
    ]);
    el.appendChild(distSec);

    const chartSec = h('section', { class: 'section' }, [
      sectionHead('과제별 종합 성과 레이더', '5대 성과확산 지표의 과제별 현황 (표준화 지수)'),
      h('div', { class: 'card' }, [ h('div', { class: 'chart-wrap tall' }, [h('canvas', { id: 'radar-overview' })]) ])
    ]);
    el.appendChild(chartSec);
  }

  function indData(name) { return Store.state.common.find(i => i.name === name).data; }

  function kpiInHero(label, value, unit) {
    return h('div', { class: 'stat' }, [
      h('div', { class: 'k' }, [label]),
      h('div', { class: 'v' }, [String(fmtN(value)), h('span', { class: 'u' }, [unit])])
    ]);
  }
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
  function barList(dataObj) {
    const values = Object.values(dataObj).filter(v => v != null);
    const max = values.length ? Math.max(...values, 1) : 1;
    const wrap = h('div', {});
    PROJECTS.forEach(p => {
      const v = dataObj[p.key];
      const pct = (v == null ? 0 : (v / max) * 100);
      wrap.appendChild(h('div', { class: 'bar-row' }, [
        h('div', { class: 'lbl' }, [p.short]),
        h('div', { class: 'bar' }, [ h('i', { style: `width:${pct.toFixed(1)}%` }) ]),
        h('div', { class: `val ${v == null ? 'na' : ''}` }, [v == null ? '—' : fmtN(v)])
      ]));
    });
    return wrap;
  }
  function stackedLinkList() {
    const cross = indData('초광역 지산학 연계 건수');
    const inner = indData('사업단 연계 건수');
    const max = Math.max(...PROJECTS.map(p => (cross[p.key] || 0) + (inner[p.key] || 0)), 1);
    const wrap = h('div', {});
    PROJECTS.forEach(p => {
      const a = cross[p.key] || 0, b = inner[p.key] || 0, tot = a + b;
      const pa = (a / max) * 100, pb = (b / max) * 100;
      const hasAny = cross[p.key] != null || inner[p.key] != null;
      wrap.appendChild(h('div', { class: 'bar-row' }, [
        h('div', { class: 'lbl' }, [p.short]),
        h('div', { class: 'bar' }, [
          h('i', { style: `width:${(pa+pb).toFixed(1)}%; background:linear-gradient(90deg,#064e3b,#10b981);` })
        ]),
        h('div', { class: `val ${!hasAny ? 'na' : ''}` }, [!hasAny ? '—' : fmtN(tot)])
      ]));
    });
    return wrap;
  }

  let _radarChart = null;
  function renderOverviewCharts() {
    const c = document.getElementById('radar-overview');
    if (!c || !window.Chart) return;
    if (_radarChart) _radarChart.destroy();
    const metrics = ['MOU 건수', '언론보도 건수', '행사 운영 건수', '초광역 지산학 연계 건수', '사업단 연계 건수'];
    const maxes = metrics.map(m => {
      const d = indData(m);
      return Math.max(...Object.values(d).filter(v => v != null), 1);
    });
    // Modern emerald + slate monochrome palette
    const palette = [
      'rgba(6,78,59,0.18)',   'rgba(4,120,87,0.18)', 'rgba(5,150,105,0.18)', 'rgba(16,185,129,0.20)',
      'rgba(52,211,153,0.22)', 'rgba(51,65,85,0.18)', 'rgba(100,116,139,0.20)', 'rgba(148,163,184,0.22)'
    ];
    const borders = ['#064e3b','#047857','#059669','#10b981','#34d399','#334155','#64748b','#94a3b8'];
    const datasets = PROJECTS.map((p, i) => ({
      label: p.short,
      data: metrics.map((m, idx) => { const v = indData(m)[p.key]; return v == null ? 0 : (v / maxes[idx]) * 100; }),
      backgroundColor: palette[i], borderColor: borders[i], borderWidth: 1.6,
      pointBackgroundColor: borders[i], pointRadius: 2.6
    }));
    _radarChart = new Chart(c, {
      type: 'radar',
      data: { labels: ['MOU','언론보도','행사','초광역연계','사업단연계'], datasets },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom', labels: { color: '#2d3e37', font: { size: 11 }, boxWidth: 10, padding: 14 } },
          tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ${ctx.raw.toFixed(1)} (지수)` } }
        },
        scales: {
          r: {
            min: 0, max: 100,
            grid: { color: 'rgba(31,93,65,0.10)' },
            angleLines: { color: 'rgba(31,93,65,0.08)' },
            pointLabels: { color: '#1f5d41', font: { size: 11, weight: '600' } },
            ticks: { color: '#b0bab4', backdropColor: 'transparent', font: { size: 9 } }
          }
        }
      }
    });
  }

  // ---------- common ----------
  let _commonProject = 'all';
  let _commonChart = null;

  function buildCommon() {
    const el = $('#view-common');
    el.innerHTML = '';
    el.appendChild(h('div', { class: 'view-anchor' }, ['공통지표 · 교육부 공통지표']));

    el.appendChild(h('section', { class: 'section' }, [
      sectionHead('공통지표 현황', '교육부 공통지표 및 지자체 자율지표를 제외한 대학자체 공통 지표. 값을 직접 입력할 수 있습니다.',
        [filterBar()]),
      h('div', { class: 'card' }, [ h('div', { class: 'chart-wrap tall' }, [h('canvas', { id: 'common-chart' })]) ])
    ]));

    el.appendChild(h('section', { class: 'section' }, [
      sectionHead('과제 × 지표 매트릭스 · 직접 입력', '셀을 클릭해 값을 입력하면 자동 저장되고 차트·KPI가 갱신됩니다.'),
      h('div', { class: 'card matrix-card' }, [h('div', { class: 'matrix-scroll' }, [matrixEditGrid()])])
    ]));

    el.appendChild(h('section', { class: 'section' }, [
      sectionHead('공통지표 원자료', '엑셀 성과양식의 공통지표 전체 원자료 (편집 가능).'),
      h('div', {}, [commonFullTable()])
    ]));

    renderCommonChart();
  }

  function filterBar() {
    const bar = h('div', { class: 'filter-bar' });
    const mk = (key, label) => {
      const btn = h('button', { 'data-p': key, onclick: () => {
        _commonProject = key;
        $$('.filter-bar button').forEach(b => b.classList.toggle('active', b.dataset.p === key));
        renderCommonChart();
      }}, [label]);
      if (key === _commonProject) btn.classList.add('active');
      return btn;
    };
    bar.appendChild(mk('all', '전체'));
    PROJECTS.forEach(p => bar.appendChild(mk(p.key, p.short)));
    return bar;
  }

  function matrixEditGrid() {
    const wrap = h('div', {});
    wrap.appendChild(h('div', { class: 'project-row head' }, [
      h('div', {}, ['지표']),
      ...PROJECTS.map(p => h('div', { style: 'text-align:center' }, [p.short]))
    ]));
    Store.state.common.forEach((ind) => {
      const row = h('div', { class: 'project-row' }, [ h('div', { class: 'ind-name' }, [ind.name]) ]);
      PROJECTS.forEach(p => {
        const cell = h('div', { class: 'cell edit-cell' }, [
          numEdit(
            () => ind.data[p.key],
            (v) => { ind.data[p.key] = v; queueRerender(); }
          )
        ]);
        row.appendChild(cell);
      });
      wrap.appendChild(row);
    });
    return wrap;
  }

  function commonFullTable() {
    const tbl = h('table', { class: 'tbl' });
    tbl.appendChild(h('thead', {}, [
      h('tr', {}, [h('th', {}, ['지표명']), h('th', {}, ['단위']),
        ...PROJECTS.map(p => h('th', { style: 'text-align:right' }, [p.short])),
        h('th', { style: 'text-align:right' }, ['합계'])])
    ]));
    const tbody = h('tbody');
    Store.state.common.forEach(ind => {
      const tr = h('tr');
      tr.appendChild(h('td', {}, [ind.name]));
      tr.appendChild(h('td', {}, [ind.unit]));
      PROJECTS.forEach(p => {
        const td = h('td', { class: 'num edit-td' }, [
          numEdit(() => ind.data[p.key], (v) => { ind.data[p.key] = v; queueRerender(); })
        ]);
        tr.appendChild(td);
      });
      const sum = PROJECTS.map(p => ind.data[p.key] || 0).reduce((a,b) => a+b, 0);
      const hasAny = PROJECTS.some(p => ind.data[p.key] != null);
      tr.appendChild(h('td', { class: `num ${!hasAny ? 'na' : ''}` }, [hasAny ? fmtN(sum) : '—']));
      tbody.appendChild(tr);
    });
    tbl.appendChild(tbody);
    return tbl;
  }

  function renderCommonChart() {
    const c = document.getElementById('common-chart');
    if (!c || !window.Chart) return;
    if (_commonChart) _commonChart.destroy();
    const countInds = Store.state.common.filter(i =>
      ['초광역 지산학 연계 건수','사업단 연계 건수','MOU 건수','언론보도 건수','행사 운영 건수'].includes(i.name));
    let labels, datasets;
    const makeGradient = (ctx) => {
      const g = ctx.chart.ctx.createLinearGradient(0, 0, 0, 280);
      g.addColorStop(0, 'rgba(6,78,59,0.95)'); g.addColorStop(1, 'rgba(52,211,153,0.55)');
      return g;
    };
    if (_commonProject === 'all') {
      labels = PROJECTS.map(p => p.short);
      datasets = countInds.map((ind, idx) => ({
        label: ind.name,
        data: PROJECTS.map(p => ind.data[p.key] || 0),
        backgroundColor: ['#064e3b','#047857','#059669','#10b981','#34d399'][idx],
        borderRadius: 8, barThickness: 18
      }));
    } else {
      labels = countInds.map(i => i.name.replace(' 건수',''));
      datasets = [{
        label: `${_commonProject} 사업단`,
        data: countInds.map(i => i.data[_commonProject] || 0),
        backgroundColor: (ctx) => makeGradient(ctx),
        borderRadius: 8, barThickness: 42
      }];
    }
    _commonChart = new Chart(c, {
      type: 'bar', data: { labels, datasets },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom', labels: { color: '#2d3e37', font: { size: 11 }, boxWidth: 10, padding: 14 } },
          tooltip: { callbacks: { label: (ctx) => ` ${ctx.dataset.label}: ${ctx.raw}건` } }
        },
        scales: {
          x: { grid: { display: false }, ticks: { color: '#697871', font: { size: 11 } } },
          y: { grid: { color: 'rgba(31,93,65,0.06)' }, ticks: { color: '#b0bab4', font: { size: 10 } }, beginAtZero: true }
        }
      }
    });
  }

  // ---------- self indicators ----------
  function buildSelf() {
    const el = $('#view-self');
    el.innerHTML = '';
    el.appendChild(h('div', { class: 'view-anchor' }, ['대학자체지표 · 5대 지수 체계']));

    el.appendChild(h('section', { class: 'section' }, [
      sectionHead('대학자체지표 · 5대 지수 체계',
        '5대 성과지수와 24개 세부지표. 각 항목별 목표/실적을 입력하면 달성률이 자동 계산됩니다.')
    ]));

    const grid = h('div', { class: 'grid-2' });
    Store.state.self.forEach((idx, i) => {
      const card = h('div', { class: 'index-group' }, [
        h('div', { class: 'head' }, [
          h('div', { class: 'num' }, [String(i + 1)]),
          h('div', {}, [
            h('h3', {}, [idx.name]),
            h('p', {}, [idx.desc])
          ])
        ]),
        h('div', { class: 'sub-list' },
          idx.items.map((it) => h('div', { class: 'sub-item edit' }, [
            h('div', { class: 'name' }, [it.name]),
            h('span', { class: 'chip ghost' }, [it.project]),
            h('div', { class: 'edit-fields' }, [
              h('label', {}, [
                h('span', { class: 'lbl' }, ['목표']),
                numEdit(() => it.목표, (v) => { it.목표 = v; updateAchRate(it); queueRerender(); })
              ]),
              h('label', {}, [
                h('span', { class: 'lbl' }, ['실적']),
                numEdit(() => it.실적, (v) => { it.실적 = v; updateAchRate(it); queueRerender(); })
              ]),
              h('label', {}, [
                h('span', { class: 'lbl' }, ['단위']),
                txtEdit(() => it.단위, (v) => { it.단위 = v; }, { placeholder: '건/점/%' })
              ]),
              h('div', { class: 'rate' }, [
                h('span', { class: 'lbl' }, ['달성률']),
                h('b', {}, [it.목표 && it.실적 != null
                  ? `${Math.round((it.실적 / it.목표) * 100)}%`
                  : '—'])
              ])
            ])
          ]))
        )
      ]);
      grid.appendChild(card);
    });
    el.appendChild(grid);

    el.appendChild(h('section', { class: 'section' }, [
      sectionHead('지수별 세부지표 수', '5대 지수에 속한 세부 측정항목 수 비교'),
      h('div', { class: 'card' }, [ h('div', { class: 'chart-wrap' }, [h('canvas', { id: 'self-chart' })]) ])
    ]));

    setTimeout(renderSelfChart, 0);
  }

  function updateAchRate(it) { /* noop — rate is derived; handled on re-render */ }

  let _selfChart = null;
  function renderSelfChart() {
    const c = document.getElementById('self-chart');
    if (!c || !window.Chart) return;
    if (_selfChart) _selfChart.destroy();
    const labels = Store.state.self.map(s => s.name);
    const data = Store.state.self.map(s => s.items.length);
    _selfChart = new Chart(c, {
      type: 'bar',
      data: { labels, datasets: [{
        label: '세부 지표 수', data,
        backgroundColor: (ctx) => {
          const g = ctx.chart.ctx.createLinearGradient(0,0,ctx.chart.width,0);
          g.addColorStop(0,'#064e3b'); g.addColorStop(0.55,'#059669'); g.addColorStop(1,'#34d399');
          return g;
        },
        borderRadius: 10, barThickness: 36
      }]},
      options: {
        indexAxis: 'y', responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx) => ` ${ctx.raw}개 항목` } } },
        scales: {
          x: { grid: { color: 'rgba(31,93,65,0.06)' }, ticks: { color: '#b0bab4', font: { size: 10 } }, beginAtZero: true, precision: 0 },
          y: { grid: { display: false }, ticks: { color: '#2d3e37', font: { size: 12, weight: '600' } } }
        }
      }
    });
  }

  // ---------- project performance ----------
  function buildProject() {
    const el = $('#view-project');
    el.innerHTML = '';
    el.appendChild(h('div', { class: 'view-anchor' }, ['과제별 성과 · 8개 과제']));

    el.appendChild(h('section', { class: 'section' }, [
      sectionHead('과제별 사업 성과 · 직접 입력',
        '엑셀 양식 컬럼: 과제명 · 지수 · 추진전략 · 추진과제 · 추진계획 · 실적 · 달성률 · 페이지')
    ]));

    const grid = h('div', { class: 'grid-2' });
    Store.state.projects.forEach(r => {
      const rateDisplay = () => r.달성률 == null ? '—' : `${r.달성률}%`;
      grid.appendChild(h('div', { class: 'card flat proj-card' }, [
        h('div', { class: 'h3-row' }, [
          h('div', { style: 'display:flex; align-items:center; gap:10px; flex-wrap:wrap;' }, [
            h('span', { class: 'chip dark' }, [r.과제명]),
            h('h3', { style: 'margin:0' }, [r.지수])
          ]),
          h('div', { class: 'rate-wrap' }, [
            h('span', { class: 'aux' }, ['달성률']),
            numEdit(() => r.달성률, (v) => { r.달성률 = v; Store.save(); }, { placeholder: '%' })
          ])
        ]),
        h('ul', { class: 'callout-list edit' }, [
          liEdit('추진전략', () => r.전략, v => r.전략 = v),
          liEdit('추진과제', () => r.과제, v => r.과제 = v),
          liEdit('추진계획', () => r.계획, v => r.계획 = v),
          liEdit('실적',      () => (r.실적 === '-' ? '' : r.실적), v => r.실적 = v, true),
          liEdit('페이지',    () => r.페이지, v => r.페이지 = v)
        ])
      ]));
    });
    el.appendChild(grid);

    el.appendChild(h('section', { class: 'section' }, [
      sectionHead('통합 테이블', '과제별 추진전략 · 실적 · 달성률 한눈에 보기 (편집 가능)'),
      h('div', { style: 'overflow-x:auto' }, [(() => {
        const tbl = h('table', { class: 'tbl' });
        tbl.appendChild(h('thead', {}, [ h('tr', {}, PROJECT_PERFORMANCE_COLUMNS.map(c => h('th', {}, [c]))) ]));
        const tb = h('tbody');
        Store.state.projects.forEach(r => {
          const tr = h('tr', {}, [
            h('td', {}, [h('span', { class: 'chip' }, [r.과제명])]),
            h('td', {}, [r.지수]),
            h('td', { class: 'edit-td' }, [ txtEdit(() => r.전략, v => { r.전략 = v; Store.save(); }) ]),
            h('td', { class: 'edit-td' }, [ txtEdit(() => r.과제, v => { r.과제 = v; Store.save(); }) ]),
            h('td', { class: 'edit-td' }, [ txtEdit(() => r.계획, v => { r.계획 = v; Store.save(); }) ]),
            h('td', { class: 'edit-td' }, [ txtEdit(() => (r.실적 === '-' ? '' : r.실적), v => { r.실적 = v; Store.save(); }) ]),
            h('td', { class: 'num edit-td' }, [ numEdit(() => r.달성률, v => { r.달성률 = v; Store.save(); }, { placeholder: '%' }) ]),
            h('td', { class: 'edit-td' }, [ txtEdit(() => r.페이지, v => { r.페이지 = v; Store.save(); }) ])
          ]);
          tb.appendChild(tr);
        });
        tbl.appendChild(tb);
        return tbl;
      })()])
    ]));
  }
  function liEdit(label, get, set, area = false) {
    return h('li', {}, [
      h('span', { class: 'k' }, [label]),
      h('span', { class: 'v' }, [
        area
          ? txtAreaEdit(get, v => { set(v); Store.save(); })
          : txtEdit(get, v => { set(v); Store.save(); })
      ])
    ]);
  }

  // ---------- infrastructure ----------
  function buildInfra() {
    const el = $('#view-infra');
    el.innerHTML = '';
    el.appendChild(h('div', { class: 'view-anchor' }, ['기타 구축 · 거버넌스·인프라']));
    el.appendChild(h('section', { class: 'section' }, [
      sectionHead('기타 구축 실적 · 직접 입력', '거버넌스 구축 및 인프라 구축 현황'),
      h('div', { class: 'grid-2' }, Store.state.infra.groups.map(g => {
        const c = h('div', { class: 'infra-card' }, [
          h('h3', {}, [
            h('span', { class: 'chip dark' }, [g.name.startsWith('거버') ? 'G' : 'I']),
            g.name
          ])
        ]);
        g.items.forEach(it => {
          c.appendChild(h('div', { class: 'infra-item edit' }, [
            h('div', { class: 'lbl' }, [it.label]),
            numEdit(() => it.count, v => { it.count = v; Store.save(); })
          ]));
        });
        return c;
      }))
    ]));

    el.appendChild(h('section', { class: 'section' }, [
      sectionHead('구축 범위 정의', '엑셀 원본 시트의 주석'),
      h('div', { class: 'card' }, [
        h('ul', { class: 'callout-list' },
          INFRASTRUCTURE.note.map(n => h('li', {}, [
            h('span', { class: 'k' }, ['정의']),
            h('span', { class: 'v' }, [n.replace(/^\*/, '')])
          ]))
        )
      ])
    ]));
  }

  // ---------- community ----------
  let _communityTab = 'student';    // 'student' | 'corp'
  let _communityCat = 'all';        // category filter
  let _communityQ = '';             // search query
  let _showForm = false;            // inline post form open/close

  const STUDENT_CATS = ['공지', '프로그램', '멘토링', '수상', '후기'];
  const CORP_CATS = ['채용·인턴', '산학협력', '우수사례'];

  function buildCommunity() {
    const el = $('#view-community');
    if (!el) return;
    el.innerHTML = '';
    el.appendChild(h('div', { class: 'view-anchor' }, ['커뮤니티 · 학생·기업체']));
    const C = Store.state.community;

    // Hero tri-block (green · black · gray — ref HBM slide)
    el.appendChild(h('section', { class: 'tri-section' }, [
      h('div', { class: 'tri-headline' }, [
        h('span', { class: 'label' }, ['07 · COMMUNITY ECOSYSTEM']),
        h('span', {}, ['호원RISE 커뮤니티 생태계']),
        h('div', { class: 'values' }, [
          h('span', {}, [
            h('span', { class: 'v' }, [String(C.stats.totalStudents)]),
            ' 명 참여 '
          ]),
          h('span', { class: 'arrow' }, ['→']),
          h('span', {}, [
            h('span', { class: 'v' }, [String(C.stats.partnerCompanies)]),
            ' 기업 · '
          ]),
          h('span', { class: 'arrow' }, ['→']),
          h('span', {}, [
            h('span', { class: 'v' }, [String(C.stats.ongoingProjects)]),
            ' 산학 프로젝트 '
          ])
        ])
      ]),
      h('div', { class: 'tri-block' }, [
        triBlock('green', '01', '학생 커뮤니티', '재학생 · 졸업생 · 멘티',
          C.stats.totalStudents, '명', '2025 → 2026E',
          ['8대 과제 참여 트랙 공유', '멘토·멘티 매칭 허브', '우수사례·수상 기록', '프로그램 신청 창구'],
          () => { _communityTab = 'student'; buildCommunity(); }),
        triBlock('black', '02', '기업체 커뮤니티', '파트너 · MOU · 산학',
          C.stats.partnerCompanies, '개', '협력기관 풀',
          ['파트너 기업 디렉토리', '채용·인턴십 게시판', '산학협력 공동 제안', 'MOU 진행 상태 관리'],
          () => { _communityTab = 'corp'; buildCommunity(); }),
        triBlock('gray', '03', '지역·기관 네트워크', '전북 RISE 생태계',
          C.stats.activeMentors, '명', '현직 멘토 풀',
          ['초광역 지산학 연계', '지자체·유관기관 협업', '지역 현안 대응', '글로컬 인재 허브'],
          null)
      ])
    ]));

    // Activity ticker
    el.appendChild(activityTicker());

    // Tab bar + toolbar
    const stuCnt = C.students.length;
    const corpCnt = C.companies.length;
    const tabs = h('div', { class: 'section-head' }, [
      h('div', {}, [
        h('div', { class: 'section-title' }, ['커뮤니티 게시판']),
        h('div', { class: 'section-desc' }, ['학생/기업체 활동을 실시간으로 공유하고, 새로운 글을 작성할 수 있습니다.'])
      ]),
      h('div', { class: 'right' }, [
        h('div', { class: 'tab-bar' }, [
          tabBtn('student', '학생 커뮤니티', stuCnt),
          tabBtn('corp',    '기업체 커뮤니티', corpCnt)
        ])
      ])
    ]);
    el.appendChild(h('section', { class: 'section' }, [tabs]));

    // mini-stats for current tab
    const stats = _communityTab === 'student' ? [
      { icon: 'g', label: '참여 학생',     value: C.stats.totalStudents },
      { icon: 'e', label: '활동 게시글',   value: C.students.length },
      { icon: 'k', label: '현직 멘토',     value: C.stats.activeMentors },
      { icon: 'y', label: '수상·우수사례', value: C.students.filter(p => p.카테고리 === '수상').length }
    ] : [
      { icon: 'k', label: '파트너 기업',    value: C.companies.length },
      { icon: 'g', label: 'MOU 체결',       value: C.companies.filter(b => b.상태 === 'active').length },
      { icon: 'y', label: '진행중 협약',    value: C.companies.filter(b => b.상태 === 'pending').length },
      { icon: 'e', label: '공고·산학 글',   value: C.corpPosts.length }
    ];
    const miniRow = h('div', { class: 'mini-stats' },
      stats.map(s => h('div', { class: 'mini-stat' }, [
        h('div', { class: `icon ${s.icon}` }, [
          _communityTab === 'student' ? (s.icon === 'g' ? '학' : s.icon === 'e' ? '글' : s.icon === 'k' ? '멘' : '★')
                                      : (s.icon === 'k' ? '기' : s.icon === 'g' ? 'M' : s.icon === 'y' ? '협' : '글')
        ]),
        h('div', { class: 'meta' }, [
          h('div', { class: 'label' }, [s.label]),
          h('div', { class: 'value' }, [fmtN(s.value)])
        ])
      ]))
    );
    el.appendChild(miniRow);

    // toolbar (search + category chips + write)
    const cats = _communityTab === 'student' ? STUDENT_CATS
              : (_communityTab === 'corp' ? CORP_CATS : []);

    const toolbar = h('div', { class: 'community-toolbar' }, [
      h('div', { class: 'search-input' }, [
        h('input', {
          type: 'text',
          placeholder: _communityTab === 'corp' ? '기업명·분야·사업단 검색' : '제목·내용·작성자 검색',
          value: _communityQ,
          oninput: (e) => { _communityQ = e.target.value; renderCommunityList(); }
        })
      ]),
      h('div', { class: 'category-chips' }, [
        chipBtn('all', '전체'),
        ...cats.map(c => chipBtn(c, c))
      ]),
      h('button', {
        class: 'btn-write',
        onclick: () => { _showForm = !_showForm; renderCommunityList(); }
      }, [_communityTab === 'corp' ? '새 협력/공고' : '새 글 작성'])
    ]);
    el.appendChild(toolbar);

    // list wrapper
    const listWrap = h('div', { id: 'community-list' });
    el.appendChild(listWrap);
    renderCommunityList();

    // Hall of fame / 우수 파트너
    el.appendChild(h('section', { class: 'section' }, [
      sectionHead('TOP 3 · 이달의 우수 파트너', '협력 활동 · 참여 규모 · 성과 기여도 종합 순위'),
      h('div', { class: 'hall-grid' }, [
        hallCard('green', '01', '최다 참여', C.companies[0]?.기업명 || 'JB바이오헬스㈜', '헬스케어 리빙랩 · 현장실습 20명'),
        hallCard('black', '02', '성과 확산', C.companies[3]?.기업명 || '전북관광재단',     '지역축제 청년 기획 · 60명 파견'),
        hallCard('gray',  '03', 'MOU 신규', C.companies[2]?.기업명 || '전북드론산업협회',  '국가자격 실기장 공유 · 18개사')
      ])
    ]));
  }

  function tabBtn(id, label, cnt) {
    const btn = h('button', { onclick: () => { _communityTab = id; _communityCat = 'all'; _communityQ = ''; _showForm = false; buildCommunity(); } }, [
      label,
      h('span', { class: 'cnt' }, [String(cnt)])
    ]);
    if (_communityTab === id) btn.classList.add('active');
    return btn;
  }

  function chipBtn(key, label) {
    const btn = h('button', { onclick: () => { _communityCat = key; renderCommunityList(); } }, [label]);
    if (_communityCat === key) btn.classList.add('active');
    return btn;
  }

  function triBlock(variant, corner, title, role, bigVal, unit, era, lis, onCta) {
    return h('div', { class: `blk ${variant}` }, [
      h('div', { class: 'corner' }, [corner]),
      h('div', { class: 'kicker' }, [title.toUpperCase()]),
      h('h4', {}, [title]),
      h('div', { class: 'role' }, [role]),
      h('div', { class: 'big' }, [String(bigVal), ' ', h('span', { class: 'next' }, [unit])]),
      h('div', { class: 'era' }, [era]),
      h('ul', {}, lis.map(x => h('li', {}, [x]))),
      onCta ? h('div', { class: 'cta', onclick: onCta }, ['바로가기 →']) : null
    ]);
  }

  function hallCard(variant, rank, tag, name, sub) {
    return h('div', { class: `hall-card ${variant}` }, [
      h('div', { class: 'tag' }, [tag]),
      h('div', { class: 'rank' }, [rank]),
      h('div', {}, [
        h('div', { class: 'name' }, [name]),
        h('div', { class: 'sub' }, [sub])
      ])
    ]);
  }

  function activityTicker() {
    const C = Store.state.community;
    const items = [
      ...C.students.slice(0, 5).map(p => ({ cat: p.카테고리, text: p.제목, project: p.사업단 })),
      ...C.corpPosts.slice(0, 3).map(p => ({ cat: p.카테고리, text: p.제목, project: '기업' }))
    ];
    // duplicate for seamless loop
    const doubled = [...items, ...items];
    return h('div', { class: 'ticker' }, [
      h('div', { class: 'live' }, [
        h('span', { class: 'dot' }),
        'LIVE FEED'
      ]),
      h('div', { class: 'track' }, [
        h('div', { class: 'rail' }, doubled.map(it => h('div', { class: 'item' }, [
          h('span', { class: 'cat' }, [it.cat]),
          h('b', {}, [it.project]),
          document.createTextNode(' · '),
          document.createTextNode(it.text)
        ])))
      ])
    ]);
  }

  function renderCommunityList() {
    const host = document.getElementById('community-list');
    if (!host) return;
    host.innerHTML = '';
    const C = Store.state.community;

    if (_showForm) host.appendChild(postForm());

    if (_communityTab === 'student') {
      const filtered = C.students.filter(p => filterMatch(p, ['제목','내용','작성자','사업단'], STUDENT_CATS));
      if (!filtered.length) {
        host.appendChild(h('div', { class: 'empty' }, ['해당 조건에 맞는 게시글이 없습니다.']));
        return;
      }
      const grid = h('div', { class: 'community-grid' });
      filtered.forEach(p => grid.appendChild(studentPostCard(p)));
      host.appendChild(grid);
    } else {
      // corp tab: companies grid + corp posts
      const filteredBiz = C.companies.filter(b => filterMatchBiz(b));
      const bizGrid = h('div', { class: 'community-grid' });
      filteredBiz.forEach(b => bizGrid.appendChild(bizCard(b)));
      host.appendChild(h('div', { class: 'section-head', style: 'margin:6px 0 10px' }, [
        h('div', {}, [h('div', { class: 'section-title' }, ['파트너 기업 디렉토리'])])
      ]));
      host.appendChild(filteredBiz.length ? bizGrid : h('div', { class: 'empty' }, ['검색 결과가 없습니다.']));

      const filteredPosts = C.corpPosts.filter(p => filterMatch(p, ['제목','내용','작성자'], CORP_CATS));
      if (filteredPosts.length) {
        host.appendChild(h('div', { class: 'section-head', style: 'margin:28px 0 10px' }, [
          h('div', {}, [h('div', { class: 'section-title' }, ['협력·공고 게시판'])])
        ]));
        const pg = h('div', { class: 'community-grid' });
        filteredPosts.forEach(p => pg.appendChild(corpPostCard(p)));
        host.appendChild(pg);
      }
    }
  }

  function filterMatch(p, fields, validCats) {
    if (_communityCat !== 'all' && validCats.includes(_communityCat) && p.카테고리 !== _communityCat) return false;
    if (_communityQ.trim()) {
      const q = _communityQ.toLowerCase();
      return fields.some(f => String(p[f] || '').toLowerCase().includes(q));
    }
    return true;
  }
  function filterMatchBiz(b) {
    if (_communityCat !== 'all' && CORP_CATS.includes(_communityCat)) return false; // categories apply to posts only
    if (_communityQ.trim()) {
      const q = _communityQ.toLowerCase();
      return ['기업명','업종','소재지','사업단','담당자','설명'].some(f => String(b[f] || '').toLowerCase().includes(q));
    }
    return true;
  }

  function studentPostCard(p) {
    return h('article', { class: 'post-card' }, [
      h('div', { class: 'top' }, [
        h('div', { class: 'title-wrap' }, [
          h('h4', { class: 'title' }, [p.제목]),
          h('div', { class: 'meta-row' }, [
            h('span', { class: `cat-badge ${p.카테고리}` }, [p.카테고리]),
            h('span', { class: 'chip ghost' }, [p.사업단]),
            h('span', { class: 'dot-sep' }, ['·']),
            document.createTextNode(p.작성자),
            h('span', { class: 'dot-sep' }, ['·']),
            document.createTextNode(p.날짜)
          ])
        ]),
        h('button', { class: 'del-btn', onclick: () => deletePost('students', p.id) }, ['삭제'])
      ]),
      h('div', { class: 'body' }, [p.내용])
    ]);
  }

  function corpPostCard(p) {
    return h('article', { class: 'post-card' }, [
      h('div', { class: 'top' }, [
        h('div', { class: 'title-wrap' }, [
          h('h4', { class: 'title' }, [p.제목]),
          h('div', { class: 'meta-row' }, [
            h('span', { class: `cat-badge ${p.카테고리}` }, [p.카테고리]),
            h('span', { class: 'dot-sep' }, ['·']),
            document.createTextNode(p.작성자),
            h('span', { class: 'dot-sep' }, ['·']),
            document.createTextNode(p.날짜)
          ])
        ]),
        h('button', { class: 'del-btn', onclick: () => deletePost('corpPosts', p.id) }, ['삭제'])
      ]),
      h('div', { class: 'body' }, [p.내용])
    ]);
  }

  function bizCard(b) {
    const initials = (b.기업명 || '?').replace(/[㈜(주)]/g, '').trim().slice(0, 2);
    const variant = b.상태 === 'active' ? '' : (b.사업단 === 'JB집' ? 'black' : 'gray');
    return h('article', { class: 'biz-card' }, [
      h('div', { class: 'top' }, [
        h('div', { class: `avatar ${variant}` }, [initials]),
        h('div', { style: 'flex:1; min-width:0;' }, [
          h('h4', { class: 'bname' }, [b.기업명]),
          h('div', { class: 'bmeta' }, [
            h('span', {}, [b.업종]),
            h('span', { class: 'dot-sep' }, ['·']),
            h('span', {}, [b.소재지]),
            h('span', { class: 'dot-sep' }, ['·']),
            h('span', { class: 'chip ghost' }, [b.사업단])
          ])
        ]),
        h('button', { class: 'del-btn', onclick: () => deletePost('companies', b.id) }, ['삭제'])
      ]),
      h('div', { class: 'bdesc' }, [b.설명]),
      h('div', { class: 'bfoot' }, [
        h('div', {}, [
          '담당: ', h('b', { style: 'color:var(--ink-700); font-weight:600;' }, [b.담당자]),
          '   ·   체결: ', b.체결일
        ]),
        h('span', { class: `status ${b.상태}` }, [b.상태 === 'active' ? 'MOU 체결' : '진행중'])
      ])
    ]);
  }

  function deletePost(kind, id) {
    if (!confirm('이 항목을 삭제할까요?')) return;
    const C = Store.state.community;
    C[kind] = C[kind].filter(x => x.id !== id);
    Store.save();
    buildCommunity();
  }

  function postForm() {
    const today = new Date().toISOString().slice(0, 10);
    const isCorp = _communityTab === 'corp';
    const isBiz  = false; // always post type (for now); biz add done via different shortcut
    let cats = isCorp ? CORP_CATS : STUDENT_CATS;

    // form state
    const state = {
      제목: '', 카테고리: cats[0], 사업단: PROJECTS[0].key,
      작성자: '', 내용: '', mode: 'post' // or 'biz'
    };
    const bizState = {
      기업명: '', 업종: '', 소재지: '', 사업단: PROJECTS[0].key,
      담당자: '', 상태: 'pending', 체결일: today, 설명: ''
    };

    const form = h('div', { class: 'post-form' });

    const rerender = () => {
      form.innerHTML = '';
      form.appendChild(header());
      if (state.mode === 'post') form.appendChild(postBody());
      else                         form.appendChild(bizBody());
      form.appendChild(actions());
    };
    const header = () => h('div', { class: 'form-row full' }, [
      h('label', {}, [
        h('span', { class: 'lbl' }, ['작성 유형']),
        (() => {
          const sel = h('select', { onchange: (e) => { state.mode = e.target.value; rerender(); } });
          sel.appendChild(h('option', { value: 'post' }, [isCorp ? '협력·공고 글' : '게시글']));
          if (isCorp) sel.appendChild(h('option', { value: 'biz' }, ['파트너 기업 등록']));
          sel.value = state.mode;
          return sel;
        })()
      ])
    ]);

    const postBody = () => {
      const fr1 = h('div', { class: 'form-row' }, [
        h('label', {}, [h('span', {}, ['카테고리']), (() => {
          const sel = h('select', { onchange: (e) => { state.카테고리 = e.target.value; } });
          cats.forEach(c => sel.appendChild(h('option', { value: c }, [c])));
          sel.value = state.카테고리;
          return sel;
        })()]),
        !isCorp ? h('label', {}, [h('span', {}, ['사업단']), (() => {
          const sel = h('select', { onchange: (e) => { state.사업단 = e.target.value; } });
          ['공통', ...PROJECTS.map(p => p.key)].forEach(k => sel.appendChild(h('option', { value: k }, [k])));
          sel.value = state.사업단;
          return sel;
        })()]) : h('label', {}, []),
        h('label', {}, [h('span', {}, ['작성자']), h('input', { type: 'text', placeholder: '작성자 이름',
          oninput: (e) => { state.작성자 = e.target.value; } })]),
        h('label', {}, [h('span', {}, ['날짜']), h('input', { type: 'text', value: today, disabled: 'true' })])
      ]);
      const fr2 = h('div', { class: 'form-row full' }, [
        h('label', {}, [h('span', {}, ['제목']), h('input', { type: 'text', placeholder: '제목 입력',
          oninput: (e) => { state.제목 = e.target.value; } })])
      ]);
      const fr3 = h('div', { class: 'form-row full' }, [
        h('label', {}, [h('span', {}, ['내용']), h('textarea', { placeholder: '내용을 입력하세요',
          oninput: (e) => { state.내용 = e.target.value; } })])
      ]);
      const wrap = h('div', {});
      wrap.appendChild(fr1); wrap.appendChild(fr2); wrap.appendChild(fr3);
      return wrap;
    };

    const bizBody = () => h('div', {}, [
      h('div', { class: 'form-row' }, [
        h('label', {}, [h('span', {}, ['기업명']), h('input', { type: 'text', oninput: e => bizState.기업명 = e.target.value })]),
        h('label', {}, [h('span', {}, ['업종']), h('input', { type: 'text', oninput: e => bizState.업종 = e.target.value })]),
        h('label', {}, [h('span', {}, ['소재지']), h('input', { type: 'text', oninput: e => bizState.소재지 = e.target.value })]),
        h('label', {}, [h('span', {}, ['사업단']), (() => {
          const sel = h('select', { onchange: e => bizState.사업단 = e.target.value });
          PROJECTS.forEach(p => sel.appendChild(h('option', { value: p.key }, [p.key])));
          return sel;
        })()])
      ]),
      h('div', { class: 'form-row' }, [
        h('label', {}, [h('span', {}, ['담당자']), h('input', { type: 'text', oninput: e => bizState.담당자 = e.target.value })]),
        h('label', {}, [h('span', {}, ['상태']), (() => {
          const sel = h('select', { onchange: e => bizState.상태 = e.target.value });
          sel.appendChild(h('option', { value: 'pending' }, ['진행중']));
          sel.appendChild(h('option', { value: 'active' }, ['MOU 체결']));
          return sel;
        })()]),
        h('label', {}, [h('span', {}, ['체결일']), h('input', { type: 'date', value: today, oninput: e => bizState.체결일 = e.target.value })])
      ]),
      h('div', { class: 'form-row full' }, [
        h('label', {}, [h('span', {}, ['설명']), h('textarea', { placeholder: '협력 내용·범위', oninput: e => bizState.설명 = e.target.value })])
      ])
    ]);

    const actions = () => h('div', { class: 'form-actions' }, [
      h('button', { class: 'tb-btn', onclick: () => { _showForm = false; renderCommunityList(); } }, ['취소']),
      h('button', { class: 'tb-btn primary', onclick: () => submit() }, ['등록'])
    ]);

    const submit = () => {
      const C = Store.state.community;
      if (state.mode === 'biz' && isCorp) {
        if (!bizState.기업명.trim()) { alert('기업명을 입력하세요.'); return; }
        C.companies.unshift({ id: Date.now(), ...bizState });
      } else {
        if (!state.제목.trim()) { alert('제목을 입력하세요.'); return; }
        const item = {
          id: Date.now(),
          제목: state.제목.trim(),
          카테고리: state.카테고리,
          작성자: state.작성자.trim() || '익명',
          날짜: today,
          내용: state.내용.trim()
        };
        if (!isCorp) item.사업단 = state.사업단;
        if (isCorp) C.corpPosts.unshift(item);
        else        C.students.unshift(item);
      }
      Store.save();
      _showForm = false;
      buildCommunity();
    };

    rerender();
    return form;
  }

  // ---------- formula ----------
  function buildFormula() {
    const el = $('#view-formula');
    el.innerHTML = '';
    el.appendChild(h('div', { class: 'view-anchor' }, ['산식 · 정의']));
    if (!isUnlocked('formula')) {
      el.appendChild(h('div', { class: 'lock-card' }, [
        h('div', { class: 'lock-icon' }),
        h('h3', {}, ['접근 제한 영역']),
        h('p', {}, ['산식·정의는 인증된 관리자만 열람할 수 있습니다.']),
        h('button', {
          class: 'tb-btn primary',
          onclick: async () => {
            const ok = await promptPassword();
            if (ok) { buildFormula(); buildSidebar(); }
          }
        }, ['잠금 해제'])
      ]));
      return;
    }
    el.appendChild(h('section', { class: 'section' }, [
      sectionHead('공통지표 산식', '성과평가의 핵심 3요소 — 대학지표 달성률 · 통합만족도 · 성과확산도'),
      h('div', { class: 'card' }, [
        h('div', { class: 'formula' }, [
          h('code', {}, ['A1 × 0.4']), document.createTextNode('+'),
          h('code', {}, ['A2 × 0.4']), document.createTextNode('+'),
          h('code', {}, ['A3 × 0.2'])
        ]),
        h('div', { style: 'height:10px' }),
        h('ul', { class: 'callout-list' },
          META.formulaDesc.map(f => h('li', {}, [
            h('span', { class: 'k' }, [`${f.code} · ${f.name}`]),
            h('span', { class: 'v' }, [f.desc])
          ]))
        )
      ])
    ]));

    el.appendChild(h('section', { class: 'section' }, [
      sectionHead('성과확산도(A3) 구성', '사업의 인지도와 파급효과를 높이는 5대 활동'),
      h('div', { class: 'card' }, [
        h('ul', { class: 'callout-list' },
          META.diffusionItems.map(x => h('li', {}, [
            h('span', { class: 'k' }, [x.name]),
            h('span', { class: 'v' }, [x.desc])
          ]))
        )
      ])
    ]));

    el.appendChild(h('section', { class: 'section' }, [
      sectionHead('5대 자체지수 정의', '대학자체지표 영역 구분'),
      h('div', { class: 'card' }, [
        h('ul', { class: 'callout-list' },
          SELF_INDICES.map((s, i) => h('li', {}, [
            h('span', { class: 'k' }, [`${i + 1}. ${s.name}`]),
            h('span', { class: 'v' }, [s.desc])
          ]))
        )
      ])
    ]));

    el.appendChild(h('section', { class: 'section' }, [
      sectionHead('8개 과제 · 사업단 구성', ''),
      h('div', {}, [(() => {
        const tbl = h('table', { class: 'tbl' });
        tbl.appendChild(h('thead', {}, [h('tr', {}, [
          h('th', {}, ['약칭']), h('th', {}, ['과제 전체명']), h('th', {}, ['테마'])
        ])]));
        const tb = h('tbody');
        PROJECTS.forEach(p => {
          tb.appendChild(h('tr', {}, [
            h('td', {}, [h('span', { class: 'chip' }, [p.short])]),
            h('td', {}, [p.full]),
            h('td', {}, [p.theme])
          ]));
        });
        tbl.appendChild(tb);
        return tbl;
      })()])
    ]));
  }

  // ---------- toolbar actions ----------
  function onExport() { Store.exportJson(); }
  function onImport() {
    const input = h('input', { type: 'file', accept: 'application/json' });
    input.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const rd = new FileReader();
      rd.onload = () => {
        try {
          const obj = JSON.parse(rd.result);
          Store.importJson(obj);
          queueRerender(true);
        } catch (err) { alert('JSON 파일 형식이 올바르지 않습니다.'); }
      };
      rd.readAsText(file);
    });
    input.click();
  }
  function onReset() {
    if (!confirm('모든 입력값을 초기화하시겠어요? 이 동작은 되돌릴 수 없습니다.')) return;
    Store.reset();
    queueRerender(true);
  }

  // ---------- re-render orchestrator ----------
  let _pending = null;
  function queueRerender(full = false) {
    if (_pending) cancelAnimationFrame(_pending);
    _pending = requestAnimationFrame(() => {
      _pending = null;
      if (full) {
        buildSidebar();
        buildOverview(); buildCommon(); buildSelf(); buildProject(); buildInfra(); buildFormula();
        if (_currentView === 'community') buildCommunity();
        setView(_currentView);
      } else {
        // rebuild data-dependent views only for current view
        if (_currentView === 'overview') { buildOverview(); renderOverviewCharts(); }
        if (_currentView === 'common')   { /* keep inputs focused — just redraw chart */ renderCommonChart(); }
        if (_currentView === 'self')     { /* redraw rates on current view without stealing focus */ refreshRates(); }
        if (_currentView === 'project')  { /* live-calc display not required */ }
        buildSidebar();
      }
    });
  }
  function refreshRates() {
    // Update 달성률 displays for self-items without rebuilding inputs
    $$('#view-self .sub-item.edit').forEach((node, i) => {
      // naive: find matching item in store by name text
    });
    // Simpler: refresh full self view (inputs are not currently focused — just refreshing b tags)
    $$('#view-self .sub-item.edit').forEach((node) => {
      const name = node.querySelector('.name').textContent;
      let match;
      for (const g of Store.state.self) {
        match = g.items.find(it => it.name === name);
        if (match) break;
      }
      if (!match) return;
      const b = node.querySelector('.rate b');
      if (b) b.textContent = (match.목표 && match.실적 != null) ? `${Math.round((match.실적 / match.목표) * 100)}%` : '—';
    });
  }

  // ---------- init ----------
  function init() {
    Store.init();
    buildSidebar();
    buildMobileQuickNav();
    buildOverview(); buildCommon(); buildSelf(); buildProject(); buildInfra(); buildCommunity(); buildFormula();

    // All charts render immediately (single-page scroll layout)
    requestAnimationFrame(() => {
      renderOverviewCharts();
      renderCommonChart();
      renderSelfChart();
    });

    $('#today').textContent = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });

    $('#btn-export').addEventListener('click', onExport);
    $('#btn-import').addEventListener('click', onImport);
    $('#btn-reset') .addEventListener('click', onReset);

    // Mobile nav drawer
    const toggle = $('#nav-toggle');
    const backdrop = $('#nav-backdrop');
    const openNav  = () => document.body.classList.add('nav-open');
    const closeNav = () => document.body.classList.remove('nav-open');
    toggle?.addEventListener('click', () => {
      document.body.classList.contains('nav-open') ? closeNav() : openNav();
    });
    backdrop?.addEventListener('click', closeNav);
    $$('.nav button').forEach(b => b.addEventListener('click', () => {
      if (window.matchMedia('(max-width: 880px)').matches) closeNav();
    }));
    window.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeNav(); });

    // Scroll-spy: highlight active nav button based on viewport
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(en => {
        if (en.isIntersecting) {
          const id = en.target.id.replace('view-', '');
          _currentView = id;
          $$('.nav button').forEach(b => b.classList.toggle('active', b.dataset.view === id));
          $$('#mobile-quicknav .q').forEach(b => b.classList.toggle('active', b.dataset.view === id));
          const v = VIEWS.find(x => x.id === id);
          if (v) $('#crumb').innerHTML = `호원RISE · <strong>${v.label}</strong> · ${v.desc}`;
          // auto-scroll the active chip into view on mobile quicknav
          const activeChip = $(`#mobile-quicknav .q[data-view="${id}"]`);
          if (activeChip && window.matchMedia('(max-width: 880px)').matches) {
            activeChip.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
          }
        }
      });
    }, { rootMargin: '-40% 0px -55% 0px', threshold: 0 });
    $$('.view').forEach(v => observer.observe(v));

    pingSaveIndicator();
  }
  document.addEventListener('DOMContentLoaded', init);
})();
