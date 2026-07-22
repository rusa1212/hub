:root {
  /* ===== Colors: Background ===== */
  --color-bg: #0a0a0a;              /* 거의 순수 블랙 배경 */
  --color-bg-elevated: #121212;     /* 카드/패널용 약간 밝은 배경 */

  /* ===== Colors: Primary Accent (브랜드/카테고리 컬러) ===== */
  --color-teal: #2dd4a7;            /* 메인 틸/그린 - Google, DeepMind 등 */
  --color-teal-dim: #1a7a63;        /* 어두운 틸 (선/영역용) */
  --color-gold: #e0a83e;            /* 메인 골드/앰버 - OpenAI, DeepSeek 등 */
  --color-gold-dim: #8a6a1f;        /* 어두운 골드 */
  --color-white: #f5f5f0;           /* 타이틀, 강조 텍스트 */

  /* ===== Colors: Text ===== */
  --text-primary: #f5f5f0;          /* 본문/제목 기본 */
  --text-secondary: #a0a0a0;        /* 캡션, 서브텍스트 */
  --text-muted: #6b6b6b;            /* 부가 라벨, 흐린 텍스트 */
  --text-accent-teal: var(--color-teal);
  --text-accent-gold: var(--color-gold);

  /* ===== Colors: Line/Flow (스파게티 플로우 라인용) ===== */
  --line-teal: rgba(45, 212, 167, 0.7);
  --line-gold: rgba(224, 168, 62, 0.7);
  --line-neutral: rgba(120, 120, 120, 0.3);

  /* ===== Typography ===== */
  --font-heading: 'Helvetica Neue', 'Arial Black', sans-serif; /* 굵은 대문자 헤딩 */
  --font-body: 'Helvetica Neue', Arial, sans-serif;
  --font-label: 'Helvetica Neue', Arial, sans-serif; /* 작은 방사형 라벨 */

  --fs-title: 3rem;         /* "THE LLM WAVE" 로고성 타이틀 */
  --fs-h1: 1.4rem;          /* 섹션 제목 (TRANSFORMER LABS...) */
  --fs-h2: 1rem;            /* 서브 섹션 (PRE-USABILITY RACE 등) */
  --fs-body: 0.8rem;        /* 본문 설명 */
  --fs-label: 0.55rem;      /* 방사형 라벨/모델명 */
  --fs-caption: 0.6rem;     /* 하단 크레딧 */

  --fw-heading: 800;        /* 타이틀 두께 */
  --fw-label: 500;

  --letter-spacing-heading: 0.05em; /* 대문자 헤딩 자간 */
  --letter-spacing-label: 0.02em;

  /* ===== Radius ===== */
  --radius-none: 0px;       /* 대부분 각진 사각형 유지 */
  --radius-sm: 2px;         /* 작은 컬러 태그/뱃지 */
  --radius-pill: 999px;     /* 랩 이름 옆 도트/캡슐 (있다면) */

  /* ===== Spacing ===== */
  --space-xs: 4px;
  --space-sm: 8px;
  --space-md: 16px;
  --space-lg: 32px;
  --space-xl: 64px;
  --space-section-gap: 48px; /* 좌측 텍스트 블록 간 간격 */

  /* ===== Card / Panel Style (설명 블록: PRE-USABILITY RACE 등) ===== */
  --card-bg: transparent;          /* 배경 없음, 순수 텍스트 블록 */
  --card-border: none;
  --card-border-accent: 1px solid var(--color-teal); /* 브라켓 라인 컬러 */
  --card-padding: var(--space-md);
  --card-radius: var(--radius-none);
  --card-shadow: none;              /* 플랫 디자인, 그림자 없음 */

  /* ===== Bracket/Divider Style (연도 구간 표시선) ===== */
  --bracket-color: var(--color-white);
  --bracket-width: 1.5px;

  /* ===== Effects ===== */
  --glow-teal: 0 0 12px rgba(45, 212, 167, 0.4);
  --glow-gold: 0 0 12px rgba(224, 168, 62, 0.4);
}