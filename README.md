# dune-kit

Claude Code 를 내 방식대로 꾸미는 플러그인 모음(마켓플레이스)입니다.

| 플러그인 | 종류 | 설명 |
|---|---|---|
| [neon-bubble](plugins/neon-bubble) | Mods | 네온 상태 띠 · 스피너/턴 요약 · 사용량 알림·예보 · 사이드 패널 · 묻는 가드 · flow 자동 compact · `/replay` · `/model-route` |
| [work-kit](plugins/work-kit) | Mods + 명령 | `/init` 에 업무 하네스(PRD·Card·커밋·이슈·보고 규칙, 깃랩 템플릿, 프로젝트 메모리)를 합침 · `/prd` `/tech-spec` `/card` `/daily-report` `/weekly-report` |

> dev-kit(개발 스킬 선별본)은 준비 중입니다.

## 설치

Claude Code v2.1.287 이상이 필요합니다. 터미널에서 `claude` 를 열고 프롬프트에 입력하세요.

```
/plugin marketplace add mhjoon99/dune-kit
/plugin install neon-bubble@dune-kit
/plugin install work-kit@dune-kit
```

셸에서 해도 됩니다.

```
claude plugin marketplace add mhjoon99/dune-kit
claude plugin install neon-bubble@dune-kit
claude plugin install work-kit@dune-kit
```

업데이트는 `claude plugin update neon-bubble@dune-kit` 후 세션에서 `/reload-plugins`.

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

자세한 순서와 업무 흐름은 [plugins/work-kit](plugins/work-kit) 의 README 에 있습니다.

## 주의

Mods 는 사용자 권한으로 실행되는 코드입니다. 설치 전에 `claude plugin validate plugins/neon-bubble` 로 무엇을 하는지 확인할 수 있습니다.

## 라이선스

MIT
