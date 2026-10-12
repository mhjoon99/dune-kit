---
description: 코드 리뷰 — 통합 브랜치에서 갈라진 뒤의 변경분, 또는 GitLab MR(번호·URL)을 리뷰 에이전트들에게 맡기고 리뷰어별 표로 정리한다
argument-hint: [mr-번호 | mr-url | 비우면 로컬 브랜치 리뷰]
---

# MR Review

> Adapted from the ECC `/code-review` command (MIT). PR review mode there was adapted from PRPs-agentic-eng by Wirasm.

**입력**: $ARGUMENTS

이 명령은 변경분 수집, 리뷰 에이전트 호출, 중복 지적 합치기, 정리만 한다. 점검 자체는 에이전트가 한다.

## 1. 모드 고르기

| 입력 | 모드 |
|---|---|
| 숫자(`42`, `!42`) 또는 `…/-/merge_requests/42` URL | **MR 모드** |
| 없음 | **로컬 모드** |

## 2. 변경분 모으기

### 로컬 모드

통합 브랜치에서 갈라진 뒤의 **커밋 + 커밋 전 변경분**을 본다.

통합 브랜치: `stage` 가 있으면 `stage`, 없으면 기본 브랜치.

```bash
git rev-parse --verify --quiet origin/stage || git symbolic-ref --short refs/remotes/origin/HEAD
git merge-base HEAD <통합 브랜치>
git diff --name-status <merge-base>            # 커밋 + 커밋 전 변경분
git ls-files --others --exclude-standard       # 아직 추적하지 않는 새 파일
git log --oneline <merge-base>..HEAD
```

바뀐 것이 없으면 "리뷰할 변경이 없습니다" 로 끝낸다. 지금 통합 브랜치 위에 있으면(갈라진 커밋 없음) 커밋 전 변경분만 본다.

### MR 모드

```bash
glab mr view <번호> -F json
glab mr diff <번호> --raw
```

- `glab` 이 없거나 로그인돼 있지 않으면 알리고 끝낸다(설치·로그인은 dev-kit README).
- MR 의 소스 브랜치가 로컬에 체크아웃돼 있지 않으면 에이전트가 파일 전체를 읽을 수 없다. `glab mr checkout <번호>` 를 할지 **사용자에게 묻는다** — 작업 중인 변경이 있으면 먼저 알린다. 거절하면 diff 만으로 리뷰하고 그 한계를 결과에 적는다.
- MR 설명에서 목적, 연결된 이슈·Card, 테스트 계획을 읽어 에이전트에게 함께 넘긴다.

## 3. 리뷰어 고르기

`code-reviewer` 는 항상 부른다. 나머지는 바뀐 파일을 보고 고른다.

| 에이전트 | 부르는 조건 |
|---|---|
| `code-reviewer` | 항상 |
| `python-reviewer` | `.py` 가 바뀜 |
| `fastapi-reviewer` | FastAPI 라우터·의존성·Pydantic 스키마가 바뀜 |
| `database-reviewer` | SQL·마이그레이션·ORM 모델이 바뀜 |
| `security-reviewer` | 인증·권한, 외부 입력 처리, 비밀값·설정이 바뀜 |

문서·설정만 바뀌었으면 `code-reviewer` 하나로 충분하다.

## 4. 리뷰 돌리기

고른 에이전트를 **한 번에 동시에** 부른다. 각 에이전트에게 넘길 것:

- 바뀐 파일 목록과 diff 를 얻는 명령(로컬: `git diff <merge-base>`, MR: 받아 둔 diff)
- 변경의 목적(커밋 메시지, MR 설명, 연결된 Card·플랜)
- 프로젝트 규칙의 위치(`CLAUDE.md`, `.claude/rules/`)
- 바뀐 파일은 diff 만 보지 말고 **전체를 읽으라**는 것
- 지적마다 `심각도 / 파일:줄 / 내용 / 고칠 안` 으로 답하라는 것

심각도는 넷이다.

| 심각도 | 뜻 |
|---|---|
| CRITICAL | 보안 취약점, 데이터 손실 위험 — merge 전에 반드시 고친다 |
| HIGH | 버그, 논리 오류 — merge 전에 고친다 |
| MEDIUM | 품질 문제 — 고치기를 권한다 |
| LOW | 사소한 제안 |

## 5. 검증 명령

프로젝트의 테스트·린트 명령을 찾아 돌린다(`CLAUDE.md`, `pyproject.toml`, `package.json`). 못 찾으면 건너뛰고 "건너뜀" 으로 적는다. MR 모드에서 소스 브랜치를 체크아웃하지 않았으면 돌리지 않는다.

## 6. 정리해서 보여 주기

같은 곳을 여러 에이전트가 지적했으면 하나로 합치고 리뷰어 칸에 둘 다 적는다. 에이전트의 지적 가운데 변경분과 무관한 것(바뀌지 않은 코드)은 뺀다.

터미널에 아래 모양으로 보여 준다. 표는 work-kit MR 템플릿의 「🔍 코드 리뷰 결과」에 그대로 옮길 수 있다.

```markdown
## 코드 리뷰: <브랜치 또는 !번호 제목>

범위: <통합 브랜치>..HEAD 커밋 N개 + 커밋 전 변경분 / 파일 N개
검증: 테스트 <통과|실패|건너뜀> · 린트 <통과|실패|건너뜀>

| 리뷰어 | 지적 | 반영 | 보류 |
|---|---|---|---|
| code-reviewer | 3 | 0 | 0 |
| python-reviewer | 1 | 0 | 0 |

### 지적
1. [HIGH] `path/file.py:42` — 내용. 고칠 안. (code-reviewer)
2. [MEDIUM] …

### 판단
<CRITICAL·HIGH 가 있으면 "merge 전에 고칠 것 N건", 없으면 "막는 지적 없음">
```

지적을 고친 뒤 다시 돌리면 「반영」 칸을 채운다. 사용자가 고치지 않기로 한 것은 「보류」로 세고 `[심각도] 내용 — 보류 이유` 한 줄씩 적는다.

리뷰 결과를 파일로 저장하지 않는다.

## 7. GitLab 에 올리기 (MR 모드, 물어본 뒤에만)

터미널에 결과를 보여 준 다음 "이 요약을 MR 에 댓글로 올릴까요" 를 묻는다. 승낙하면 **요약 댓글 하나**만 올린다.

```bash
glab mr note create <번호> -m "<6 의 요약>"
```

- 특정 줄에 다는 댓글은 사용자가 따로 요청할 때만 쓴다: `glab mr note create <번호> --file <경로> --line <줄> -m "…"`
- **승인(`glab mr approve`)·merge·close 는 하지 않는다.** 댓글은 사용자 이름으로 남는다.
- GitLab 주소·토큰을 추적 파일이나 댓글에 적지 않는다.

## 주의

- **바뀐 파일이 50개를 넘으면** 범위가 크다고 알리고 소스 → 테스트 → 설정·문서 순으로 본다.
- **통합 브랜치가 앞서 있으면** `git fetch` 뒤 rebase 를 제안만 한다(직접 하지 않는다).
