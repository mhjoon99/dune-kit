---
description: 업무 프로세스 — PRD → Tech Spec → Card(Task list) → Commit → 주간보고 흐름과 문서별 자리
---

# 업무 프로세스 (항상 적용)

> 사내 「업무프로세스 V1.0」을 이 저장소에 옮긴 것.
> 여기는 전체 흐름만 적는다. 문서별 형식은 그 폴더를 만질 때 로드되는 룰에 있다.

## 1. 흐름

```
PRD ──▶ Tech Spec (선택) ──▶ Card (Task list) ──▶ Commit ──▶ 주간보고
                              ▲
        PRD 로 쓰기엔 작은 일은 여기서 시작 (PRDx)
```

| 단계 | 무엇 | 로컬 자리 | 룰 | 커맨드 | 사내 도구 |
|---|---|---|---|---|---|
| PRD | 무엇을 왜 만드는가 | `docs/prd/{NN}-{제목}_v{버전}/` | `prd.md` | `/prd` | {{docsTool}} |
| Tech Spec | 어떻게 만드는가. **선택** | 그 PRD 버전 폴더의 `tech-spec/` | `tech-spec.md` | `/tech-spec` | {{docsTool}} |
| Card | PRD 기능 하나 = 카드 하나. 할 일이 Task list | `docs/card/` | `card.md` | `/card` | {{cardTool}} |
| 구현·커밋 | 카드의 할 일을 코드로 | — | `core.md` §3 | — | {{issueTool}} MR |
| 주간보고 | PRD 기준 진행 현황 | `docs/reports/weekly/` | `weekly-report.md` | `/weekly-report` | 보고 시스템 |

## 2. 로컬 파일은 원고다

- `docs/prd/`·`docs/card/` 의 파일은 **사용자가 {{docsTool}}·{{cardTool}} 에 붙여 넣을 원고**다. 내가 직접 올리지 않는다
- **{{docsTool}} URL 을 적는 칸은 비워 둔다**(Card 의 `링크`, Tech Spec 의 `상위 PRD 링크`). 사용자가 채운다
- 템플릿은 방침의 것을 쓰되 **반드시 그대로일 필요는 없다.** 절을 더하거나 빼려면 사용자에게 묻는다

## 3. 어디서 시작하나

| 상황 | 시작점 |
|---|---|
| 새 요구사항·기능 묶음 | **PRD** |
| PRD 로 쓰기엔 단위가 작은 임시·일시 업무 | **Card** — `docs/card/PRDx/` |
| 작업·조사·질문 답변 중 **할 작업**을 발견했다(기능 추가·개선·리팩터링·정리) | **기존 Card 에 할 일로 더한다.** 들어갈 카드가 없을 때만 새 Card. 이슈를 만들지 않는다(`card.md` §7) |
| 작업·조사·질문 답변 중 **장애·버그**를 발견했다 | **{{issueTool}} 이슈** + 관련 Card 에 할 일 한 줄. 새 Card 는 만들지 않는다(`core.md` §4, `card.md` §7) |

발견한 것은 **그 턴에** 원고 파일로 등록하고, 답변 끝에 등록한 경로를 적는다(`core.md` §4).

## 4. 문서를 만드는 것과 착수는 다르다

Card 를 만들어도 구현을 시작하지 않는다. 구현은 **사용자가 그 카드 착수를 지시했을 때만** 시작한다.
착수한 뒤 어떻게 나눠 만드는지는 이 룰의 범위가 아니다.

## 5. 완료 표시와 이동

**테스트 검증을 통과한 뒤에만** 체크한다(`card.md`). 완료 표시는 Card → PRD 순서로 올라간다.

| 문서 | 완료되면 |
|---|---|
| Card | `docs/card/` 아래 경로(PRD 폴더·구분 폴더·파일명)를 그대로 `docs/trash/complete/card/` 아래로 옮긴다(`card.md` §6) |
| 이슈 원고 | 완료 기준이 전부 `[x]` 면 `docs/trash/complete/issues/` 로 옮긴다(`issues.md` §6) |
| **PRD·Tech Spec** | **옮기지 않는다.** `docs/prd/` 안의 문서(`tech-spec/` 포함)는 체크리스트가 전부 `[x]` 가 되어도 `docs/trash/` 로 옮기지 않는다. 완료는 문서 머리의 상태(`✅ 완료`)로만 표시한다 |
