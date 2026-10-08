# dune-kit

Claude Code 를 내 방식대로 꾸미는 플러그인 모음(마켓플레이스)입니다.

| 플러그인 | 종류 | 설명 |
|---|---|---|
| [neon-bubble](plugins/neon-bubble) | Mods | 네온 상태 띠 · 스피너/턴 요약 · 사용량 알림·예보 · 사이드 패널 · 묻는 가드 · flow 자동 compact · `/replay` · `/model-route` |

> work-kit(업무 하네스 `/init`), dev-kit(개발 스킬 선별본)은 준비 중입니다.

## 설치

Claude Code v2.1.287 이상이 필요합니다. 터미널에서 `claude` 를 열고 프롬프트에 입력하세요.

```
/plugin marketplace add mhjoon99/dune-kit
/plugin install neon-bubble@dune-kit
```

셸에서 해도 됩니다.

```
claude plugin marketplace add mhjoon99/dune-kit
claude plugin install neon-bubble@dune-kit
```

업데이트는 `claude plugin update neon-bubble@dune-kit` 후 세션에서 `/reload-plugins`.

## 주의

Mods 는 사용자 권한으로 실행되는 코드입니다. 설치 전에 `claude plugin validate plugins/neon-bubble` 로 무엇을 하는지 확인할 수 있습니다.

## 라이선스

MIT
