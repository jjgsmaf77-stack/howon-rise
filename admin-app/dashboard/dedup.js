// 유사중복 관리 페이지 — 데이터 원천: 옵시디언 유사중복 점검 대장·연계 대장·재정지원사업 등록부 (data2.js)
(() => {
  const safeGet = k => { try { return sessionStorage.getItem(k); } catch (e) { return null; } };

  const $ = (sel, el = document) => el.querySelector(sel);
  const h = (tag, attrs = {}, children = []) => {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class') el.className = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
      else el.setAttribute(k, v);
    }
    for (const c of [].concat(children)) {
      if (c == null) continue;
      el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    }
    return el;
  };

  const flagify = t => /🔴/.test(t || '')
    ? h('span', { class: 'dd-flag' }, [t])
    : (t || '—');

  const tbl = (heads, rows, flagCols = []) => h('div', { class: 'y2-tblwrap' }, [h('table', { class: 'tbl' }, [
    h('thead', {}, [h('tr', {}, heads.map(x => h('th', {}, [x])))]),
    h('tbody', {}, rows.map(r => h('tr', {}, r.map((c, i) =>
      h('td', {}, [flagCols.includes(i) ? flagify(c) : (c || '—')])))))
  ])]);

  const sec = (title, sub, nodes) => h('section', { class: 'dd-sec' }, [
    h('h2', {}, [title]),
    sub ? h('div', { class: 'sec-sub' }, [sub]) : null,
    ...nodes
  ]);

  function render() {
    const root = $('#dedup-root');
    const D = (window.__RISE2__ && window.__RISE2__.dedup) || null;
    if (!root) return;
    if (!D) {
      root.appendChild(h('div', { class: 'card' }, ['데이터를 불러올 수 없습니다. 대시보드에서 다시 접속해 주세요.']));
      return;
    }
    const P = D.projects || [];

    // 1. 현황 요약
    root.appendChild(sec('점검 현황 요약', `점검 대장 기준 · 최근 갱신 ${D.updatedAt || '—'}`, [
      h('div', { class: 'dd-kpis' }, [
        h('div', { class: 'dd-kpi ' + (D.suspects.length ? 'warn' : 'ok') }, [
          h('div', { class: 'k-label' }, ['유사중복 의심']),
          h('div', { class: 'k-value' }, [String(D.suspects.length) + '건']),
          h('div', { class: 'k-foot' }, [D.suspects.length ? '진행 보류 · 검토 중' : '현재 의심 사례 없음'])
        ]),
        h('div', { class: 'dd-kpi' }, [
          h('div', { class: 'k-label' }, ['점검 완료(이상 없음)']),
          h('div', { class: 'k-value' }, [String(D.cleared.length) + '건']),
          h('div', { class: 'k-foot' }, ['판정 근거 기록 보존'])
        ]),
        h('div', { class: 'dd-kpi' }, [
          h('div', { class: 'k-label' }, ['연계 프로그램(장려)']),
          h('div', { class: 'k-value' }, [String(D.linked.length) + '건']),
          h('div', { class: 'k-foot' }, ['실적 양측 반영 · 예산 단일 집행'])
        ]),
        h('div', { class: 'dd-kpi' }, [
          h('div', { class: 'k-label' }, ['관리 대상 재정지원사업']),
          h('div', { class: 'k-value' }, [String(P.length) + '개']),
          h('div', { class: 'k-foot' }, ['대학 전체 등록부 기준'])
        ]),
      ])
    ]));

    // 2. 점검 체계 (프로세스)
    root.appendChild(sec('상시 점검 체계', '신규 결과보고서·지출 문서가 접수될 때마다 아래 4개 영역을 전수 대조한 뒤 판정을 기록합니다.', [
      h('div', { class: 'dd-flow' }, [
        h('div', { class: 'dd-flow-node dark' }, [
          h('div', { class: 'f-t' }, ['신규 문서 접수']),
          h('div', { class: 'f-s' }, ['결과보고서 · 지급요청 공문'])
        ]),
        h('div', {}, [
          h('div', { class: 'dd-axes' }, [
            h('div', { class: 'dd-axis' }, [h('div', { class: 'a-n' }, ['영역 ①']), h('div', { class: 'a-t' }, ['기존 프로그램 대조']),
              h('div', { class: 'a-s' }, ['동일 기관·기간·내용의 재제출 여부'])]),
            h('div', { class: 'dd-axis' }, [h('div', { class: 'a-n' }, ['영역 ②']), h('div', { class: 'a-t' }, ['지출 기록 대조']),
              h('div', { class: 'a-s' }, ['동일 금액·내부결재번호의 이중 청구 여부'])]),
            h('div', { class: 'dd-axis' }, [h('div', { class: 'a-n' }, ['영역 ③']), h('div', { class: 'a-t' }, ['타 사업단 대조']),
              h('div', { class: 'a-s' }, ['9개 사업단 간 실질 동일 프로그램 여부'])]),
            h('div', { class: 'dd-axis' }, [h('div', { class: 'a-n' }, ['영역 ④']), h('div', { class: 'a-t' }, ['타 재정지원사업 대조']),
              h('div', { class: 'a-s' }, ['아래 등록부 전 사업과의 내용·예산 중복 여부'])]),
          ])
        ]),
        h('div', { class: 'dd-flow-node dark' }, [
          h('div', { class: 'f-t' }, ['판정 기록']),
          h('div', { class: 'f-s' }, ['점검 대장 보존', h('br'), '(평가 대응 증빙)'])
        ]),
      ]),
      h('div', { class: 'dd-verdicts' }, [
        h('div', { class: 'dd-verdict v-warn' }, [h('b', {}, ['⚠️ 유사중복 의심']), '진행 보류 → 즉시 보고 → 검토 후 조치']),
        h('div', { class: 'dd-verdict v-link' }, [h('b', {}, ['✅ 연계 프로그램']), '연계 대장 기록 · 실적 양측 반영 · 예산 단일 집행']),
        h('div', { class: 'dd-verdict' }, [h('b', {}, ['◽ 순회·공용자료']), '중복 아님 — 판정 근거를 남기고 정상 진행']),
        h('div', { class: 'dd-verdict' }, [h('b', {}, ['— 무관']), '4개 영역 이상 없음 확인 후 정상 진행']),
      ])
    ]));

    // 3. 의심 사례
    root.appendChild(sec('⚠️ 유사중복 의심 사례', '발견 즉시 진행을 보류하고 기록합니다. 판정 이력은 삭제하지 않습니다.', [
      D.suspects.length
        ? tbl(['발견일', '점검 기준', '내용', '판정', '조치'], D.suspects.map(x => [x.date, x.basis, x.content, x.verdict, x.action]))
        : h('div', { class: 'dd-empty-good' }, ['✅ 현재 유사중복 의심 사례가 없습니다 — 전 프로그램 4개 영역 점검 통과'])
    ]));

    // 4. 점검 완료
    root.appendChild(sec('점검 완료 — 유사중복 아님으로 판정', '유사해 보일 수 있으나 정상으로 확인된 사례와 그 근거입니다 (평가·감사 대응 자료).', [
      D.cleared.length
        ? tbl(['점검일', '내용', '판정 근거'], D.cleared.map(x => [x.date, x.content, x.reason]))
        : h('div', { class: 'sec-sub' }, ['기록 없음'])
    ]));

    // 5. 연계 프로그램
    root.appendChild(sec('연계 프로그램 — 장려 실적', '실적은 양측 사업단에 반영하되 전체 합계에서는 1건으로 처리하고, 예산은 집행 사업단에서만 사용합니다.', [
      D.linked.length
        ? tbl(['일자', '프로그램', '연계 사업단', '실적 계상', '예산 집행'],
            D.linked.map(x => [x.date, x.name, x.divisions, x.record, x.budget]))
        : h('div', { class: 'sec-sub' }, ['기록 없음'])
    ]));

    // 6. 대학 재정지원사업 등록부
    root.appendChild(sec('대학 재정지원사업 등록부', '대학 전체가 수행 중인 재정지원사업 목록 — 신규 프로그램은 이 목록의 전 사업과 중복 여부를 대조합니다. (🔴 = 담당 확인 필요)', [
      P.length
        ? tbl(['사업명', '주관', '대학 담당', '상태', '유사중복 유의점'],
            P.map(x => [x.name, x.sponsor, x.dept, x.status, x.note]), [1, 2, 3])
        : h('div', { class: 'sec-sub' }, ['등록된 사업 없음 — 옵시디언 등록부에 사업을 추가하세요']),
      h('div', { class: 'dd-foot-note' }, [
        '핵심 원칙: 한 프로그램에는 한 사업의 예산만 사용 · 서로 다른 사업의 예산 혼합 금지 · 사업 간 연계는 단계 분리와 사전 승인 문서 필수. ',
        '세부 기준은 상단의 ', h('a', { href: 'guide-linkage.pdf?v=1', target: '_blank', rel: 'noopener' }, ['운영 기준 문서']), '를 참고하세요.'
      ])
    ]));
  }

  document.addEventListener('DOMContentLoaded', render);
})();
