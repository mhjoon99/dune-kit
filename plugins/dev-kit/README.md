# dev-kit

개발할 때 쓰는 규칙·에이전트·스킬·명령을 모은 Claude Code 플러그인입니다(v0.1). 주 대상은 Python · FastAPI · Docker · Postgres, GitLab 입니다.

- **항상 적용되는 규칙 2개** — 주석 규칙, 플랜 규칙. 설치하면 모든 프로젝트의 모든 세션에 들어갑니다.
- **에이전트 19, 스킬 16, 명령 8** — 대부분 [ECC](#출처와-라이선스)에서 고른 것입니다.
- **밖의 도구 3개와 연결** — graphify(코드 지도), glab(GitLab), Context7(라이브러리 문서).

## 처음 쓰기

순서대로 따라 하면 됩니다. 1~2 는 필수, 3~4 는 그 기능을 쓸 때만 합니다.

### 1. 플러그인 설치 (PC 마다 한 번)

Claude Code v2.1.287 이상이 필요합니다. `claude` 를 열고 프롬프트에 입력합니다.

```
/plugin marketplace add mhjoon99/dune-kit
/plugin install dev-kit@dune-kit
/reload-plugins
```

셸에서 해도 됩니다.

```bash
claude plugin marketplace add mhjoon99/dune-kit
claude plugin install dev-kit@dune-kit
```

### 2. 들어왔는지 확인

새 세션에서 아래를 확인합니다.

| 확인 | 방법 |
|---|---|
| 규칙 | "dev-kit 주석 규칙에서 함수 머리 주석은 몇 줄까지야?" 라고 묻는다 → `1~5줄` 이라고 답하면 정상 |
| 명령 | `/` 를 치고 `mr-review`, `codemap` 이 목록에 보이는지 |
| 에이전트 | `/agents` 에 `dev-kit:code-reviewer` 등이 보이는지 |
| Context7 | `/mcp` 에 context7 이 연결됨으로 보이는지 |

여기까지 하면 규칙·에이전트·스킬과 `/mr-review`(인자 없이)·`/python-review` 등은 바로 쓸 수 있습니다.

### 3. 밖의 도구 설치 (PC 마다 한 번, 쓸 것만)

| 도구 | 필요한 때 | 설치 |
|---|---|---|
| graphify | `/codemap` 을 쓸 때 | `uv tool install graphifyy` → `graphify install` |
| glab | `/mr-review <MR 번호>` 를 쓸 때 | `winget install GLab.GLab` → 토큰 발급 → `glab auth login --hostname <GitLab 도메인>` |
| Context7 | — | 설치할 것 없음(플러그인에 연결돼 있음) |

설치한 뒤에는 **터미널과 Claude Code 를 새로 열어야** PATH 에 잡힙니다. 자세한 것은 아래 [밖의 도구](#밖의-도구).

### 4. 프로젝트 준비 (프로젝트마다 한 번, 선택)

코드 지도를 쓰려면 프로젝트 폴더에서 한 번 칩니다.

```
/codemap
```

지도를 만들고(`graphify-out/`), 커밋할 때 자동으로 갱신되게 하고, Claude 가 파일을 뒤지기 전에 지도를 먼저 보게 합니다. 끝나면 무엇이 생기고 바뀌었는지 보여 줍니다. 커밋은 하지 않습니다.

## 평소에 쓰는 흐름

```
① 요청  →  ② 플랜  →  ③ 구현  →  ④ 리뷰  →  ⑤ MR
```

| 단계 | 하는 것 | 쓰는 것 |
|---|---|---|
| ① 요청 | 하고 싶은 일을 말한다 | — |
| ② 플랜 | 새 기능이거나 고칠 파일이 3개 이상이면 Claude 가 플랜부터 짠다. 탐색 → 질문(딥인터뷰) → 초안 → 컨펌 | 플랜 규칙, `plan-docs` 스킬, `planner`·`code-explorer` |
| ③ 구현 | 컨펌한 뒤 "착수해" 라고 따로 지시한다. 주석은 주석 규칙대로 쓴다 | `tdd-workflow`, `python-patterns` 등 스킬, `build-error-resolver`, `/build-fix` |
| ④ 리뷰 | 작업 단위로 커밋한 뒤 `/mr-review` | `code-reviewer` + 바뀐 파일에 맞는 리뷰어 |
| ⑤ MR | 리뷰 결과 표를 MR 설명의 「🔍 코드 리뷰 결과」에 옮기고 MR 을 연다 | work-kit MR 템플릿 |

한두 군데 수정이면 ②를 건너뜁니다. 플랜이 필요한지 애매하면 Claude 가 근거를 붙여 묻습니다.

### 이렇게 말하면 됩니다

| 하고 싶은 것 | 말 또는 명령 |
|---|---|
| 플랜부터 짜기 | "이 기능 플랜 짜줘" (플랜을 안 쓰려면 "플랜 없이 바로 고쳐줘") |
| 지금 브랜치 리뷰 | `/mr-review` |
| 올라온 MR 리뷰 | `/mr-review 42` |
| Python 만 리뷰 | `/python-review` · FastAPI 는 `/fastapi-review` |
| 빌드·타입 오류 고치기 | `/build-fix` |
| 테스트 채우기 | `/test-coverage` |
| 안 쓰는 코드 지우기 | `/refactor-clean` |
| 하던 일 중에 딴 질문 | `/aside <질문>` |
| 주석 정리 | "이 파일 주석 정리해줘" → `comment-analyzer` 가 줄인 안을 내고, 확인받은 뒤 고침 |
| 라이브러리 최신 문서 | "FastAPI lifespan 사용법 문서에서 찾아줘" → `docs-lookup` |
| 코드 구조 질문 | "주문 생성은 어디서 시작해?" (지도가 있으면 지도부터 봄) 또는 `graphify query "<질문>"` |
| 처음 보는 저장소 파악 | "이 저장소 파악해줘" → `codebase-onboarding` |
| 숨은 실패 찾기 | "예외를 삼키는 곳 찾아줘" → `silent-failure-hunter` |

명령 이름이 다른 플러그인과 겹치면 `/dev-kit:mr-review` 처럼 접두어를 붙입니다.

## 항상 적용되는 규칙

플러그인의 규칙 파일은 Claude 가 자동으로 읽지 않습니다. dev-kit 은 훅(`hooks/register.ts`)으로 `rules/` 의 두 파일을 시스템 프롬프트 끝에 붙입니다. `/init` 을 돌리지 않은 프로젝트에도 적용되고, 프로젝트별로 끌 수는 없습니다. 프로젝트의 `CLAUDE.md`·`.claude/rules/` 에 다른 규칙이 있으면 그쪽이 우선합니다.

### 주석 규칙 (`rules/comments.md`)

| 위치 | 길이 | 적는 것 |
|---|---|---|
| 파일 머리 | 제한 없음 | 이 파일이 무엇을 하는지, 구성 |
| 함수·클래스 머리 | 1~5줄 | 무엇을 하는지, 입력·출력, 예외 |
| 코드 줄 사이 | 1~2줄 | 코드만 봐서는 모르는 이유·함정 |

쓰지 않는 것: 날짜·결정 번호·이력·사고 경위(git 이 가짐), 통계·실험 근거, 코드 반복 설명, 다른 파일 요약(경로만).

근거: Ousterhout 『A Philosophy of Software Design』 12–13장, Stack Overflow 블로그의 주석 규칙(Ellen Spertus), Google Python Style Guide.

### 플랜 규칙 (`rules/plans.md`)

- 새 기능이거나 고칠 파일이 3개 이상이면 플랜을 씁니다. 한두 군데 수정이면 쓰지 않습니다.
- 플랜은 `docs/plans/` 아래 폴더에 쓰고 컨펌받습니다. **컨펌은 착수 지시가 아닙니다.**
- `docs/plans/` 바로 아래의 낱개 파일은 플랜이 아니라 사용자가 읽을 문서(다음 할 일·인계·정리)입니다.

### 플랜의 모양 (`plan-docs` 스킬)

```
docs/plans/{작업명}/            Card(work-kit)가 있으면 Card 경로를 그대로 따른다
  00_차수.md          차수 계획표 — 할 일 ↔ 플랜, 진행 상태, 공유 파일
  1a_….md  1b_….md    1차. 같은 숫자끼리는 동시에 진행해도 된다
  2a_….md             2차. 1차 검증이 끝나야 시작한다
  9_통합.md           공유 파일과 전체 검증
```

- 플랜 파일 맨 위 「0. 먼저 결정할 것」이 비어야 실행합니다. 문서·코드·인터뷰에 없는 값은 지어내지 않고 빈칸으로 둡니다.
- 완료는 체크박스 `[x]` + 완료 시각. 테스트 통과를 확인한 뒤에만 표시합니다.
- 모든 플랜이 끝나면 폴더째 `docs/trash/complete/plans/` 로 옮깁니다.
- 플랜이 하나뿐이면 `1a_….md` 하나만 둬도 됩니다.

## 명령

| 명령 | 하는 것 |
|---|---|
| `/mr-review` | 통합 브랜치(`stage`, 없으면 기본 브랜치)에서 갈라진 뒤의 커밋 + 커밋 전 변경분을 리뷰 |
| `/mr-review 42` | GitLab MR `!42` 를 가져와 리뷰. 물어본 뒤에만 요약 댓글 하나를 올림 |
| `/codemap` | graphify 로 코드 지도를 만들고 자동 갱신·조회 훅을 건다(프로젝트마다 한 번) |
| `/codemap --docs` | 위에 더해 `docs/prd/` 문서를 지도에 넣는다(모델 토큰 사용, 확인받고 진행) |
| `/python-review` | Python 코드 리뷰(`python-reviewer`) |
| `/fastapi-review` | FastAPI 앱 리뷰(`fastapi-reviewer`) |
| `/build-fix` | 빌드·타입 오류를 하나씩 고침 |
| `/test-coverage` | 커버리지를 재고 빠진 테스트를 채움 |
| `/refactor-clean` | 안 쓰는 코드를 검증하며 지움 |
| `/aside` | 하던 일을 끊지 않고 곁가지 질문에 답함 |

### `/mr-review` 가 하는 일

1. 변경분을 모은다 — 인자가 없으면 통합 브랜치에서 갈라진 뒤의 커밋과 커밋 전 변경분, MR 번호·URL 을 주면 그 MR.
2. 리뷰어를 고른다 — `code-reviewer` 는 항상. `.py` 가 바뀌면 `python-reviewer`, 라우터·의존성·스키마면 `fastapi-reviewer`, SQL·마이그레이션·모델이면 `database-reviewer`, 인증·입력 처리·비밀값이면 `security-reviewer`.
3. 고른 리뷰어를 동시에 돌리고, 프로젝트의 테스트·린트 명령도 돌린다.
4. 겹친 지적을 합쳐 **리뷰어별 표**(지적·반영·보류)와 지적 목록을 터미널에 보여 준다.
5. MR 모드면 "요약을 댓글로 올릴까요" 를 묻고, 승낙할 때만 댓글 하나를 올린다.

**승인(`glab mr approve`)·merge 는 하지 않습니다.** 리뷰 결과를 파일로 저장하지도 않습니다.
내장 `/code-review` 와 이름이 겹치지 않게 `/mr-review` 로 지었습니다.

## 에이전트

Claude 가 필요할 때 알아서 부릅니다. 직접 시키려면 "`code-architect` 로 설계 검토해줘" 처럼 이름을 말합니다.

| 묶음 | 에이전트 | 하는 것 |
|---|---|---|
| 설계·탐색 | `planner` | 구현 계획 분석(플랜을 짤 때 탐색용) |
| | `code-architect` | 기존 패턴에 맞춘 설계안 |
| | `code-explorer` | 기능의 실행 경로·의존 관계 추적 |
| | `spec-miner` | 코드에서 명세 뽑기(OpenSpec) |
| | `docs-lookup` | Context7 로 라이브러리 최신 문서 조회 |
| 리뷰 | `code-reviewer` | 일반 코드 리뷰 |
| | `python-reviewer` · `fastapi-reviewer` · `database-reviewer` | 언어·프레임워크·DB 별 리뷰 |
| | `security-reviewer` | 보안 취약점 |
| | `silent-failure-hunter` | 삼켜진 예외·조용한 실패 |
| | `type-design-analyzer` | 타입 설계 |
| | `pr-test-analyzer` | 변경분의 테스트가 충분한지 |
| | `performance-optimizer` | 성능 병목 |
| | `comment-analyzer` | 주석(규칙 위반·부정확·낡음) |
| 고치기 | `code-simplifier` · `refactor-cleaner` | 단순화, 안 쓰는 코드 정리 |
| | `build-error-resolver` | 빌드·타입 오류 |
| | `tdd-guide` | 테스트 먼저 쓰기 |

`planner`·`code-explorer` 는 플랜을 짤 때 **탐색용으로만** 씁니다 — 서브에이전트는 사용자에게 질문할 수 없어서, 인터뷰와 플랜 작성은 본 세션이 합니다.

## 스킬

해당하는 일을 할 때 Claude 가 알아서 읽습니다.

| 묶음 | 스킬 |
|---|---|
| Python·FastAPI | `python-patterns` `python-testing` `fastapi-patterns` |
| 인프라·DB | `docker-patterns` `postgres-patterns` `database-migrations` |
| 설계·품질 | `coding-standards` `api-design` `error-handling` `security-review` |
| 작업 방식 | `plan-docs` `tdd-workflow` `verification-loop` `search-first` `codebase-onboarding` `context-budget` |

`plan-docs` 만 dev-kit 이 새로 쓴 것이고 나머지는 ECC 원문(영어)입니다.

## 밖의 도구

### graphify — 코드 지도

코드의 함수·클래스·호출 관계를 그래프로 만들어 `graphify-out/` 에 두는 도구입니다. Claude 가 파일을 뒤지기 전에 지도를 먼저 조회해 탐색이 빨라집니다. dev-kit 은 graphify 를 품지 않고 불러 쓰기만 합니다.

**설치 (PC 마다 한 번)**

```bash
uv tool install graphifyy     # PyPI 이름은 y 가 둘
graphify install              # Claude Code 에 /graphify 스킬을 깐다
```

**프로젝트 준비 (프로젝트마다 한 번)** — `/codemap`. 하는 일:

1. `graphify update .` — 지도를 만든다(`graph.json` `GRAPH_REPORT.md` `graph.html`)
2. `graphify hook install` — 커밋·브랜치 전환 뒤 바뀐 코드만 백그라운드로 다시 읽는다
3. `graphify claude install` — 프로젝트 `CLAUDE.md` 에 단락을, `.claude/settings.json` 에 "검색·읽기 전에 지도 먼저" 훅을 쓴다
4. `graphify-out/` 을 `.gitignore` 에 넣는다

**쓰기**

| 하고 싶은 것 | 명령 |
|---|---|
| 질문 | `graphify query "<질문>"` 또는 Claude 에게 그냥 묻는다 |
| 두 지점의 연결 | `graphify path "<A>" "<B>"` |
| 한 노드 설명 | `graphify explain "<이름>"` |
| 손으로 갱신 | `graphify update .` (pull 뒤, 커밋 안 한 변경을 반영할 때) |
| 그림으로 보기 | `graphify-out/graph.html` 을 브라우저로 연다 |
| 훅 상태 | `graphify hook status` |

**알아 둘 것**

- **지도에는 코드만 넣습니다.** 코드는 PC 안에서 tree-sitter 로 처리해 모델 토큰을 쓰지 않고, 자동 갱신 훅도 코드 전용이라 토큰을 쓰지 않습니다. 문서는 넣지 않으므로 사내 문서 내용이 `graphify-out/` 에 남지 않습니다.
- `/codemap --docs` 는 `docs/prd/` 를 지도에 더합니다. 문서는 모델 토큰을 쓰고 내용이 `graphify-out/` 에 남습니다. **이 옵션은 실제 프로젝트에서 아직 돌려 보지 않았습니다.**
- 지도에서 뺄 폴더는 `.gitignore` 또는 `.graphifyignore`(같은 문법)에 적습니다.
- `graphify claude install` 이 쓰는 훅에는 이 PC 의 graphify 실행 파일 절대경로가 들어갑니다. `.claude/settings.json` 을 추적하는 저장소면 `/codemap` 이 `.claude/settings.local.json` 으로 옮길지 묻습니다.
- Windows 에서 프로젝트 경로가 아주 길면(약 130자 이상) 캐시 파일이 260자 제한에 걸려 실패합니다.
- 걷어내기: 프로젝트에서 `graphify hook uninstall` · `graphify claude uninstall`, PC 에서 `graphify uninstall` · `uv tool uninstall graphifyy`.

graphify 0.9.86 에서 확인했습니다. 문서: https://github.com/safishamsi/graphify

### glab — GitLab CLI

`/mr-review <번호>` 가 MR 을 가져오고 댓글을 올릴 때 씁니다. 인자 없는 `/mr-review` 는 glab 없이도 됩니다.

**설치 (PC 마다 한 번)**

1. `winget install GLab.GLab` (다른 OS 는 https://gitlab.com/gitlab-org/cli)
2. 터미널을 새로 연다
3. GitLab 웹 → 프로필 → Access Tokens 에서 개인 액세스 토큰 발급 — 권한 `api`, `write_repository`
4. 로그인 — **GitLab 서버마다 한 번**

   ```bash
   glab auth login --hostname <GitLab 도메인>
   glab auth status
   ```

**알아 둘 것**

- dev-kit 이 쓰는 명령은 `glab mr view` · `glab mr diff` · `glab mr checkout`(물어본 뒤) · `glab mr note create`(물어본 뒤)뿐입니다. `glab mr approve`·`merge` 는 쓰지 않습니다.
- 댓글은 **내 이름으로** 남습니다. 그래서 올리기 전에 항상 묻습니다.
- GitLab 주소와 토큰은 추적 파일에 적지 마세요.

glab 1.122.0 에서 확인했습니다.

### Context7 — 라이브러리 문서

`docs-lookup` 에이전트가 라이브러리의 최신 문서를 찾을 때 쓰는 MCP 서버입니다. 플러그인의 `.mcp.json` 에 원격 서버(`https://mcp.context7.com/mcp`)로 연결돼 있어 **따로 설치할 것이 없습니다.**

- 쓰는 법: "FastAPI 의 lifespan 사용법을 문서에서 찾아줘" 처럼 물으면 `docs-lookup` 이 불립니다.
- 키 없이도 동작합니다(호출 한도가 낮음).
- 질문에 쓴 라이브러리 이름과 질의가 Context7 서버로 전송됩니다. **사내 코드나 내부 이름을 질의에 넣지 마세요.**
- 연결 상태는 `/mcp` 에서 확인합니다.

## 업데이트·제거

```bash
claude plugin update dev-kit@dune-kit      # 그 뒤 세션에서 /reload-plugins
claude plugin uninstall dev-kit@dune-kit
```

제거하면 규칙도 더는 들어가지 않습니다. `/codemap` 이 프로젝트에 만든 것(`graphify-out/`, git 훅, `CLAUDE.md` 단락, `.claude/settings.json` 훅)은 남으므로 위 graphify 「걷어내기」로 지웁니다.

## 문제가 생기면

| 증상 | 볼 곳 |
|---|---|
| 규칙이 안 먹는다 | `/reload-plugins` 후 새 세션에서 「2. 들어왔는지 확인」의 질문을 다시 해 본다. `claude plugin validate plugins/dev-kit` |
| `glab` 을 못 찾는다 | 설치 뒤 터미널·Claude Code 를 새로 열었는지. `glab auth status` |
| `/codemap` 이 `AST extraction failed` | 프로젝트 경로가 너무 긴 경우. 짧은 경로에서 다시 |
| `docs-lookup` 이 문서를 못 가져온다 | `/mcp` 에서 context7 연결 상태. 사내망이 외부 접속을 막는지 |
| 플랜을 너무 자주/드물게 쓴다 | 그때그때 "플랜 없이", "플랜부터" 라고 말한다. 기준 자체는 `rules/plans.md` |

## 개발

```bash
claude plugin validate plugins/dev-kit
claude plugin test plugins/dev-kit
```

로컬 폴더를 마켓플레이스로 설치했다면 고친 뒤 `/reload-plugins` 로 반영합니다.

## 출처와 라이선스

에이전트·스킬·명령의 대부분은 **ECC(Everything Claude Code)** 2.2.1 포크(geoji-skills)에서 고른 것입니다. ECC 는 MIT 라이선스이고 원문 라이선스는 [`LICENSE-ECC`](LICENSE-ECC) 에 있습니다. 스킬 frontmatter 의 `origin: ECC` 표기는 그대로 두었습니다.

원문에서 바꾼 것:

- 끊긴 참조만 고쳤습니다 — 가져오지 않은 명령(`/plan` `/verify`)·스크립트(`setup-package-manager.js`)·경로(`.claude/tdd/` 등), `docker-patterns` 의 ECC 전용 설치 하네스 절.
- `/code-review` → `/mr-review` (GitHub `gh` → GitLab `glab`, 박힌 체크리스트 대신 에이전트 호출)
- `comment-analyzer` (주석 규칙 반영), `docs-lookup` 의 도구 이름(플러그인 접두어), `code-explorer`·`codebase-onboarding` 에 코드 지도 단락

가져오지 않은 것: 자율 루프·오케스트레이션, ECC 훅(가드는 neon-bubble 이 맡음), `/plan`·PRP 흐름, git·GitHub 워크플로.

dev-kit 이 새로 쓴 부분은 MIT 입니다.
