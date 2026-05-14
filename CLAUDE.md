# GridFrame
격자 기반 레이아웃 스케치 → 프리뷰 + 프롬프트 자동 생성 웹 툴

## Tech
Pure HTML/CSS/JS, Canvas API, no frameworks
Files: src/index.html, src/style.css, src/app.js

## 작업 흐름
1. docs/todo.md를 읽고 ← 현재 표시된 단계를 확인
2. 해당 단계의 미완료 항목 [ ] 구현
3. 완료 시 [x]로 체크, 모든 항목 완료 시 ← 현재를 다음 단계로 이동
4. 코드 수정 시 → 관련 .claude/rules/*.md 자동 업데이트 (신규 동작·규칙 반영)
5. 기능 추가·변경 시 → docs/features.md 해당 섹션 자동 업데이트
6. 파일 분리 기준 충족 시 → 분리 내용 1회 보고 후 실행, Tech>Files 갱신
7. 기존 기능을 절대 깨뜨리지 않기
8. 단계 완료 시 사용자에게 "/clear로 세션을 초기화하세요"라고 안내할 것

## Code Rules
- 식별자 영어, 주석 한국어, 변수·함수 camelCase
- DOM 접근은 id, 한 함수 한 가지 역할

## 파일 분리 기준
- js: 500줄 초과 또는 독립 모듈화 가능할 때
- css: 영역이 명확히 구분될 때 (줄 수 무관)
- html: 별개 페이지가 생길 때만
- rules: 독립 기능 도메인이고 기존 파일과 주제가 다를 때
- 분리·추가 후 Tech > Files 업데이트 필수

## 수정 권한
- docs/todo.md: 체크 [x] 및 ← 현재 이동만 허용
- CLAUDE.md: 수정 금지 (Tech는 수정 가능)
