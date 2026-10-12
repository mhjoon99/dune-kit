---
description: 깃랩 MR·이슈 템플릿을 고칠 때 지킬 것
paths:
  - ".gitlab/**"
---

# 깃랩 MR·이슈 템플릿 — `.gitlab/`

깃랩이 이 경로만 자동으로 읽는다. 채워 쓰는 쪽 지침은 템플릿 안 주석에 두고, 여기에는 **템플릿을 고칠 때** 지킬 것만 둔다.

| 파일 | 쓰는 곳 | 자동 라벨 |
|---|---|---|
| `issue_templates/Bug.md` | type Issue — 버그·오동작 | `/label ~bug` |
| `issue_templates/Incident.md` | type Incident — 장애 | `/label ~incident` |
| `merge_request_templates/Default.md` | MR | 없음 — 이슈에서 MR 을 만들면 이슈 라벨이 따라온다 |

- **작업용 이슈 템플릿은 두지 않는다.** 해야 할 작업은 Card 다(`issues.md` §2)
- **마지막 줄의 퀵 액션(`/label`·`/assign me`)을 지우지 않는다.** 라벨 자동 선택이 이것뿐이다.
  라벨은 깃랩 프로젝트에 미리 있어야 붙는다 — 없으면 조용히 무시된다
- MR 의 「✅ 확인」은 `CLAUDE.md` 실행·검증 절의 **사본**이다. 팀원이 MR 에서 볼 수 있는 자리라서 둔다 —
  **한쪽을 고치면 다른 쪽도 고친다**
- **MR 은 코드 리뷰를 마친 뒤에만 연다.** 「🔍 코드 리뷰 결과」를 비워 둔 채 열지 않는다
- 본문에 `docs/card/`·`docs/reports/` 같은 **미추적 문서를 링크하지 않는다**(리뷰어가 못 연다).
  링크해도 되는 것은 이슈·MR 번호와 **git 추적 문서**뿐이다 — 링크하기 전에 `git ls-files {경로}` 로 추적 여부를 확인한다
- 여기는 추적 파일이다. 사내 IP·계정·경로·직함을 예시로도 쓰지 않는다
