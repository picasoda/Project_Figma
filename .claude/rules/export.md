---
paths:
  - "app.js"
---

# Export 규칙

## 출력물 2종
1. 프리뷰 PNG: 테두리 + 색상 + 객체 이름 (격자선·범례 없음)
2. 프롬프트 텍스트: 자동 생성, 편집 가능, 클립보드 복사

## 3×3 영역 매핑
- 캔버스를 가로·세로 3등분 (각 33.3%)
- 가로: left(0-33%), center(34-66%), right(67-100%)
- 세로: top(0-33%), middle(34-66%), bottom(67-100%)
- 객체 중심점 좌표로 영역 판정

## 다중 영역 처리
- 객체가 가로 전체 → "entire-width"
- 객체가 세로 전체 → "entire-height"
- 두 영역 걸침 → "top-left to top-right" 식으로 결합

## 프롬프트 형식
[color name] | [position] | [description]
예: "Red | top-left | 파란 하늘 헤더와 흰 구름"

