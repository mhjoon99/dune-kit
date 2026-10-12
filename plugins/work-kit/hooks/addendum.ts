// /init 의 숨은 프롬프트 끝에 붙일 work-kit 지시문을 만든다.
// 묶음 정의(BUNDLES)가 파일·절의 정본이고, 지시문은 그 표를 그대로 풀어 쓴다.

export type Bundle = {
  key: string
  label: string
  summary: string
  // 플러그인 templates/ 기준 경로 → 프로젝트 안 경로
  files: readonly (readonly [string, string])[]
  // core.md 안에서 이 묶음이 가진 절(<!-- work-kit:{key} --> 블록)
  coreSections: string
  extra?: string
}

export const BUNDLES: readonly Bundle[] = [
  {
    key: 'manual',
    label: '업무 매뉴얼',
    summary: 'PRD → Tech Spec → Card 흐름, 문서 형식, /prd /tech-spec /card',
    files: [
      ['rules/process.md', '.claude/rules/process.md'],
      ['rules/prd.md', '.claude/rules/prd.md'],
      ['rules/tech-spec.md', '.claude/rules/tech-spec.md'],
      ['rules/card.md', '.claude/rules/card.md'],
      ['rules/docs-format.md', '.claude/rules/docs-format.md'],
    ],
    coreSections: '§1',
  },
  {
    key: 'git',
    label: 'Git·커밋·MR',
    summary: '작업 단위 커밋·승인은 MR·merge 후 로컬 브랜치 정리·워크트리, MR 템플릿',
    files: [
      ['rules/gitlab-templates.md', '.claude/rules/gitlab-templates.md'],
      ['gitlab/merge_request_templates/Default.md', '.gitlab/merge_request_templates/Default.md'],
    ],
    coreSections: '§3, §6',
  },
  {
    key: 'issue',
    label: '이슈',
    summary: '발견 즉시 등록(버그는 이슈·작업은 Card·결정은 detected_issues), Bug·Incident 템플릿',
    files: [
      ['rules/issues.md', '.claude/rules/issues.md'],
      ['rules/detected-issues.md', '.claude/rules/detected-issues.md'],
      ['gitlab/issue_templates/Bug.md', '.gitlab/issue_templates/Bug.md'],
      ['gitlab/issue_templates/Incident.md', '.gitlab/issue_templates/Incident.md'],
    ],
    coreSections: '§4',
    extra: '`.gitlab/issue_templates/Default.md` 가 있으면 지울지 묻는다(작업은 Card 라 쓰지 않는다).',
  },
  {
    key: 'report',
    label: '보고',
    summary: '/daily-report, /weekly-report(PRD 기준 진행률)',
    files: [['rules/weekly-report.md', '.claude/rules/weekly-report.md']],
    coreSections: '§2',
  },
  {
    key: 'repo',
    label: '저장소 정책',
    summary: 'docs/ 미추적, 추적 파일에 사내 정보 금지',
    files: [],
    coreSections: '§5',
    extra: '`.gitignore` 에 `docs/*` 와 추적 예외 `!docs/{경로}` 줄을 더한다(이미 있으면 그대로).',
  },
  {
    key: 'attitude',
    label: '작업 태도',
    summary: '결정≠착수, 매뉴얼은 원문 그대로, 한국어·UTF-8, 메모리를 저장소 .claude/memory 에',
    files: [['rules/work-attitude.md', '.claude/rules/work-attitude.md']],
    coreSections: '',
    extra:
      '`.claude/settings.local.json` 에 `"autoMemoryDirectory": "{{projectAbs}}/.claude/memory"` 를 **병합**한다' +
      '(다른 키는 건드리지 않는다. 절대경로만 허용되는 키라 local 설정에 둔다. 경로 구분자는 `/`). ' +
      '`.claude/memory/` 가 없으면 빈 `MEMORY.md` 하나로 만든다. `.claude/settings.local.json` 이 `.gitignore` 에 없으면 더한다.',
  },
]

export const PLACEHOLDERS: readonly (readonly [string, string])[] = [
  ['{{project}}', '프로젝트 이름. 기본은 폴더 이름(또는 manifest 의 name)'],
  ['{{projectAbs}}', '프로젝트 루트 절대경로(`/` 구분자). 묻지 않는다'],
  ['{{test}}', '전체 테스트 명령. 분석으로 찾고, 빈 프로젝트면 스택에 맞는 후보를 보여 주고 묻는다'],
  ['{{lint}}', '정적 검사 명령. 위와 같다. 없으면 "없음" 으로 두지 말고 넣을지 묻는다'],
  ['{{protectedBranches}}', '직접 커밋하지 않는 브랜치(예: `main`·`stage`). `git branch -a`·원격 HEAD 로 찾는다'],
  ['{{integrationBranch}}', 'MR 이 들어가는 통합 브랜치(`stage` 가 있으면 그것, 없으면 기본 브랜치)'],
  ['{{branchPolicy}}', '브랜치 운용 한 문장(예: "`stage` 가 통합 브랜치, `main` 은 배포. 기능 작업은 `feat/`·`fix/`·`refactor/`·`chore/` 브랜치")'],
  ['{{docsTool}}', '문서 도구. 기본 docmost'],
  ['{{cardTool}}', '카드 도구. 기본 Planka'],
  ['{{issueTool}}', '이슈·MR 도구. 기본 GitLab'],
  ['{{ciTool}}', 'CI/CD. 기본 Jenkins'],
  ['{{trackedDocs}}', '`docs/` 중 git 추적 예외. 표의 행(`| \\`docs/…\\` | 왜 |`)으로. `git ls-files docs/` 에 이미 있는 파일은 후보로 보여 준다. 없으면 `| (없음) | |`'],
  ['{{reportProjects}}', '주간 보고의 프로젝트명 블록 이름(기본 `{{project}}` 하나)'],
  ['{{mrChecks}}', 'MR 「✅ 확인」의 조건부 항목(`- [ ] 🖼 프론트 변경 시 …`, `- [ ] 🗄 마이그레이션 …` 등). 분석으로 후보를 만들고 인터뷰로 확정. 없으면 그 줄을 지운다'],
]

function bundleTable(root: string): string {
  const rows = BUNDLES.map((b, i) => {
    const files = b.files.map(([from, to]) => `\`${to}\` ← \`${root}/templates/${from}\``).join('<br>')
    const core = b.coreSections ? `core.md ${b.coreSections}` : '—'
    return `| ${i + 1}. ${b.label} (\`${b.key}\`) | ${b.summary} | ${core} | ${files || '—'} | ${b.extra ?? ''} |`
  })
  return [
    '| 묶음 | 무엇 | core.md 절 | 만들 파일 ← 템플릿 | 그 밖에 |',
    '|---|---|---|---|---|',
    ...rows,
  ].join('\n')
}

export function buildAddendum(root: string): string {
  const r = root.replace(/\\/g, '/')
  const placeholders = PLACEHOLDERS.map(([k, v]) => `| \`${k}\` | ${v} |`).join('\n')
  return `
---

# work-kit: 이 /init 에 업무 하네스를 합친다

위의 내장 /init 절차를 그대로 따르되, 아래 work-kit 단계를 **끼워 넣어** 한 흐름으로 진행한다. 응답·질문·생성 문서는 한국어로 쓴다.
템플릿은 플러그인 폴더 \`${r}/templates/\` 에 있다 — 읽기만 하고 고치지 않는다.

## 순서

| 단계 | 언제 | 하는 것 |
|---|---|---|
| ① 묶음 선택 | **가장 먼저**(내장 Phase 0·1 의 질문보다 앞, primer 출력 뒤) | 아래 「묶음 선택」 |
| ② 프로젝트 기본 | ① 바로 뒤 | 이름·빈 프로젝트 여부·스택을 **한 번의 AskUserQuestion** 으로 확인. 폴더 이름·manifest·파일 유무로 기본값을 미리 채워 선택지로 준다 |
| ③ 분석 방향 | 내장 Phase 0·1 | 내장 질문 그대로. **빈 프로젝트면 건너뛴다** |
| ④ 분석 | 내장 Phase 2 | 서브에이전트에게 「분석에서 함께 찾을 것」도 맡긴다. **빈 프로젝트면 건너뛴다** |
| ⑤ 채운 값 확인 | 내장 Phase 3 | 분석으로 못 채운 자리표시값만 묻고, 제안서에 work-kit 항목을 넣어 확인받는다 |
| ⑥ 생성 | 내장 Phase 4~7 | 확인받은 파일만 쓴다. CLAUDE.md 에는 work-kit 절을 합친다 |

내장 흐름이 위 Phase 구조가 아니면(구버전 /init) 같은 순서 ①~⑥ 으로 진행하되, ⑤ 의 확인을 받기 전에는 아무 파일도 쓰지 않는다.

## ① 묶음 선택

AskUserQuestion **한 번**에 multiSelect 질문 두 개로 묻는다(선택지는 질문당 4개까지라 나눈다). 설명에 "보통은 전부 고른다" 를 넣는다.
- 질문 A "문서·보고 묶음": 1 업무 매뉴얼 / 4 보고 / 3 이슈
- 질문 B "규칙 묶음": 2 Git·커밋·MR / 5 저장소 정책 / 6 작업 태도

${bundleTable(r)}

- **\`.claude/rules/core.md\`** 는 묶음이 하나라도 core 절을 가지면 만든다. 템플릿 \`${r}/templates/rules/core.md\` 의
  \`<!-- work-kit:{key} -->\` … \`<!-- /work-kit:{key} -->\` 블록 중 **고른 묶음의 블록만 남기고** 나머지 블록은 통째로 지운다.
  남긴 블록의 표시 주석은 지우지 않는다(다시 돌릴 때 비교 기준이다). 절 번호는 바꾸지 않는다.
- \`docs-format.md\` 는 1 이 아니어도 3·4 를 고르면 함께 만든다.
- 고르지 않은 묶음을 가리키는 문장·표 행(예: \`weekly-report.md\` 참조, \`/weekly-report\` 행)은 만든 파일에서 지운다. 끊긴 참조를 남기지 않는다.
- \`.claude/README.md\` 는 \`${r}/templates/claude/README.md\` 로 만들고, 표에서 만들지 않은 항목의 행을 지운다.
- 플러그인이 주는 명령(\`/prd\` \`/tech-spec\` \`/card\` \`/daily-report\` \`/weekly-report\`)과 가드(neon-bubble)는 프로젝트로 복사하지 않는다.

## ④ 분석에서 함께 찾을 것

- 테스트·정적 검사 명령(\`{{test}}\`·\`{{lint}}\` 후보), CI 파일(Jenkinsfile 등)
- 브랜치: \`git branch -a\`, \`git symbolic-ref refs/remotes/origin/HEAD\`, 원격 주소(GitLab 인지)
- \`git ls-files docs/\` — 이미 추적 중인 docs 파일(\`{{trackedDocs}}\` 후보)
- 이미 있는 \`.claude/rules/\`·\`.gitlab/\`·\`.claude/settings.local.json\`·\`.gitignore\` 의 관련 줄
- MR 확인 조건부 항목 후보(프론트 폴더, 마이그레이션 폴더, OpenAPI 스냅샷 등)

## 자리표시값

템플릿의 \`{{…}}\` 를 아래 값으로 채운다. **분석·인터뷰로 확인한 값만** 쓰고, 지어내지 않는다. 사내 도구 4개(docmost·Planka·GitLab·Jenkins)는 기본값을 보여 주고 바꿀지 한 질문으로 묻는다.
채운 뒤 생성 파일에 \`{{\` 가 남아 있으면 안 된다.

| 자리 | 무엇·어디서 |
|---|---|
${placeholders}

이슈·MR 도구가 GitLab 이 아니면 \`.gitlab/\` 템플릿과 \`gitlab-templates.md\` 를 그 도구의 자리로 옮길지 묻고, 답을 받기 전엔 만들지 않는다.

## ⑤ 제안서에 넣을 것

내장 제안서의 bullet 뒤에 work-kit 항목을 이어 적는다.
- \`**[work-kit 묶음]** 1 업무 매뉴얼, 2 Git·커밋·MR …\` 한 줄
- 만들 파일마다 한 줄(\`**[rule]** .claude/rules/card.md — Card 형식\` 처럼)
- 채운 자리표시값을 \`이름 = 값\` 으로 한 덩어리 — 사용자가 여기서 고친다
- \`.claude/memory/\` 를 git 에서 뺄지(기본: \`.gitignore\` 에 더해 뺀다) 한 줄
확인 질문은 내장 것 하나로 같이 받는다.

## ⑥ 생성

- 템플릿을 Read 로 읽어 값을 채운 뒤 Write 한다. 템플릿의 사내 매뉴얼 원문(PRD·Tech Spec 의 템플릿·참고 사항)은 **고치지 않는다**.
- CLAUDE.md 를 쓰는 경로(내장 Phase 4)에서는 \`${r}/templates/claude/CLAUDE.section.md\` 를 채워 그 내용을 합친다(표시 주석 포함). 내장 규칙("지울 수 있는 줄은 쓰지 않는다")보다 이 절이 우선한다.
  사용자가 CLAUDE.md 를 건드리지 않기로 했으면 이 절을 \`.claude/rules/core.md\` 끝에 붙일지 묻는다.
- neon-bubble 이 설치돼 있으면 Phase 8 요약에 "neon-bubble 의 보호 브랜치 설정(\`protectedBranches\`)을 {{protectedBranches}} 와 맞추라" 를 넣는다.
- Phase 8 요약에 만든 파일 표(파일 · 묶음 · 채운 값)를 넣는다.

## 다시 돌릴 때

\`.claude/rules/\` 에 \`<!-- work-kit:\` 표시가 있거나 \`.claude/README.md\` 가 work-kit 매니페스트면 **재실행**이다.
- ① 의 선택지 설명에 지금 깔린 묶음을 적어 준다. ② 는 기존 파일에서 값을 읽어 확인만 받는다.
- 고른 묶음의 템플릿을 지금 값으로 채운 결과와 기존 파일을 비교해 **차이만** 제안한다(파일별 diff, 줄마다 한 줄 이유).
  사용자가 직접 고친 것으로 보이는 부분(템플릿에 없는 문장·바뀐 예시)은 지우는 쪽으로 제안하지 않는다.
- 확인받은 차이만 반영한다. 차이가 없으면 "work-kit 파일은 최신" 이라고만 알린다.
`
}
