---
paths:
  - "style.css"
  - "index.html"
---

# UI 스타일 규칙

## 색상 테마
- 배경: #1a1a2e (body), #16213e (툴바·하단바), #12122a (캔버스 영역)
- 버튼 기본: #2a2a4a, hover: #3a3a6a, active: #4a4a8a
- 테두리: #444 기본, #666 hover, #88f active/focus
- 텍스트: #e0e0e0 기본, #ccc 보조, #888 라벨, #555 비활성
- 강조: #88f (파란 포인트), #f66 (에러)

## 폰트
- 기본: 'Segoe UI', -apple-system, sans-serif
- 모달 제목: 18px bold
- 버튼: 13px
- 라벨: 12px
- 캔버스 정보: 11px

## 레이아웃
- 툴바: 상단 고정, 높이 48px, flex, gap 8px
- 캔버스: flex:1, overflow hidden
- 속성 패널: 우측 사이드, 기본 숨김, 객체 선택 시 표시
- 객체 목록: 우측, 스크롤 가능
- 모달: 중앙 정렬, 최소 440px 너비, 반투명 배경

## 컴포넌트
- 버튼: border-radius 6px, padding 6px 14px, transition 0.15s
- 입력: border-radius 6px, padding 10px 12px, focus 시 #88f 테두리
- 모달: border-radius 12px, padding 28px, box-shadow
- 플로팅 메시지: 상단 중앙, border-radius 10px
