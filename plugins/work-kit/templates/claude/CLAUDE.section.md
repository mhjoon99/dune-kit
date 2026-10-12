<!-- work-kit:claude-md — /init 이 CLAUDE.md 에 합치는 절. 선택한 묶음의 줄만 남긴다 -->
## 규칙 문서 (자동 로드)

`.claude/rules/` 의 `paths:` 없는 파일은 매 세션 자동 적용되고, 나머지는 `paths:` 가 가리키는
파일을 만질 때만 실린다 — 여기서 `@` 로 끌어오지 않는다.

| 파일 | 언제 실리나 |
|---|---|
| `rules/core.md` | 항상 — 업무 흐름·리포트·커밋·이슈 등록·저장소 주의·워크트리 |
| `rules/process.md` | 항상 — 업무 흐름(PRD → Tech Spec → Card → Commit → 주간보고) |
| `rules/work-attitude.md` | 항상 — 결정≠착수, 매뉴얼 옮기는 법, 한국어, 메모리 자리 |
| `rules/prd.md` | `docs/prd/*/*.md` — PRD 파일명·버전·템플릿 |
| `rules/tech-spec.md` | `docs/prd/*/tech-spec/**` — Tech Spec 템플릿·완료 기준 |
| `rules/card.md` | `docs/card/**` — Card·Task list. PRD 기능 하나 = 카드 하나 = 파일 하나 |
| `rules/docs-format.md` | `docs/**` — 날짜·시각 표기 |
| `rules/issues.md` | `docs/issues/**` — 이슈 원고(장애·버그만. 작업은 Card). type 고르는 법 |
| `rules/detected-issues.md` | `docs/detected_issues.md` — 내가 정할 수 없는 결정 모음 |
| `rules/weekly-report.md` | `docs/reports/weekly/**` — 주간 보고 형식 |
| `rules/gitlab-templates.md` | `.gitlab/**` — MR·이슈 템플릿을 고칠 때 |

문서는 `/prd`·`/tech-spec`·`/card`·`/daily-report`·`/weekly-report`(work-kit 플러그인)로 만들고,
로컬 파일은 사용자가 {{docsTool}}·{{cardTool}} 에 붙여 넣는 원고다.

## 실행·검증

```bash
# 전체 테스트 — 커밋 전 게이트
{{test}}

# 정적 검사 — 위반 0 건이 기준선
{{lint}}
```

이 절은 `.gitlab/merge_request_templates/Default.md` 「✅ 확인」의 원본이다 — **한쪽을 고치면 다른 쪽도 고친다.**

## 작업 방식

- **브랜치**: {{branchPolicy}}. 보호 브랜치({{protectedBranches}})에 직접 커밋하지 않는다(neon-bubble 가드가 막는다).
- **커밋은 작업 단위마다 하나**, 승인은 **MR** 에서 받는다(`rules/core.md` §3).
- **CI/CD 는 {{ciTool}}**.
- git 추적 파일에 사내 IP·계정·경로·직함을 쓰지 않는다. 실값은 `docs/` 에만.
- 응답·문서는 한국어. 코드 식별자·명령은 원문 그대로.
<!-- /work-kit:claude-md -->
