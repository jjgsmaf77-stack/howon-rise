// 호원대학교 RISE사업 성과관리 플랫폼 데이터
// Source: 성과양식(홍교수님).xlsx

const META = {
  title: "호원RISE사업 성과관리 플랫폼",
  goal: "전북 K-컬쳐·웰니스·평생교육 분야를 선도하는 글로컬 창의인재 양성",
  vision: "전북 RISE체계와 동행하는 호원성취 POWER UP+ 혁신 플랫폼 구축",
  formula: "(A1×0.4) + (A2×0.4) + (A3×0.2)",
  formulaDesc: [
    { code: "A1", name: "대학지표 달성률", desc: "교육부 공통지표, 지자체 자율지표를 제외한 각 과제의 대학자체지표의 목표대비 실적" },
    { code: "A2", name: "통합만족도", desc: "당해연도 사업이 종료되기 전, RISE사업에 참여했던 모든 참여자를 대상으로 공통문항을 활용한 만족도 점수" },
    { code: "A3", name: "성과확산도", desc: "당해연도 사업의 주요 성과를 대내외에 공유·전파하고, 이해관계자와의 협력을 통한 사업의 인지도와 파급효과를 높인 정도" }
  ],
  diffusionItems: [
    { name: "초광역지산학연계", desc: "당해연도 사업 추진과 관련하여 타 지역·권역의 지자체, 산업체, 대학 및 유관기관과 연계·협력 활동" },
    { name: "사업단별 연계", desc: "당해연도 우리 대학 RISE사업 내 사업단 간 공동 추진 및 연계·협력 실적" },
    { name: "MOU", desc: "당해연도 사업 추진과 관련하여 대내외 협력기관 간에 체결한 업무협약 실적" },
    { name: "언론보도", desc: "당해연도 사업 추진과정 중 도출된 주요 성과가 외부 언론매체를 통해 보도된 실적" },
    { name: "행사", desc: "성과확산의 목적으로 당해연도 RISE사업 예산을 투입하여 기획·운영한 공식 행사(포럼, 워크숍, 성과공유회, 설명회 등)" }
  ]
};

// 8개 과제(사업단)
const PROJECTS = [
  { key: "보건",   full: "T1-1 8대산업 전문인력양성 (보건)",               short: "보건",   theme: "웰니스/헬스케어" },
  { key: "컬쳐",   full: "T2-2 지산학 K컬처&아트테크 창업가 양성",         short: "컬쳐",   theme: "K-컬처/창업" },
  { key: "JB집",   full: "T2-3 해외 우수인재 원스톱 지원 (JB집)",          short: "JB집",   theme: "해외인재" },
  { key: "성인",   full: "T3-1 성인학습자 친화형 학사체계 구축",           short: "성인",   theme: "평생교육" },
  { key: "드론",   full: "T3-2 K-드론사업단",                                 short: "드론",   theme: "드론/융합" },
  { key: "축제",   full: "T4-2 지역축제 참여를 통한 청년역량강화 프로젝트", short: "축제",   theme: "지역축제/청년" },
  { key: "맛잡고", full: "T4-3-2 전북의 맛을 품은 로컬조리인재 양성",       short: "맛잡고", theme: "로컬조리" },
  { key: "늘봄",   full: "T4-4 JB 늘봄 키즈 K-POP 스쿨",                    short: "늘봄",   theme: "늘봄/돌봄" }
];

// 공통지표 (Common Indicators) — Excel 데이터 그대로
const COMMON_INDICATORS = [
  { name: "1차년도 지표2 실적값", unit: "점/지수", data: { 보건: null, 컬쳐: null, JB집: null, 성인: null, 드론: null, 축제: null, 맛잡고: null, 늘봄: null } },
  { name: "1차년도 지표3 실적값", unit: "점/지수", data: { 보건: null, 컬쳐: null, JB집: null, 성인: null, 드론: null, 축제: null, 맛잡고: null, 늘봄: null } },
  { name: "1차년도 지표4 실적값", unit: "점/지수", data: { 보건: null, 컬쳐: null, JB집: null, 성인: null, 드론: null, 축제: null, 맛잡고: null, 늘봄: null } },
  { name: "통합 만족도(100점 환산)", unit: "점", data: { 보건: null, 컬쳐: null, JB집: null, 성인: null, 드론: null, 축제: null, 맛잡고: null, 늘봄: null } },
  { name: "초광역 지산학 연계 건수", unit: "건", data: { 보건: 0, 컬쳐: 3, JB집: null, 성인: null, 드론: 1, 축제: 4, 맛잡고: 2, 늘봄: 2 } },
  { name: "사업단 연계 건수",      unit: "건", data: { 보건: 2, 컬쳐: 1, JB집: null, 성인: null, 드론: 1, 축제: 1, 맛잡고: null, 늘봄: null } },
  { name: "MOU 건수",                unit: "건", data: { 보건: 44, 컬쳐: 4, JB집: null, 성인: null, 드론: 3, 축제: 14, 맛잡고: null, 늘봄: null } },
  { name: "언론보도 건수",           unit: "건", data: { 보건: 44, 컬쳐: 4, JB집: null, 성인: null, 드론: 2, 축제: 3, 맛잡고: null, 늘봄: null } },
  { name: "행사 운영 건수",          unit: "건", data: { 보건: 7, 컬쳐: 3, JB집: null, 성인: null, 드론: 4, 축제: 7, 맛잡고: null, 늘봄: null } }
];

// 대학자체지표 (5대 지수 체계)
const SELF_INDICES = [
  {
    name: "학습자 만족 향상 지수",
    desc: "커리큘럼 개발과 교육서비스의 질적 지속성 관리 수준을 반영하는 영역",
    items: [
      { name: "JB-산업체근로자의 Healthcare 증진 리빙랩 증가율", project: "보건", rows: 3 },
      { name: "K-컬처&아트테크 관련 창업교과목 신규개설",        project: "컬쳐", rows: 2 },
      { name: "대학의 성인학습 친화지수",                          project: "성인", rows: 2 },
      { name: "교육·현장·진로 연계 만족도 지수",                   project: "공통", rows: 3 }
    ]
  },
  {
    name: "전문인력육성지수",
    desc: "맞춤형 교육 운영과 인재양성 성과를 반영하는 영역",
    items: [
      { name: "JB형 인재양성 지수",                  project: "공통",   rows: 4 },
      { name: "JB형 해외 우수인재 유치·지원 지수", project: "JB집",   rows: 4 },
      { name: "프로그램 참여 대학생 수",              project: "공통",   rows: 2 },
      { name: "지역수요맞춤형 교육참여지수",         project: "공통",   rows: 2 },
      { name: "(군장대)시민디자이너 육성지표",       project: "군장대", rows: 2 }
    ]
  },
  {
    name: "지산학 연계 성과 지수",
    desc: "현장참여와 지역·산업체 협력을 통한 성과를 반영하는 영역",
    items: [
      { name: "늘봄프로그램 참여 전문인력 규모",           project: "늘봄", rows: 3 },
      { name: "축제 음원 제작 건수",                        project: "축제", rows: 1 },
      { name: "K-드론 융합콘텐츠 개발 건수",                project: "드론", rows: 2 },
      { name: "K-드론 산업체 현장실습 참여건수",           project: "드론", rows: 2 },
      { name: "창업동아리수",                                project: "컬쳐", rows: 1 },
      { name: "늘봄 프로그램 개발 또는 돌봄 교육 협력 건수", project: "늘봄", rows: 2 }
    ]
  },
  {
    name: "글로컬전문역량지수",
    desc: "자격, 수상 등을 통해 특성화 인재의 전문성이 대외적으로 증명되는 영역",
    items: [
      { name: "콘텐츠/IP 개발 건수",          project: "컬쳐",   rows: 1 },
      { name: "취업경쟁력 증가율",             project: "공통",   rows: 2 },
      { name: "드론 관련 자격증 취득 비율",   project: "드론",   rows: 2 },
      { name: "조리분야 자격증 취득률",        project: "맛잡고", rows: 2 },
      { name: "전국규모 조리대회 수상률",      project: "맛잡고", rows: 2 }
    ]
  },
  {
    name: "지역상생&브랜드 지수",
    desc: "브랜드 인지도와 주민 체감형 상생 성과를 반영하는 영역",
    items: [
      { name: "지역사회 협력 및 성과확산 증가", project: "공통", rows: 2 },
      { name: "JB 지역 활성화 지수",              project: "공통", rows: 3 },
      { name: "지역사회 가치창출 기여지수",      project: "공통", rows: 3 },
      { name: "아동학부모 만족도 평균점수",      project: "늘봄", rows: 2 }
    ]
  }
];

// 과제별 사업 성과 — 엑셀 상 빈 양식. 사업계획서 기준 초기 항목 시드
const PROJECT_PERFORMANCE_COLUMNS = [
  "과제명", "지수", "내용(추진전략)", "세부추진내용(추진과제)",
  "추진계획", "추진실적(간략히 정량적으로)", "달성률", "페이지"
];
const PROJECT_PERFORMANCE_ROWS = [
  // 비어있는 양식이지만 8개 과제 스캐폴드를 제공
  { 과제명: "보건",   지수: "학습자 만족 향상 지수",  전략: "JB 산업체근로자 Healthcare 리빙랩 운영", 과제: "리빙랩 증가율 확대", 계획: "목표 설정", 실적: "-", 달성률: null, 페이지: "" },
  { 과제명: "컬쳐",   지수: "학습자 만족 향상 지수",  전략: "K-컬처&아트테크 창업교과목 신규개설",    과제: "창업교과목 개설",   계획: "신규 교과목 개설", 실적: "-", 달성률: null, 페이지: "" },
  { 과제명: "JB집",   지수: "전문인력육성지수",        전략: "JB형 해외 우수인재 유치·지원",           과제: "원스톱 지원체계",   계획: "지원 운영", 실적: "-", 달성률: null, 페이지: "" },
  { 과제명: "성인",   지수: "학습자 만족 향상 지수",  전략: "성인학습자 친화형 학사체계 구축",        과제: "성인학습 친화지수", 계획: "제도·운영", 실적: "-", 달성률: null, 페이지: "" },
  { 과제명: "드론",   지수: "지산학 연계 성과 지수",  전략: "K-드론 융합 콘텐츠·현장실습",            과제: "콘텐츠·실습 확대", 계획: "개발·실습",  실적: "-", 달성률: null, 페이지: "" },
  { 과제명: "축제",   지수: "지산학 연계 성과 지수",  전략: "지역축제 참여 청년역량강화",              과제: "축제음원 제작·MOU", 계획: "운영·확산",  실적: "-", 달성률: null, 페이지: "" },
  { 과제명: "맛잡고", 지수: "글로컬전문역량지수",     전략: "로컬조리인재 양성",                        과제: "자격·수상률 제고", 계획: "교육·대회",  실적: "-", 달성률: null, 페이지: "" },
  { 과제명: "늘봄",   지수: "지역상생&브랜드 지수",    전략: "JB 늘봄 키즈 K-POP 스쿨",                 과제: "돌봄교육 협력",   계획: "프로그램 운영", 실적: "-", 달성률: null, 페이지: "" }
];

// 기타 (구축) — 거버넌스 구축 & 인프라 구축
const INFRASTRUCTURE = {
  note: [
    "*교육시설: 실습실, 강의실, 센터 등",
    "*교육환경: 제도, 규정, 인력충원 등"
  ],
  groups: [
    {
      name: "거버넌스 구축",
      items: [
        { label: "위원회 개최", count: null },
        { label: "행사 개최",   count: null },
        { label: "위원회 참여", count: null },
        { label: "행사 참여",   count: null },
        { label: "MOU 건수",    count: null },
        { label: "홍보 건수",   count: null }
      ]
    },
    {
      name: "인프라 구축",
      items: [
        { label: "교육시설 신설", count: null },
        { label: "교육환경 개선", count: null },
        { label: "기타",            count: null }
      ]
    }
  ]
};

// 집계된 KPI (공통지표 기반)
function sumIndicator(name) {
  const ind = COMMON_INDICATORS.find(i => i.name === name);
  if (!ind) return 0;
  return Object.values(ind.data).reduce((a, b) => a + (b || 0), 0);
}
const KPI_SUMMARY = {
  totalMOU: sumIndicator("MOU 건수"),
  totalPress: sumIndicator("언론보도 건수"),
  totalEvents: sumIndicator("행사 운영 건수"),
  totalCrossRegion: sumIndicator("초광역 지산학 연계 건수"),
  totalCrossProject: sumIndicator("사업단 연계 건수"),
  projectCount: PROJECTS.length,
  indexCount: SELF_INDICES.length,
  subIndicatorCount: SELF_INDICES.reduce((a, b) => a + b.items.length, 0)
};

window.__RISE__ = { META, PROJECTS, COMMON_INDICATORS, SELF_INDICES,
  PROJECT_PERFORMANCE_COLUMNS, PROJECT_PERFORMANCE_ROWS, INFRASTRUCTURE, KPI_SUMMARY };
