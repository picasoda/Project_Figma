# 복합 객체 (Composite Objects) 설계

## 개요

격자 캔버스에서 단일 직사각형으로 표현할 수 없는 형태(속이 빈 사각형, ㄴ자형 등)를 만들기 위해 두 가지 연동 기능을 추가한다.

1. **병합**: 여러 객체를 하나의 복합 객체로 합치기
2. **도려내기**: 드래그 선택 영역을 객체에서 제거하기

두 기능 모두 동일한 `compositeRects` 데이터 모델을 사용한다.

---

## 데이터 모델

기존 객체 구조를 유지하고 복합 객체에만 필드를 추가한다.

```json
{
  "id": "obj_xxx",
  "label": "프레임",
  "description": "...",
  "color": "#FF0000",
  "startCol": 0, "startRow": 0, "endCol": 20, "endRow": 19,
  "compositeRects": [
    { "startCol": 0,  "startRow": 0,  "endCol": 20, "endRow": 1  },
    { "startCol": 0,  "startRow": 18, "endCol": 20, "endRow": 19 },
    { "startCol": 0,  "startRow": 0,  "endCol": 1,  "endRow": 19 },
    { "startCol": 19, "startRow": 0,  "endCol": 20, "endRow": 19 }
  ]
}
```

- `compositeRects` 없음 → 단순 객체 (기존과 동일)
- `compositeRects` 있음 → 복합 객체
- `startCol/startRow/endCol/endRow`는 compositeRects 전체의 바운딩 박스 (이동·크기 참조용)

### 복합 객체 바운딩 박스 계산

```
startCol = min(rects[].startCol)
startRow = min(rects[].startRow)
endCol   = max(rects[].endCol)
endRow   = max(rects[].endRow)
```

---

## 기능 1: 병합

### UX 흐름

1. Shift+클릭으로 2개 이상 객체 다중 선택
2. M키 또는 속성 패널 "병합" 버튼 클릭
3. 마지막으로 선택한 객체의 label·description·color 상속
4. 각 객체의 rect → compositeRects 배열로 통합
5. 기존 객체들 제거, 새 복합 객체 생성
6. Undo 대상 (히스토리에 병합 전 상태 저장)

### 병합 차단 조건

- 선택된 객체가 1개 이하이면 병합 불가

### 속성 패널 변경

- 다중 선택 시 기존 "일괄 삭제" 옆에 "병합" 버튼 추가

### 단축키 패널

- M: 선택 객체 병합 (다중 선택 상태에서만 동작)

---

## 기능 2: 도려내기

### UX 흐름

1. 드래그로 영역 선택 → 빨간 하이라이트 표시 (기존 UX 동일)
2. D키 입력
3. 선택 영역과 겹치는 모든 객체에서 해당 셀 범위 제거
4. 제거 후 남은 영역 → compositeRects로 재계산
5. 남은 영역이 없으면 → 객체 전체 삭제
6. Undo 대상

### 겹침 제거 알고리즘 (단순 rect 기준)

기존 단순 rect 객체에 도려내기 적용 시, 남은 영역을 최대 4개의 rect로 분해:

```
원본 객체:    startCol=sc, startRow=sr, endCol=ec, endRow=er
도려내기 영역: startCol=dsc, startRow=dsr, endCol=dec, endRow=der

위쪽:   (sc,    sr,    ec,    dsr-1) — if dsr > sr
아래쪽: (sc,    der+1, ec,    er)    — if der < er
왼쪽:   (sc,    dsr,   dsc-1, der)   — if dsc > sc
오른쪽: (dec+1, dsr,   ec,    der)   — if dec < ec
```

네 strip이 모서리에서 겹치지 않음: 위/아래가 전체 너비, 좌/우는 도려내기 행 범위만 담당.

compositeRects가 이미 있는 객체는 각 rect에 위 알고리즘 적용.

### 도려내기 차단 조건

- 드래그 선택 영역이 객체와 전혀 겹치지 않으면 무동작
- R키(객체 생성)와 동일한 선택 상태에서 D키로 도려내기 가능

### 단축키 패널

- D: 드래그 선택 영역 도려내기

---

## 렌더링 변경

복합 객체는 `compositeRects`의 각 rect를 순서대로 렌더링:

```javascript
function renderObject(obj) {
  const rects = obj.compositeRects || [{
    startCol: obj.startCol, startRow: obj.startRow,
    endCol: obj.endCol, endRow: obj.endRow
  }];
  rects.forEach(r => drawRect(r, obj.color));
}
```

텍스트 레이블은 바운딩 박스 중심에 1개만 표시.

---

## 겹침 체크 변경

복합 객체의 겹침 체크는 compositeRects 각각에 대해 수행:

```javascript
function objectOverlaps(obj, sc, sr, ec, er) {
  const rects = obj.compositeRects || [obj];
  return rects.some(r =>
    sc <= r.endCol && ec >= r.startCol &&
    sr <= r.endRow && er >= r.startRow
  );
}
```

---

## 이동·크기조절

- 이동: delta(col, row)를 compositeRects 모든 rect에 동일하게 적용
- 크기조절: 복합 객체는 크기조절 불가 (핸들 미표시) — 어느 rect를 조절할지 특정 불가하므로, 대신 도려내기/병합으로 형태 수정
- 바운딩 박스는 이동 후 자동 재계산

---

## 저장·불러오기

`compositeRects` 필드를 JSON 구조에 추가. 없으면 기존 단순 객체로 처리하므로 하위 호환성 유지.

---

## 프롬프트 생성 (Export)

복합 객체의 위치 계산은 바운딩 박스 중심점 사용 (기존 로직과 동일).
