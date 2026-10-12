# .claude — {{project}} 작업 하네스

Claude Code 가 이 저장소에서 읽는 것들. `/init`(work-kit)이 깔았다. 다시 돌리면 차이만 제안한다.

```
CLAUDE.md                늘 지켜야 하는 것. 세션마다 로드
.claude/
  README.md              이 파일. 매니페스트
  settings.local.json    autoMemoryDirectory (절대경로라 local 에 둔다)
  rules/                 룰. paths 없으면 늘, 있으면 그 경로를 만질 때 로드
  memory/                자동 메모리. 사용자가 열어 보고 고치는 자리
.gitlab/                 MR·이슈 템플릿 (깃랩이 자동으로 읽는다)
```

## 룰

| 파일 | 다루는 것 | `paths` |
|---|---|---|
| `core.md` | 업무 흐름·리포트·커밋·이슈 등록·저장소 주의·워크트리 | 없음. 늘 로드 |
| `process.md` | 업무 흐름(PRD → Tech Spec → Card → Commit → 주간보고)과 문서별 자리 | 없음. 늘 로드 |
| `work-attitude.md` | 결정≠착수, 매뉴얼 옮기는 법, 한국어·UTF-8, 메모리 자리 | 없음. 늘 로드 |
| `prd.md` | PRD 파일명·버전·템플릿·"필요한 기능" 표 | `docs/prd/*/*.md` |
| `tech-spec.md` | Tech Spec 템플릿·참고 사항·완료 기준 | `docs/prd/*/tech-spec/**` |
| `card.md` | Card·Task list 폴더·파일명·템플릿·완료 이동 | `docs/card/**` |
| `docs-format.md` | 날짜·시각 표기 | `docs/**` |
| `issues.md` | 이슈 원고 — 장애·버그만, type·템플릿 | `docs/issues/**` |
| `detected-issues.md` | 내가 정할 수 없는 결정 양식 | `docs/detected_issues.md` |
| `weekly-report.md` | 주간 보고 형식·판정 규칙 | `docs/reports/weekly/**` |
| `gitlab-templates.md` | 깃랩 MR·이슈 템플릿을 고칠 때 | `.gitlab/**` |

## 플러그인이 주는 것

| 무엇 | 어디서 | 하는 것 |
|---|---|---|
| `/prd` `/tech-spec` `/card` | work-kit | PRD·Tech Spec·Card 원고 작성. 형식은 같은 이름의 룰 |
| `/daily-report` `/weekly-report` | work-kit | 일일 리포트, PRD 기준 주간 보고 |
| `/init` | work-kit | 이 하네스를 깔거나, 다시 돌려 차이를 제안 |
| 가드 | neon-bubble | `.env` 스테이징·강제 푸시·보호 브랜치 커밋·추적 파일 사설 IP 를 막거나 묻는다 |
| 메모리 알림 | neon-bubble | `.claude/memory/` 가 바뀌면 토스트·사이드 패널 |

## 메모리

`.claude/memory/MEMORY.md` 가 색인이고, 낱개 파일 하나가 기억 하나다. 직접 고쳐도 된다 — 다음 세션부터 반영된다.

## 고치는 법

- **룰**: `rules/{이름}.md`. `description` 을 적는다. 늘 적용할 것이면 `paths` 를 빼고 위 표와 `CLAUDE.md` 규칙 표에 한 줄 더한다
- 항목을 더하거나 지우면 위 표를 같이 고친다. **표에 없는 항목은 없는 것으로 친다.**
