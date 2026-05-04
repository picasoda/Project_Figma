# GridFrame
격자 기반 레이아웃 스케치 → AI 세그멘테이션 맵 + 프롬프트 자동 생성 웹 툴

## Tech
Pure HTML/CSS/JS, Canvas API, no frameworks
Files: index.html, style.css, app.js

## 작업 흐름
1. docs/todo.md를 읽고 ← 현재 표시된 단계를 확인
2. "MD 파일 수정 대기" 섹션이 있으면 사용자에게 보고만 하고 절대 직접 수정하지 않기
3. 해당 단계의 미완료 항목 [ ] 구현
4. 완료 시 [x]로 체크, 모든 항목 완료 시 ← 현재를 다음 단계로 이동
5. 단계 완료 시 사용자에게 "/clear로 세션을 초기화하세요"라고 안내할 것
6. 기존 기능을 절대 깨뜨리지 않기

## Code Rules
- English identifiers, Korean comments
- DOM 접근은 id 사용
- 변수·함수명은 camelCase
- 한 함수는 한 가지 역할만

## 수정 권한
- docs/todo.md: 체크 [x] 및 ← 현재 이동만 허용
- CLAUDE.md: "MD 변경 필요사항" 섹션에 항목 추가만 허용, 그 외 수정 금지
- .claude/rules/*.md, docs/features.md: 절대 수정 금지

## MD 변경 필요사항 (사용자 확인 전용)
> **자동 기록 규칙**: 작업 중에 참조한 MD 파일의
> 내용이 현재 구현과 맞지 않거나, 누락·추가·수정이 필요하다고
> 판단되면 이 섹션에 항목을 추가합니다.
> 단, 항목을 적는 것만 허용되며 해당 MD 파일을 직접 수정하는 것은 금지합니다.

(현재 없음)