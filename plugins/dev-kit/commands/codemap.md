---
description: 코드 지도 준비 — graphify 로 이 프로젝트의 코드 지도를 만들고 자동 갱신·조회 훅을 건다 (프로젝트마다 한 번)
argument-hint: [--docs]
---

# Codemap

**입력**: $ARGUMENTS

graphify(따로 설치하는 도구)로 `graphify-out/` 에 코드 지도를 만든다. 지도에는 **코드만** 넣는다 — 코드는 PC 안에서 tree-sitter 로 처리해 모델 토큰을 쓰지 않는다. 단계마다 무엇을 했는지 한 줄씩 알린다.

## 1. graphify 확인

```bash
graphify --help
```

없으면 설치 명령을 안내하고 **멈춘다**(직접 설치하지 않는다).

```bash
uv tool install graphifyy     # PyPI 이름은 y 가 둘
graphify install              # Claude Code 에 /graphify 스킬을 깐다
```

## 2. 지도에서 뺄 폴더

graphify 는 `.gitignore` 와 `.graphifyignore`(같은 문법)에 적힌 경로를 뺀다. 추적은 하지만 지도에 넣을 필요가 없는 폴더(벤더 코드, 생성된 코드, 큰 픽스처)가 보이면 `.graphifyignore` 에 넣을지 사용자에게 묻는다. 없으면 건너뛴다.

## 3. 지도 만들기

```bash
graphify update .
```

`graphify-out/graph.json`, `GRAPH_REPORT.md`, `graph.html` 이 생긴다. 코드 파일만 다시 읽는 명령이라 이미 지도가 있어도 같은 명령으로 갱신된다.

## 4. 자동 갱신

```bash
graphify hook install
```

커밋·브랜치 전환 뒤에 바뀐 코드 파일만 백그라운드로 다시 읽는다(모델 토큰 없음). `.git/hooks/post-commit`·`post-checkout` 과 `.gitattributes`(graph.json 병합 드라이버 한 줄)가 생긴다.

## 5. Claude 가 지도를 먼저 보게 하기

```bash
graphify claude install
```

프로젝트 `CLAUDE.md` 에 graphify 단락을, `.claude/settings.json` 에 PreToolUse 훅(검색·파일 읽기 전에 지도를 먼저 조회)을 쓴다.

훅 명령에는 **이 PC 의 graphify 실행 파일 절대경로**가 들어간다. `.claude/settings.json` 을 git 으로 추적하는 프로젝트면 이 사실을 알리고, 그 훅 블록을 `.claude/settings.local.json` 으로 옮길지 사용자에게 묻는다.

## 6. `.gitignore`

`graphify-out/` 이 `.gitignore` 에 없으면 한 줄 더한다.

## 7. `--docs` (입력에 있을 때만)

`docs/prd/` 의 문서를 지도에 더한다. 문서는 코드와 달리 **모델 토큰을 쓰고**, 문서 내용이 `graphify-out/` 에 남는다. 이 두 가지를 알리고 확인받은 뒤 `graphify` 스킬을 `docs/prd --update` 로 부른다.

끝나면 `graph.json` 에 코드 노드가 그대로 남아 있는지 확인한다(3 에서 본 노드 수보다 줄지 않았는지). 줄었으면 그대로 보고한다.

## 8. 마무리

`git status --short` 로 생기거나 바뀐 파일을 보여 주고, 지도 크기(노드·엣지 수)와 쓰는 법을 알린다.

- 질문: `graphify query "<질문>"`, `graphify path "<A>" "<B>"`, `graphify explain "<이름>"`
- 손으로 갱신: `graphify update .` (pull 뒤, 또는 커밋하지 않은 변경을 반영할 때)
- 훅 상태: `graphify hook status`

## 주의

- Windows 에서 프로젝트 경로가 아주 길면(약 130자 이상) graphify 캐시 파일이 260자 제한에 걸려 `AST extraction failed … No such file or directory` 로 실패한다. 더 짧은 경로에서 다시 한다.
- 커밋은 하지 않는다. 무엇을 커밋할지는 사용자가 정한다.
