---
paths:
  - "app.js"
---

# 저장·불러오기 규칙

## 파일 형식
- 확장자: .gridframe.json
- 파일명: [프로젝트명].gridframe.json

## JSON 구조
{
  "projectName": "",
  "preset": "desktop|tablet|mobile|custom",
  "resolution": { "w": 1920, "h": 1080 },
  "gridSize": { "cols": 32, "rows": 18 },
  "gridMultiplier": 1.0,
  "background": { "color": "#CCCCCC", "description": "" },
  "objects": [
    {
      "id": "",
      "label": "",
      "description": "",
      "color": "#FF0000",
      "startCol": 0, "startRow": 0,
      "endCol": 3, "endRow": 2,
      "compositeRects": [               // 복합 객체일 때만 존재 (선택 필드)
        { "startCol": 0, "startRow": 0, "endCol": 3, "endRow": 0 },
        { "startCol": 0, "startRow": 2, "endCol": 3, "endRow": 2 }
      ]
    }
  ],
  "objectOrder": ["id1", "id2"],
  "folders": [
    { "id": "folder_...", "name": "폴더 이름", "objectIds": ["id1", "id2"] }
  ]
}

## 저장
- Ctrl+S 또는 툴바 버튼 → JSON 파일 다운로드
- localStorage 주기적 자동 저장

## 불러오기
- 툴바 버튼 → 파일 선택기 (.gridframe.json만)
- 브라우저에 드래그앤드롭
- 기존 프로젝트 있으면 덮어쓰기 확인 팝업

## 복원
- 브라우저 재접속 시 localStorage에 자동 저장 데이터가 있으면 복원 확인 팝업
