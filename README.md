# dune-kit

Claude Code 를 내 방식대로 꾸미는 플러그인 모음(마켓플레이스)입니다.

| 플러그인 | 종류 | 설명 |
|---|---|---|
| [neon-bubble](plugins/neon-bubble) | Mods | 네온 상태 띠 · 스피너/턴 요약 · 사용량 알림·예보 · 사이드 패널 · 묻는 가드 · flow 자동 compact · `/replay` · `/model-route` |
| [work-kit](plugins/work-kit) | Mods + 명령 | `/init` 에 업무 하네스(PRD·Card·커밋·이슈·보고 규칙, 깃랩 템플릿, 프로젝트 메모리)를 합침 · `/prd` `/tech-spec` `/card` `/daily-report` `/weekly-report` |
| [dev-kit](plugins/dev-kit) | Mods + 에이전트·스킬·명령 | 주석·플랜 규칙을 항상 적용 · 리뷰/TDD/Python·FastAPI·Postgres 에이전트 19·스킬 16 · `/mr-review` `/codemap` 등 명령 8 (graphify·glab·Context7 연동) |

셋은 따로 설치해도 되고 함께 써도 됩니다. 함께 쓰면 화면·가드는 neon-bubble, 업무 문서 흐름은 work-kit, 코드 작업은 dev-kit 이 맡습니다.

## 처음 쓰기

### 1. 준비

- Claude Code **v2.1.287 이상** (`claude --version`)
- 쓸 기능에 따라: [uv](https://docs.astral.sh/uv/)(graphify 설치용), GitLab 계정(glab)

### 2. 설치 (PC 마다 한 번)

터미널에서 `claude` 를 열고 프롬프트에 입력합니다. 필요한 플러그인만 골라도 됩니다.

```
/plugin marketplace add mhjoon99/dune-kit
/plugin install neon-bubble@dune-kit
/plugin install work-kit@dune-kit
/plugin install dev-kit@dune-kit
/reload-plugins
```

셸에서 해도 됩니다.

```bash
claude plugin marketplace add mhjoon99/dune-kit
claude plugin install neon-bubble@dune-kit
claude plugin install work-kit@dune-kit
claude plugin install dev-kit@dune-kit
```

### 3. 설치한 뒤 바로 달라지는 것

| 플러그인 | 설치만 해도 | 따로 해야 하는 것 |
|---|---|---|
| neon-bubble | 상태 띠·알림·가드가 켜진다 | 없음 |
| work-kit | `/prd` 등 문서 명령이 생긴다 | 프로젝트마다 `/init` 한 번 |
| dev-kit | 주석·플랜 규칙이 모든 세션에 적용되고, 에이전트·스킬·명령이 생긴다 | 쓸 때만: graphify·glab 설치, 프로젝트마다 `/codemap` |

### 4. 새 프로젝트에서 하는 순서

```
① /init      업무 규칙·템플릿·메모리를 프로젝트에 만든다      (work-kit)
② /codemap   코드 지도를 만들고 자동 갱신을 건다              (dev-kit, 선택)
③ 평소 작업   요청 → 플랜 → 구현 → /mr-review → MR
```

## neon-bubble 쓰기

설치하면 바로 동작합니다. 프롬프트 위 상태 띠, 사용량 알림, 위험한 git 명령을 묻는 가드, flow 단위 자동 compact 가 켜집니다.
기능과 설정은 [plugins/neon-bubble](plugins/neon-bubble) 의 README 에 있습니다.

## work-kit 쓰기

설치한 뒤 프로젝트 폴더에서 `/init` 을 치면 됩니다. 첫 질문으로 묶음 선택이 나오고, 이어서 내장 `/init` 흐름이 돕니다.
work-kit 없이 내장 흐름만 쓰려면 `/init --plain`.

`CLAUDE_CODE_NEW_INIT=1` 은 **필수가 아닙니다.** 켜면 내장 `/init` 이 질문을 주고받는 새 대화형 흐름으로 돌고, 꺼져 있으면 구버전 흐름으로 돕니다. work-kit 은 둘 다에서 같은 순서로 진행하지만, 묶음·값을 하나씩 확인하며 가려면 켜 두는 쪽을 권합니다.

```powershell
# PowerShell — 이번 터미널에서만
$env:CLAUDE_CODE_NEW_INIT = "1"; claude
```

```bash
# bash·zsh — 이번 실행에서만
CLAUDE_CODE_NEW_INIT=1 claude
```

항상 켜 두려면 `~/.claude/settings.json` 에 넣습니다.

```json
{ "env": { "CLAUDE_CODE_NEW_INIT": "1" } }
```

`/init` 뒤에는 `/prd` → `/tech-spec` → `/card` 로 문서를 만들고, `/daily-report` `/weekly-report` 로 보고를 씁니다.
자세한 순서와 업무 흐름은 [plugins/work-kit](plugins/work-kit) 의 README 에 있습니다.

## dev-kit 쓰기

설치하면 **주석 규칙**(파일 머리·함수 머리 1~5줄·줄 사이 1~2줄)과 **플랜 규칙**(새 기능이거나 고칠 파일 3개 이상이면 `docs/plans/` 에 플랜부터)이 모든 세션에 적용됩니다. 따로 켤 것이 없습니다.

**밖의 도구 (쓸 것만, PC 마다 한 번)**

| 도구 | 필요한 때 | 설치 |
|---|---|---|
| graphify | `/codemap` | `uv tool install graphifyy` → `graphify install` |
| glab | `/mr-review <MR 번호>` | `winget install GLab.GLab` → 토큰(`api`, `write_repository`) → `glab auth login --hostname <GitLab 도메인>` |
| Context7 | 라이브러리 문서 조회 | 설치할 것 없음 |

설치한 뒤에는 터미널과 Claude Code 를 새로 엽니다.

**자주 쓰는 것**

| 하고 싶은 것 | 말 또는 명령 |
|---|---|
| 코드 지도 준비(프로젝트마다 한 번) | `/codemap` |
| 플랜부터 짜기 | "이 기능 플랜 짜줘" |
| 지금 브랜치 리뷰 | `/mr-review` |
| 올라온 MR 리뷰 | `/mr-review 42` |
| Python·FastAPI 리뷰 | `/python-review` · `/fastapi-review` |
| 빌드 오류 · 테스트 · 정리 | `/build-fix` · `/test-coverage` · `/refactor-clean` |
| 주석 정리 | "이 파일 주석 정리해줘" |
| 라이브러리 최신 문서 | "FastAPI lifespan 사용법 문서에서 찾아줘" |

`/mr-review` 는 리뷰 결과를 work-kit MR 템플릿의 「🔍 코드 리뷰 결과」에 옮길 수 있는 표로 보여 줍니다. GitLab 댓글은 물어본 뒤에만 올리고, 승인·merge 는 하지 않습니다.
전체 사용법, 에이전트·스킬 목록, 도구별 설치와 주의점은 [plugins/dev-kit](plugins/dev-kit) 의 README 에 있습니다.

## 업데이트·제거

```bash
claude plugin update dev-kit@dune-kit        # 플러그인 이름만 바꿔서. 그 뒤 세션에서 /reload-plugins
claude plugin uninstall dev-kit@dune-kit
```

## 주의

Mods 는 사용자 권한으로 실행되는 코드입니다. 설치 전에 `claude plugin validate plugins/<플러그인>` 으로 무엇을 하는지 확인할 수 있습니다.

- neon-bubble: 화면 그리기, 도구 호출 가드, 자동 compact
- work-kit: `/init` 의 숨은 프롬프트에 지시문을 덧붙임
- dev-kit: 시스템 프롬프트 끝에 규칙 두 개를 덧붙임(`prompt.compose`), 플러그인 폴더의 규칙 파일 읽기(`fs.read`)

## 라이선스

MIT. dev-kit 의 에이전트·스킬·명령 대부분은 ECC(MIT)에서 가져왔고 원문 라이선스는 [plugins/dev-kit/LICENSE-ECC](plugins/dev-kit/LICENSE-ECC) 에 있습니다.
