(() => {
  const { META, PROJECTS, COMMON_INDICATORS, SELF_INDICES,
          PROJECT_PERFORMANCE_COLUMNS, PROJECT_PERFORMANCE_ROWS,
          INFRASTRUCTURE } = window.__RISE__;

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
        infra: { groups: INFRASTRUCTURE.groups.map(g => ({ name: g.name, items: g.items.map(it => ({ ...it })) })) }
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
    { id: 'formula',    label: '산식·정의',         desc: '지표 방법론' }
  ];

  let _currentView = 'overview';
  function setView(id) {
    _currentView = id;
    $$('.view').forEach(v => v.classList.toggle('active', v.id === `view-${id}`));
    $$('.nav button').forEach(b => b.classList.toggle('active', b.dataset.view === id));
    const v = VIEWS.find(x => x.id === id);
    $('#crumb').innerHTML = `호원RISE · <strong>${v.label}</strong> · ${v.desc}`;
    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (id === 'overview') renderOverviewCharts();
    if (id === 'common') renderCommonChart();
    if (id === 'self') renderSelfChart();
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
      formula: ''
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

  // ---------- overview ----------
  function buildOverview() {
    const el = $('#view-overview');
    el.innerHTML = '';
    const KPI = getKpi();

    const hero = h('section', { class: 'hero' }, [
      h('div', { class: 'kicker' }, ['Ho Won University · RISE Program']),
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
          h('i', { style: `width:${(pa+pb).toFixed(1)}%; background:linear-gradient(90deg,#1f5d41 0 ${pa/(pa+pb||1)*100}%, #9cc4ab ${pa/(pa+pb||1)*100}% 100%);` })
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
    // Coherent emerald family (no random hues)
    const palette = [
      'rgba(15,58,40,0.15)',   'rgba(22,74,51,0.15)',  'rgba(31,93,65,0.15)',  'rgba(47,117,83,0.15)',
      'rgba(70,143,106,0.18)', 'rgba(107,168,136,0.20)','rgba(156,196,171,0.22)','rgba(199,223,207,0.28)'
    ];
    const borders = ['#0f3a28','#164a33','#1f5d41','#2f7553','#468f6a','#6ba888','#9cc4ab','#047857'];
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

    el.appendChild(h('section', { class: 'section' }, [
      sectionHead('공통지표 현황', '교육부 공통지표 및 지자체 자율지표를 제외한 대학자체 공통 지표. 값을 직접 입력할 수 있습니다.',
        [filterBar()]),
      h('div', { class: 'card' }, [ h('div', { class: 'chart-wrap tall' }, [h('canvas', { id: 'common-chart' })]) ])
    ]));

    el.appendChild(h('section', { class: 'section' }, [
      sectionHead('과제 × 지표 매트릭스 · 직접 입력', '셀을 클릭해 값을 입력하면 자동 저장되고 차트·KPI가 갱신됩니다.'),
      h('div', { class: 'card' }, [matrixEditGrid()])
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
      g.addColorStop(0, 'rgba(31,93,65,0.95)'); g.addColorStop(1, 'rgba(156,196,171,0.55)');
      return g;
    };
    if (_commonProject === 'all') {
      labels = PROJECTS.map(p => p.short);
      datasets = countInds.map((ind, idx) => ({
        label: ind.name,
        data: PROJECTS.map(p => ind.data[p.key] || 0),
        backgroundColor: ['#0f3a28','#1f5d41','#2f7553','#468f6a','#6ba888'][idx],
        borderRadius: 6, barThickness: 16
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
          g.addColorStop(0,'#164a33'); g.addColorStop(0.55,'#2f7553'); g.addColorStop(1,'#6ba888');
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

  // ---------- formula ----------
  function buildFormula() {
    const el = $('#view-formula');
    el.innerHTML = '';
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
    buildOverview(); buildCommon(); buildSelf(); buildProject(); buildInfra(); buildFormula();

    $('#today').textContent = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });

    $('#btn-export').addEventListener('click', onExport);
    $('#btn-import').addEventListener('click', onImport);
    $('#btn-reset') .addEventListener('click', onReset);

    setView('overview');
    pingSaveIndicator();
  }
  document.addEventListener('DOMContentLoaded', init);
})();
