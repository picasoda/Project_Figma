
  // ===== 팔레트 =====
  const PALETTE = [
    '#FF0000', '#0000FF', '#00CC00', '#FFFF00',
    '#8800FF', '#FF8800', '#00FFFF', '#FF00FF',
    '#884400', '#FF88AA', '#88FF00', '#0088FF',
    '#AA00AA', '#00AA44', '#FFAA00', '#4444FF'
  ];

  // ===== 프리셋 데이터 =====
  const PRESETS = {
    desktop: { w: 1920, h: 3000, cols: 48, rows: 75 },
    tablet:  { w: 768,  h: 2800, cols: 24, rows: 88 },
    mobile:  { w: 390,  h: 2532, cols: 18, rows: 117 }
  };

  // ===== 상태 =====
  let currentPreset  = 'desktop';
  let scale          = 1.0;
  let projectCreated = false;
  let baseCanvasW    = 0;   // 줌=1 기준 캔버스 CSS 너비
  let baseCanvasH    = 0;
  let currentConfig  = null;
  let objects        = [];        // 생성된 객체 목록
  let usedColors     = new Set(); // 사용 중인 팔레트 색상
  let dragState      = null;      // { startCol, startRow, endCol, endRow }
  let isDragging     = false;     // 마우스 버튼 누름 상태
  let selectedObject = null;      // 현재 선택된 객체
  let moveState      = null;      // 이동 드래그 상태
  let resizeState    = null;      // 크기 조절 드래그 상태
  let multiSelection = new Set(); // 다중 선택 객체 ID
  let history        = [];        // Undo 히스토리
  const MAX_HISTORY  = 50;

  let viewZoom  = 1.0;   // 뷰 줌 레벨 (0.1 ~ 10.0)
  let viewPanX  = 0;     // 캔버스 팬 X (px)
  let viewPanY  = 0;     // 캔버스 팬 Y (px)
  let showGrid  = true;  // 격자선 표시 여부
  let panDrag   = null;  // 휠클릭 드래그 { startX, startY, startPanX, startPanY }

  // ===== DOM =====
  const createModal        = document.getElementById('create-modal');
  const floatingMsg        = document.getElementById('floating-msg');
  const emptyMsg           = document.getElementById('empty-msg');
  const barEmptyMsg        = document.getElementById('bar-empty-msg');
  const inputProjectName   = document.getElementById('input-project-name');
  const createError        = document.getElementById('create-error');
  const scaleValue         = document.getElementById('scale-value');
  const gridColsInput      = document.getElementById('grid-cols-input');
  const gridRowsInput      = document.getElementById('grid-rows-input');
  const resolutionDisplay  = document.getElementById('resolution-display');
  const customInputs       = document.getElementById('custom-inputs');
  const presetHeightRow    = document.getElementById('preset-height-row');
  const presetHeightInput  = document.getElementById('preset-height-input');
  const presetWidthLabel   = document.getElementById('preset-width-label');
  const displayProjectName = document.getElementById('display-project-name');
  const gridCanvas         = document.getElementById('grid-canvas');
  const ctx                = gridCanvas.getContext('2d');
  const propertyPanel      = document.getElementById('property-panel');
  const panelLabelInput    = document.getElementById('panel-label');
  const panelDescInput     = document.getElementById('panel-description');
  const panelPaletteEl     = document.getElementById('panel-palette');
  const panelSingleContent = document.getElementById('panel-single-content');
  const panelMultiInfo     = document.getElementById('panel-multi-info');
  const panelMultiCount    = document.getElementById('panel-multi-count');

  // 프로젝트 생성 후 활성화할 버튼들
  const projectButtons = [
    document.getElementById('btn-obj-create'),
    document.getElementById('btn-fit'),
    document.getElementById('btn-grid-toggle'),
    document.getElementById('btn-save'),
    document.getElementById('btn-export')
  ];

  // ===== 유틸 =====
  function applyCanvasTransform() {
    // 줌은 캔버스 해상도로 처리 → CSS transform은 팬(translate)만 담당
    gridCanvas.style.transform =
      `translate(calc(-50% + ${viewPanX}px), calc(-50% + ${viewPanY}px))`;
    document.getElementById('display-zoom').textContent =
      Math.round(viewZoom * 100) + '%';
  }

  // 줌·DPR을 반영해 캔버스 픽셀 크기를 갱신 (CSS 크기 = 뷰 크기, 픽셀 크기 = CSS×DPR)
  function applyCanvasSize() {
    const dpr  = window.devicePixelRatio || 1;
    const cssW = Math.round(baseCanvasW * viewZoom);
    const cssH = Math.round(baseCanvasH * viewZoom);
    gridCanvas.width        = Math.round(cssW * dpr);
    gridCanvas.height       = Math.round(cssH * dpr);
    gridCanvas.style.width  = cssW + 'px';
    gridCanvas.style.height = cssH + 'px';
  }

  function generateId() {
    return 'obj_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
  }

  // 복합 객체는 compositeRects, 단순 객체는 바운딩박스 rect 1개 반환
  function getObjectRects(obj) {
    return obj.compositeRects || [{ startCol: obj.startCol, startRow: obj.startRow, endCol: obj.endCol, endRow: obj.endRow }];
  }

  // 미사용 색상 우선, 모두 사용 시 순환 재사용
  function nextAvailableColor() {
    return PALETTE.find(c => !usedColors.has(c)) || PALETTE[objects.length % PALETTE.length];
  }

  // 드래그 선택 영역 정규화 (역방향 드래그 대응)
  function getSelectionRect(ds, cfg) {
    return {
      sc: Math.max(0, Math.min(ds.startCol, ds.endCol)),
      ec: Math.min(cfg.cols - 1, Math.max(ds.startCol, ds.endCol)),
      sr: Math.max(0, Math.min(ds.startRow, ds.endRow)),
      er: Math.min(cfg.rows - 1, Math.max(ds.startRow, ds.endRow))
    };
  }

  // 겹침 체크 (compositeRects 대응)
  function overlapsAnyObject(sc, sr, ec, er) {
    return objects.some(obj =>
      getObjectRects(obj).some(r =>
        sc <= r.endCol && ec >= r.startCol && sr <= r.endRow && er >= r.startRow
      )
    );
  }

  // 마우스 좌표 → 셀 좌표
  function getCellFromMouse(e, cfg) {
    const rect = gridCanvas.getBoundingClientRect();
    const col = Math.floor((e.clientX - rect.left) / rect.width  * cfg.cols);
    const row = Math.floor((e.clientY - rect.top)  / rect.height * cfg.rows);
    return {
      col: Math.max(0, Math.min(cfg.cols - 1, col)),
      row: Math.max(0, Math.min(cfg.rows - 1, row))
    };
  }

  // 해당 셀에 있는 객체 반환 (위에 그려진 객체 우선, compositeRects 대응)
  function objectAtCell(col, row) {
    for (let i = objects.length - 1; i >= 0; i--) {
      const obj = objects[i];
      if (getObjectRects(obj).some(r =>
        col >= r.startCol && col <= r.endCol && row >= r.startRow && row <= r.endRow
      )) return obj;
    }
    return null;
  }

  // 특정 객체를 제외한 겹침 체크 (이동·크기조절용, compositeRects 대응)
  function overlapsOtherObjects(sc, sr, ec, er, excludeId) {
    return objects.some(obj =>
      obj.id !== excludeId &&
      getObjectRects(obj).some(r =>
        sc <= r.endCol && ec >= r.startCol && sr <= r.endRow && er >= r.startRow
      )
    );
  }

  // 선택된 객체 가장자리 감지 → edge 문자열 반환 (n/s/e/w/nw/ne/sw/se/null), 복합 객체는 불가
  function getEdgeAtMouse(e, obj, cfg) {
    if (obj.compositeRects) return null;
    const rect  = gridCanvas.getBoundingClientRect();
    const cellW = rect.width  / cfg.cols;
    const cellH = rect.height / cfg.rows;
    const mx    = e.clientX - rect.left;
    const my    = e.clientY - rect.top;
    const left   = obj.startCol * cellW;
    const right  = (obj.endCol + 1) * cellW;
    const top    = obj.startRow * cellH;
    const bottom = (obj.endRow + 1) * cellH;
    const th = Math.min(6, cellW * 0.3, cellH * 0.3); // 감지 임계값
    const onL = mx >= left   && mx <= left   + th;
    const onR = mx <= right  && mx >= right  - th;
    const onT = my >= top    && my <= top    + th;
    const onB = my <= bottom && my >= bottom - th;
    if (onT && onL) return 'nw';
    if (onT && onR) return 'ne';
    if (onB && onL) return 'sw';
    if (onB && onR) return 'se';
    if (onT) return 'n';
    if (onB) return 's';
    if (onL) return 'w';
    if (onR) return 'e';
    return null;
  }

  const EDGE_CURSORS = { n:'n-resize', s:'s-resize', e:'e-resize', w:'w-resize',
                         nw:'nw-resize', ne:'ne-resize', sw:'sw-resize', se:'se-resize' };

  // edge + delta → 새 경계 계산 (최소 1×1 보장)
  function computeResizeBounds(rs, dc, dr, cfg) {
    let { origStartCol:sc, origStartRow:sr, origEndCol:ec, origEndRow:er } = rs;
    if (rs.edge.includes('n')) sr = Math.max(0,          Math.min(er, rs.origStartRow + dr));
    if (rs.edge.includes('s')) er = Math.max(sr,         Math.min(cfg.rows - 1, rs.origEndRow + dr));
    if (rs.edge.includes('w')) sc = Math.max(0,          Math.min(ec, rs.origStartCol + dc));
    if (rs.edge.includes('e')) ec = Math.max(sc,         Math.min(cfg.cols - 1, rs.origEndCol + dc));
    return { sc, sr, ec, er };
  }

  // ===== 히스토리 (Undo) =====

  function pushHistory() {
    history.push({
      objects: objects.map(o => ({
        ...o,
        compositeRects: o.compositeRects ? o.compositeRects.map(r => ({ ...r })) : undefined
      })),
      usedColors: new Set(usedColors)
    });
    if (history.length > MAX_HISTORY) history.shift();
  }

  function undo() {
    if (!history.length || !projectCreated) return;
    const snap = history.pop();
    objects    = snap.objects;
    usedColors = snap.usedColors;
    selectedObject = null;
    moveState      = null;
    resizeState    = null;
    multiSelection.clear();
    propertyPanel.classList.add('hidden');
    panelMultiInfo.classList.add('hidden');
    panelSingleContent.classList.remove('hidden');
    renderCanvas(currentConfig);
    updateObjectBar();
    updateObjectList();
  }

  // ===== 다중 선택 =====

  function toggleMultiSelect(obj) {
    if (selectedObject && selectedObject !== obj) {
      multiSelection.add(selectedObject.id);
      selectedObject = null;
    }
    if (multiSelection.has(obj.id)) multiSelection.delete(obj.id);
    else multiSelection.add(obj.id);

    if (multiSelection.size > 0) {
      panelMultiCount.textContent = `${multiSelection.size}개 선택됨`;
      panelSingleContent.classList.add('hidden');
      panelMultiInfo.classList.remove('hidden');
      propertyPanel.classList.remove('hidden');
    } else {
      panelMultiInfo.classList.add('hidden');
      panelSingleContent.classList.remove('hidden');
      propertyPanel.classList.add('hidden');
    }
    renderCanvas(currentConfig);
  }

  function clearMultiSelection() {
    if (multiSelection.size === 0) return;
    multiSelection.clear();
    panelMultiInfo.classList.add('hidden');
    panelSingleContent.classList.remove('hidden');
  }

  // 다중 선택 객체들을 하나의 복합 객체로 병합
  function mergeSelectedObjects() {
    if (multiSelection.size < 2) return;
    pushHistory();

    const ids = [...multiSelection];
    const selectedObjs = objects.filter(o => multiSelection.has(o.id));
    const baseObj = selectedObjs.find(o => o.id === ids[ids.length - 1]) || selectedObjs[selectedObjs.length - 1];

    const compositeRects = selectedObjs.flatMap(o => getObjectRects(o));
    const sc = Math.min(...compositeRects.map(r => r.startCol));
    const sr = Math.min(...compositeRects.map(r => r.startRow));
    const ec = Math.max(...compositeRects.map(r => r.endCol));
    const er = Math.max(...compositeRects.map(r => r.endRow));

    selectedObjs.forEach(o => { if (o.id !== baseObj.id) usedColors.delete(o.color); });
    objects = objects.filter(o => !multiSelection.has(o.id));

    objects.push({
      id: generateId(),
      label: baseObj.label,
      description: baseObj.description,
      color: baseObj.color,
      startCol: sc, startRow: sr, endCol: ec, endRow: er,
      compositeRects
    });

    multiSelection.clear();
    panelMultiInfo.classList.add('hidden');
    panelSingleContent.classList.remove('hidden');
    propertyPanel.classList.add('hidden');
    renderCanvas(currentConfig);
    updateObjectBar();
    updateObjectList();
  }

  function deleteMultiSelection() {
    if (multiSelection.size === 0) return;
    pushHistory();
    objects = objects.filter(o => {
      if (multiSelection.has(o.id)) { usedColors.delete(o.color); return false; }
      return true;
    });
    multiSelection.clear();
    panelMultiInfo.classList.add('hidden');
    panelSingleContent.classList.remove('hidden');
    propertyPanel.classList.add('hidden');
    renderCanvas(currentConfig);
    updateObjectBar();
    updateObjectList();
  }

  // ===== 객체 선택·패널 =====

  // 객체 선택: 하이라이트 + 패널 열기
  function selectObject(obj) {
    selectedObject = obj;
    dragState      = null;
    isDragging     = false;
    clearMultiSelection();
    renderCanvas(currentConfig);
    openPropertyPanel(obj);
    updateObjectList();
  }

  // 선택 해제: 하이라이트 제거 + 패널 닫기
  function deselectObject() {
    selectedObject = null;
    moveState      = null;
    resizeState    = null;
    clearMultiSelection();
    propertyPanel.classList.add('hidden');
    renderCanvas(currentConfig);
    updateObjectList();
  }

  // 속성 패널 열기 (필드 채우기)
  function openPropertyPanel(obj) {
    panelLabelInput.value    = obj.label;
    panelDescInput.value     = obj.description;
    panelLabelInput.disabled = false;
    panelMultiInfo.classList.add('hidden');
    panelSingleContent.classList.remove('hidden');
    renderPaletteSwatches(obj);
    propertyPanel.classList.remove('hidden');
  }

  // 팔레트 스와치 렌더링
  function renderPaletteSwatches(obj) {
    panelPaletteEl.innerHTML = '';
    PALETTE.forEach(color => {
      const swatch = document.createElement('div');
      swatch.className = 'palette-swatch';
      swatch.style.backgroundColor = color;
      if (color === obj.color) swatch.classList.add('selected');
      swatch.addEventListener('click', () => {
        if (!selectedObject) return;
        const old = selectedObject.color;
        selectedObject.color = color;
        usedColors.delete(old);
        usedColors.add(color);
        renderCanvas(currentConfig);
        renderPaletteSwatches(selectedObject);
      });
      panelPaletteEl.appendChild(swatch);
    });
  }

  // 선택 객체 삭제 (색상 반환)
  function deleteSelectedObject() {
    if (!selectedObject) return;
    pushHistory();
    usedColors.delete(selectedObject.color);
    objects = objects.filter(o => o.id !== selectedObject.id);
    selectedObject = null;
    propertyPanel.classList.add('hidden');
    renderCanvas(currentConfig);
    updateObjectBar();
    updateObjectList();
  }

  // 캔버스 내 객체 이름 텍스트 렌더링 (자동 축소 → 말줄임, DPR 보정)
  function drawObjectLabel(text, x, y, w, h) {
    if (!text || w < 10 || h < 10) return;
    const dpr  = window.devicePixelRatio || 1;
    const maxW = w - 8 * dpr;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    // 화면 기준 14→12→10→8px, 캔버스 픽셀 = CSS px × DPR
    let fs = 14 * dpr;
    for (let base = 14; base >= 8; base -= 2) {
      fs = base * dpr;
      ctx.font = `bold ${fs}px Segoe UI, sans-serif`;
      if (ctx.measureText(text).width <= maxW) break;
    }
    ctx.font = `bold ${fs}px Segoe UI, sans-serif`;
    if (h < fs + 4 * dpr) return;
    // 말줄임
    let display = text;
    if (ctx.measureText(text).width > maxW) {
      display = '';
      for (const ch of [...text]) {
        if (ctx.measureText(display + ch + '…').width > maxW) break;
        display += ch;
      }
      display += '…';
    }
    ctx.fillStyle   = 'rgba(0,0,0,0.9)';
    ctx.shadowColor = 'rgba(255,255,255,0.9)';
    ctx.shadowBlur  = 3 * dpr;
    ctx.fillText(display, x + w / 2, y + h / 2);
    ctx.shadowBlur  = 0;
  }

  // ===== 캔버스 크기 설정 (리사이즈·초기화 시) =====
  function resizeCanvas(cfg) {
    const canvasArea = document.getElementById('canvas-area');
    const areaW = canvasArea.clientWidth;
    const areaH = canvasArea.clientHeight;
    const ratio  = cfg.w / cfg.h;
    if (areaW / areaH > ratio) {
      baseCanvasH = Math.floor(areaH * 0.85);
      baseCanvasW = Math.floor(baseCanvasH * ratio);
    } else {
      baseCanvasW = Math.floor(areaW * 0.85);
      baseCanvasH = Math.floor(baseCanvasW / ratio);
    }
    applyCanvasSize();
  }

  // 복합 객체의 외곽 경계선만 그리기 (인접 rect 사이 내부 선 제거, cx 미지정 시 메인 ctx 사용)
  function drawCompositeBorder(rects, cellW, cellH, cx) {
    cx = cx || ctx;
    const covered = new Set();
    rects.forEach(r => {
      for (let c = r.startCol; c <= r.endCol; c++) {
        for (let row = r.startRow; row <= r.endRow; row++) {
          covered.add(c * 10000 + row);
        }
      }
    });
    cx.beginPath();
    rects.forEach(r => {
      for (let c = r.startCol; c <= r.endCol; c++) {
        for (let row = r.startRow; row <= r.endRow; row++) {
          const x0 = c * cellW, y0 = row * cellH;
          if (!covered.has(c * 10000 + (row - 1)))  { cx.moveTo(x0, y0);         cx.lineTo(x0 + cellW, y0); }
          if (!covered.has(c * 10000 + (row + 1)))  { cx.moveTo(x0, y0 + cellH); cx.lineTo(x0 + cellW, y0 + cellH); }
          if (!covered.has((c - 1) * 10000 + row))  { cx.moveTo(x0, y0);         cx.lineTo(x0, y0 + cellH); }
          if (!covered.has((c + 1) * 10000 + row))  { cx.moveTo(x0 + cellW, y0); cx.lineTo(x0 + cellW, y0 + cellH); }
        }
      }
    });
    cx.stroke();
  }

  // ===== 캔버스 전체 렌더링 =====
  function renderCanvas(cfg) {
    const canvasW = gridCanvas.width;
    const canvasH = gridCanvas.height;
    const cellW   = canvasW / cfg.cols;
    const cellH   = canvasH / cfg.rows;
    const dpr     = window.devicePixelRatio || 1;  // HiDPI + 줌 보정
    const lw2     = 2 * dpr;              // 화면 2px 테두리
    const lw1     = 1 * dpr;              // 화면 1px 격자선
    const dash6   = [6 * dpr, 3 * dpr];
    const dash5   = [5 * dpr, 4 * dpr];

    // 배경
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvasW, canvasH);

    // 이동·크기조절 중인 객체 ID (해당 객체는 별도 프리뷰로 렌더링)
    const activeId = moveState ? moveState.obj.id : (resizeState ? resizeState.obj.id : null);

    // 일반 객체 렌더링 (활성 객체 제외, compositeRects 대응)
    objects.forEach(obj => {
      if (obj.id === activeId) return;
      // fill: 각 rect 개별 채우기
      ctx.globalAlpha = 0.55;
      ctx.fillStyle   = obj.color;
      getObjectRects(obj).forEach(r => {
        ctx.fillRect(r.startCol * cellW, r.startRow * cellH,
          (r.endCol - r.startCol + 1) * cellW, (r.endRow - r.startRow + 1) * cellH);
      });
      ctx.globalAlpha = 1;
      // border: 복합 객체는 외곽선만, 단순 객체는 strokeRect
      ctx.strokeStyle = obj.color;
      ctx.lineWidth   = lw2;
      ctx.setLineDash([]);
      if (obj.compositeRects) {
        drawCompositeBorder(obj.compositeRects, cellW, cellH);
      } else {
        const x = obj.startCol * cellW, y = obj.startRow * cellH;
        const w = (obj.endCol - obj.startCol + 1) * cellW, h = (obj.endRow - obj.startRow + 1) * cellH;
        ctx.strokeRect(x + lw1, y + lw1, w - lw2, h - lw2);
      }
    });

    // 다중 선택 하이라이트 (청록색 점선, 복합 객체는 외곽선만)
    if (multiSelection.size > 0) {
      objects.forEach(obj => {
        if (!multiSelection.has(obj.id)) return;
        ctx.strokeStyle = '#00ffff';
        ctx.lineWidth   = lw2;
        ctx.setLineDash(dash5);
        if (obj.compositeRects) {
          drawCompositeBorder(obj.compositeRects, cellW, cellH);
        } else {
          const x = obj.startCol * cellW, y = obj.startRow * cellH;
          const w = (obj.endCol - obj.startCol + 1) * cellW, h = (obj.endRow - obj.startRow + 1) * cellH;
          ctx.strokeRect(x + lw1, y + lw1, w - lw2, h - lw2);
        }
        ctx.setLineDash([]);
      });
    }

    // 단일 선택 하이라이트 (흰 점선, 복합 객체는 외곽선만)
    if (selectedObject && !moveState && !resizeState) {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth   = lw2;
      ctx.setLineDash(dash6);
      if (selectedObject.compositeRects) {
        drawCompositeBorder(selectedObject.compositeRects, cellW, cellH);
      } else {
        const sx = selectedObject.startCol * cellW, sy = selectedObject.startRow * cellH;
        const sw = (selectedObject.endCol - selectedObject.startCol + 1) * cellW;
        const sh = (selectedObject.endRow - selectedObject.startRow + 1) * cellH;
        ctx.strokeRect(sx + lw1, sy + lw1, sw - lw2, sh - lw2);
      }
      ctx.setLineDash([]);
    }

    // 이동 프리뷰 (compositeRects 대응: 각 rect 개별 렌더링)
    if (moveState) {
      const { previewStartCol:psc, previewStartRow:psr, valid, obj } = moveState;
      const dc = psc - moveState.origStartCol;
      const dr = psr - moveState.origStartRow;
      const drawRects = moveState.origCompositeRects
        ? moveState.origCompositeRects.map(r => ({
            startCol: r.startCol + dc, startRow: r.startRow + dr,
            endCol:   r.endCol   + dc, endRow:   r.endRow   + dr
          }))
        : [{ startCol: psc, startRow: psr, endCol: moveState.previewEndCol, endRow: moveState.previewEndRow }];
      drawRects.forEach(r => {
        const x = r.startCol * cellW, y = r.startRow * cellH;
        const w = (r.endCol - r.startCol + 1) * cellW, h = (r.endRow - r.startRow + 1) * cellH;
        ctx.globalAlpha = valid ? 0.7 : 0.4;
        ctx.fillStyle   = valid ? obj.color : '#ff3333';
        ctx.fillRect(x, y, w, h);
        ctx.globalAlpha = 1;
        ctx.strokeStyle = valid ? '#ffffff' : '#ff5555';
        ctx.lineWidth   = lw2;
        ctx.setLineDash(dash6);
        ctx.strokeRect(x + lw1, y + lw1, w - lw2, h - lw2);
        ctx.setLineDash([]);
      });
    }

    // 크기 조절 프리뷰
    if (resizeState) {
      const { previewStartCol:psc, previewStartRow:psr,
              previewEndCol:pec,   previewEndRow:per, valid, obj } = resizeState;
      const x = psc * cellW, y = psr * cellH;
      const w = (pec - psc + 1) * cellW, h = (per - psr + 1) * cellH;
      ctx.globalAlpha = valid ? 0.7 : 0.4;
      ctx.fillStyle   = valid ? obj.color : '#ff3333';
      ctx.fillRect(x, y, w, h);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = valid ? '#ffffff' : '#ff5555';
      ctx.lineWidth   = lw2;
      ctx.setLineDash(dash6);
      ctx.strokeRect(x + lw1, y + lw1, w - lw2, h - lw2);
      ctx.setLineDash([]);
    }

    // 드래그 선택 하이라이트 (새 객체 생성용)
    if (dragState) {
      const sel      = getSelectionRect(dragState, cfg);
      const x        = sel.sc * cellW;
      const y        = sel.sr * cellH;
      const w        = (sel.ec - sel.sc + 1) * cellW;
      const h        = (sel.er - sel.sr + 1) * cellH;
      const overlaps = overlapsAnyObject(sel.sc, sel.sr, sel.ec, sel.er);
      ctx.globalAlpha = 0.35;
      ctx.fillStyle   = overlaps ? '#ff3333' : '#88aaff';
      ctx.fillRect(x, y, w, h);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = overlaps ? '#ff5555' : '#aaccff';
      ctx.lineWidth   = lw2;
      ctx.setLineDash([]);
      ctx.strokeRect(x + lw1, y + lw1, w - lw2, h - lw2);
    }

    // 격자선 (G키 토글, 굵기 줌 자동 보정)
    if (showGrid) {
      ctx.strokeStyle = '#e0e0e0';
      ctx.lineWidth   = lw1;
      ctx.setLineDash([]);
      for (let i = 0; i <= cfg.cols; i++) {
        const x = Math.floor(i * cellW) + 0.5;
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvasH); ctx.stroke();
      }
      for (let j = 0; j <= cfg.rows; j++) {
        const y = Math.floor(j * cellH) + 0.5;
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvasW, y); ctx.stroke();
      }
    }

    // 객체 이름 텍스트 (격자선 위에 표시, 복합 객체는 가장 큰 rect 중심에 표시)
    objects.forEach(obj => {
      if (obj.id === activeId || !obj.label) return;
      const lr = obj.compositeRects
        ? obj.compositeRects.reduce((best, r) => {
            const a = (r.endCol - r.startCol + 1) * (r.endRow - r.startRow + 1);
            const ba = (best.endCol - best.startCol + 1) * (best.endRow - best.startRow + 1);
            return a > ba ? r : best;
          })
        : obj;
      drawObjectLabel(obj.label, lr.startCol * cellW, lr.startRow * cellH,
        (lr.endCol - lr.startCol + 1) * cellW, (lr.endRow - lr.startRow + 1) * cellH);
    });
    if (moveState && moveState.obj.label) {
      const { previewStartCol:psc, previewStartRow:psr,
              previewEndCol:pec, previewEndRow:per, obj } = moveState;
      drawObjectLabel(obj.label, psc*cellW, psr*cellH, (pec-psc+1)*cellW, (per-psr+1)*cellH);
    }
    if (resizeState && resizeState.obj.label) {
      const { previewStartCol:psc, previewStartRow:psr,
              previewEndCol:pec, previewEndRow:per, obj } = resizeState;
      drawObjectLabel(obj.label, psc*cellW, psr*cellH, (pec-psc+1)*cellW, (per-psr+1)*cellH);
    }

    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.font      = `${11 * dpr}px Segoe UI, sans-serif`;
    ctx.fillText(`${cfg.cols}×${cfg.rows}  |  ${cfg.w}×${cfg.h}`, 8 * dpr, 16 * dpr);
  }

  // ===== 프로젝트 초기화 =====
  function initProject(name, cfg) {
    projectCreated = true;
    currentConfig  = cfg;
    objects        = [];
    usedColors     = new Set();
    dragState      = null;
    isDragging     = false;
    selectedObject = null;
    moveState      = null;
    resizeState    = null;
    multiSelection.clear();
    history        = [];
    propertyPanel.classList.add('hidden');
    panelMultiInfo.classList.add('hidden');
    panelSingleContent.classList.remove('hidden');

    displayProjectName.value = name;
    enableProjectButtons();
    emptyMsg.classList.add('hidden');
    gridCanvas.classList.add('visible');
    updateObjectBar();
    updateObjectList();

    viewZoom = 1.0;
    viewPanX = 0;
    viewPanY = 0;
    showGrid = true;
    applyCanvasTransform();
    resizeCanvas(cfg);
    renderCanvas(cfg);
  }

  // ===== 하단 바 업데이트 =====
  function updateObjectBar() {
    const count = objects.length;
    barEmptyMsg.textContent = count === 0 ? '객체 없음' : `객체 ${count}개`;
  }

  // ===== 객체 목록 패널 업데이트 =====
  function updateObjectList() {
    const listEl    = document.getElementById('object-list');
    const listPanel = document.getElementById('object-list-panel');
    if (!projectCreated) { listPanel.classList.add('hidden'); return; }
    listPanel.classList.remove('hidden');
    listEl.innerHTML = '';

    objects.forEach(obj => {
      const item = document.createElement('div');
      item.className = 'obj-list-item';
      item.dataset.id = obj.id;
      if (selectedObject && selectedObject.id === obj.id) item.classList.add('selected');
      else if (multiSelection.has(obj.id))                item.classList.add('selected');

      const dot = document.createElement('div');
      dot.className = 'obj-list-dot';
      dot.style.backgroundColor = obj.color;

      const name = document.createElement('span');
      name.className = 'obj-list-name';
      name.textContent = obj.label || '(이름 없음)';

      item.appendChild(dot);
      item.appendChild(name);

      // 클릭 → 선택
      item.addEventListener('click', () => selectObject(obj));

      // 드래그 정렬
      item.draggable = true;
      item.addEventListener('dragstart', e => {
        e.dataTransfer.setData('text/plain', obj.id);
        item.classList.add('dragging');
      });
      item.addEventListener('dragend', () => {
        item.classList.remove('dragging');
        listEl.querySelectorAll('.obj-list-item').forEach(el => el.classList.remove('drag-over'));
      });
      item.addEventListener('dragover', e => {
        e.preventDefault();
        listEl.querySelectorAll('.obj-list-item').forEach(el => el.classList.remove('drag-over'));
        item.classList.add('drag-over');
      });
      item.addEventListener('drop', e => {
        e.preventDefault();
        const draggedId = e.dataTransfer.getData('text/plain');
        if (draggedId === obj.id) return;
        const fromIdx = objects.findIndex(o => o.id === draggedId);
        const toIdx   = objects.findIndex(o => o.id === obj.id);
        if (fromIdx === -1 || toIdx === -1) return;
        const [moved] = objects.splice(fromIdx, 1);
        objects.splice(toIdx, 0, moved);
        renderCanvas(currentConfig);
        updateObjectList();
      });

      listEl.appendChild(item);
    });
  }

  // ===== 객체 생성 =====
  function createObjectFromSelection() {
    if (!dragState || !projectCreated) return;
    const sel = getSelectionRect(dragState, currentConfig);

    // 겹침 차단
    if (overlapsAnyObject(sel.sc, sel.sr, sel.ec, sel.er)) return;

    pushHistory();
    const color = nextAvailableColor();

    const obj = {
      id:          generateId(),
      label:       `객체 ${objects.length + 1}`,
      description: '',
      color,
      startCol:    sel.sc,
      startRow:    sel.sr,
      endCol:      sel.ec,
      endRow:      sel.er
    };

    objects.push(obj);
    usedColors.add(color);
    dragState  = null;
    isDragging = false;

    renderCanvas(currentConfig);
    updateObjectBar();
    updateObjectList();
  }

  // 드래그 선택 영역을 겹치는 객체에서 도려내기
  function carveOutRegion() {
    if (!dragState || !projectCreated) return;
    const { sc: dsc, sr: dsr, ec: dec, er: der } = getSelectionRect(dragState, currentConfig);

    const affected = objects.filter(obj =>
      getObjectRects(obj).some(r =>
        dsc <= r.endCol && dec >= r.startCol && dsr <= r.endRow && der >= r.startRow
      )
    );
    if (affected.length === 0) return;

    pushHistory();

    affected.forEach(obj => {
      const remaining = [];
      getObjectRects(obj).forEach(r => {
        // 겹치지 않는 rect는 그대로 유지
        if (dsc > r.endCol || dec < r.startCol || dsr > r.endRow || der < r.startRow) {
          remaining.push(r); return;
        }
        // 교집합 영역 계산
        const isc = Math.max(dsc, r.startCol);
        const isr = Math.max(dsr, r.startRow);
        const iec = Math.min(dec, r.endCol);
        const ier = Math.min(der, r.endRow);
        // 남은 4방향 strip
        if (isr > r.startRow) remaining.push({ startCol: r.startCol, startRow: r.startRow, endCol: r.endCol, endRow: isr - 1 });
        if (ier < r.endRow)   remaining.push({ startCol: r.startCol, startRow: ier + 1,    endCol: r.endCol, endRow: r.endRow });
        if (isc > r.startCol) remaining.push({ startCol: r.startCol, startRow: isr,        endCol: isc - 1,  endRow: ier });
        if (iec < r.endCol)   remaining.push({ startCol: iec + 1,    startRow: isr,        endCol: r.endCol, endRow: ier });
      });

      if (remaining.length === 0) {
        usedColors.delete(obj.color);
        objects = objects.filter(o => o.id !== obj.id);
      } else if (remaining.length === 1 && !obj.compositeRects) {
        obj.startCol = remaining[0].startCol; obj.startRow = remaining[0].startRow;
        obj.endCol   = remaining[0].endCol;   obj.endRow   = remaining[0].endRow;
      } else {
        obj.compositeRects = remaining;
        obj.startCol = Math.min(...remaining.map(r => r.startCol));
        obj.startRow = Math.min(...remaining.map(r => r.startRow));
        obj.endCol   = Math.max(...remaining.map(r => r.endCol));
        obj.endRow   = Math.max(...remaining.map(r => r.endRow));
      }
    });

    dragState  = null;
    isDragging = false;
    renderCanvas(currentConfig);
    updateObjectBar();
    updateObjectList();
  }

  // ===== 모달 열기/닫기 =====
  function openCreateModal() {
    createModal.classList.remove('hidden');
    inputProjectName.value = '';
    createError.classList.remove('show');
    inputProjectName.classList.remove('error');
    scale         = 1.0;
    currentPreset = 'desktop';
    customInputs.classList.remove('show');
    presetHeightRow.classList.remove('hidden');
    presetHeightInput.value = PRESETS['desktop'].h;
    document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
    document.querySelector('[data-preset="desktop"]').classList.add('active');
    updateDisplay();
    setTimeout(() => inputProjectName.focus(), 100);
  }

  function closeCreateModal() {
    createModal.classList.add('hidden');
  }

  // ===== 툴바 버튼 활성화 =====
  function enableProjectButtons() {
    projectButtons.forEach(btn => btn.disabled = false);
    displayProjectName.disabled = false;
  }

  // ===== 설정값 계산 =====
  function getCurrentConfig() {
    const cols = Math.max(2, parseInt(gridColsInput.value) || 2);
    const rows = Math.max(2, parseInt(gridRowsInput.value) || 2);
    if (currentPreset === 'custom') {
      return {
        w:    parseInt(document.getElementById('custom-width').value)  || 1920,
        h:    parseInt(document.getElementById('custom-height').value) || 1080,
        cols,
        rows
      };
    }
    const p = PRESETS[currentPreset];
    const h = Math.max(100, parseInt(presetHeightInput.value) || p.h);
    return { w: p.w, h, cols, rows };
  }

  function updateDisplay() {
    scaleValue.textContent = `×${scale.toFixed(1)}`;
    if (currentPreset !== 'custom') {
      const p = PRESETS[currentPreset];
      const newCols = Math.round(p.cols * scale);
      const newRows = Math.round(p.rows * scale);
      gridColsInput.value = newCols;
      gridRowsInput.value = newRows;
      gridColsInput.dataset.prev = newCols;
      gridRowsInput.dataset.prev = newRows;
      presetWidthLabel.textContent = p.w;
    }
    const cfg = getCurrentConfig();
    resolutionDisplay.textContent = `${cfg.w} × ${cfg.h}`;
  }

  // ===== 이벤트 핸들러 =====

  // canvas-area 휠 동작 전부 차단 + Ctrl+휠 줌 처리
  document.getElementById('canvas-area').addEventListener('wheel', (e) => {
    e.preventDefault();
    if (!projectCreated || !e.ctrlKey) return;
    const factor = e.deltaY < 0 ? 1.1 : 0.9;
    viewZoom = Math.max(0.1, Math.min(10.0, viewZoom * factor));
    applyCanvasTransform();
    applyCanvasSize();
    renderCanvas(currentConfig);
  }, { passive: false });

  // document 레벨 Ctrl+휠 브라우저 줌 전역 차단
  document.addEventListener('wheel', (e) => {
    if (e.ctrlKey) e.preventDefault();
  }, { passive: false });

  // 새파일 버튼
  document.getElementById('btn-toolbar-new').addEventListener('click', () => {
    if (projectCreated) {
      floatingMsg.classList.add('visible');
    } else {
      openCreateModal();
    }
  });

  // 플로팅 메시지
  document.getElementById('btn-float-save').addEventListener('click', () => {
    floatingMsg.classList.remove('visible');
    saveProject();
    projectCreated = false;
    openCreateModal();
  });
  document.getElementById('btn-float-discard').addEventListener('click', () => {
    floatingMsg.classList.remove('visible');
    projectCreated = false;
    openCreateModal();
  });
  document.getElementById('btn-float-cancel').addEventListener('click', () => {
    floatingMsg.classList.remove('visible');
  });

  // 프리셋 선택
  document.querySelectorAll('.preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentPreset = btn.dataset.preset;
      const isCustom = currentPreset === 'custom';
      customInputs.classList.toggle('show', isCustom);
      presetHeightRow.classList.toggle('hidden', isCustom);
      if (isCustom) {
        gridColsInput.value = gridColsInput.dataset.prev = 48;
        gridRowsInput.value = gridRowsInput.dataset.prev = 27;
      } else {
        presetHeightInput.value = PRESETS[currentPreset].h;
      }
      scale = 1.0;
      updateDisplay();
    });
  });

  // 배율 조절
  document.getElementById('btn-scale-up').addEventListener('click', () => {
    if (scale < 3.0) { scale = Math.round((scale + 0.1) * 10) / 10; updateDisplay(); }
  });
  document.getElementById('btn-scale-down').addEventListener('click', () => {
    if (scale > 0.5) { scale = Math.round((scale - 0.1) * 10) / 10; updateDisplay(); }
  });

  // Custom 실시간 (해상도)
  ['custom-width', 'custom-height'].forEach(id => {
    document.getElementById(id).addEventListener('input', updateDisplay);
  });

  // 프리셋 세로 높이 입력
  presetHeightInput.addEventListener('input', updateDisplay);
  presetHeightInput.addEventListener('blur', () => {
    const val = parseInt(presetHeightInput.value);
    if (!presetHeightInput.value.trim() || isNaN(val) || val < 100) {
      presetHeightInput.value = PRESETS[currentPreset]?.h || 1080;
      updateDisplay();
    }
  });

  // 격자 수 직접 입력: blur 시 빈값이면 이전값 복구
  [gridColsInput, gridRowsInput].forEach(el => {
    el.addEventListener('blur', () => {
      const val = parseInt(el.value);
      if (!el.value.trim() || isNaN(val) || val < 2 || val > 200) {
        el.value = el.dataset.prev || el.value;
      } else {
        el.dataset.prev = val;
        el.value = val;
      }
    });
    el.addEventListener('focus', () => {
      el.dataset.prev = el.value;
    });
  });

  // 에러 초기화
  inputProjectName.addEventListener('input', () => {
    createError.classList.remove('show');
    inputProjectName.classList.remove('error');
  });

  // 취소
  document.getElementById('btn-create-cancel').addEventListener('click', closeCreateModal);

  // 만들기 확정
  document.getElementById('btn-create-confirm').addEventListener('click', () => {
    const name = inputProjectName.value.trim();
    if (!name) {
      createError.textContent = '프로젝트 이름을 입력해주세요.';
      createError.classList.add('show');
      inputProjectName.classList.add('error');
      return;
    }
    if (/[\\/:*?"<>|]/.test(name)) {
      createError.textContent = '사용할 수 없는 문자가 포함되어 있습니다. (\\ / : * ? " < > |)';
      createError.classList.add('show');
      inputProjectName.classList.add('error');
      return;
    }
    const cfg = getCurrentConfig();
    if (cfg.cols < 2 || cfg.rows < 2) {
      createError.textContent = '격자는 최소 2열 × 2행이어야 합니다.';
      createError.classList.add('show');
      return;
    }
    closeCreateModal();
    initProject(name, cfg);
  });

  // canvas-area 레벨에서 휠클릭 팬 시작 (캔버스 내외 모두 동작)
  document.getElementById('canvas-area').addEventListener('mousedown', (e) => {
    if (e.button === 1) {
      e.preventDefault();
      panDrag = { startX: e.clientX, startY: e.clientY,
                  startPanX: viewPanX, startPanY: viewPanY };
      document.getElementById('canvas-area').style.cursor = 'move';
    }
  });

  // 캔버스: 클릭 처리 (선택·이동·크기조절·다중선택·드래그)
  gridCanvas.addEventListener('mousedown', (e) => {
    if (!projectCreated || e.button !== 0) return;
    const { col, row } = getCellFromMouse(e, currentConfig);
    const clicked = objectAtCell(col, row);

    // Shift+클릭: 다중 선택 토글
    if (e.shiftKey) {
      if (clicked) toggleMultiSelect(clicked);
      return;
    }

    if (clicked) {
      clearMultiSelection();
      if (clicked !== selectedObject) selectObject(clicked);
      // 가장자리 → 크기 조절 시작
      const edge = getEdgeAtMouse(e, clicked, currentConfig);
      if (edge) {
        resizeState = {
          obj: clicked, edge,
          origStartCol: clicked.startCol, origStartRow: clicked.startRow,
          origEndCol:   clicked.endCol,   origEndRow:   clicked.endRow,
          startMouseCol: col, startMouseRow: row,
          previewStartCol: clicked.startCol, previewStartRow: clicked.startRow,
          previewEndCol:   clicked.endCol,   previewEndRow:   clicked.endRow,
          valid: true
        };
      } else {
        // 내부 → 이동 시작
        moveState = {
          obj: clicked,
          origStartCol: clicked.startCol, origStartRow: clicked.startRow,
          origEndCol:   clicked.endCol,   origEndRow:   clicked.endRow,
          origCompositeRects: clicked.compositeRects ? clicked.compositeRects.map(r => ({ ...r })) : null,
          startMouseCol: col, startMouseRow: row,
          previewStartCol: clicked.startCol, previewStartRow: clicked.startRow,
          previewEndCol:   clicked.endCol,   previewEndRow:   clicked.endRow,
          valid: true
        };
      }
      return;
    }

    // 빈 셀 클릭 → 선택 해제 + 드래그 시작
    if (selectedObject) deselectObject();
    clearMultiSelection();
    isDragging = true;
    dragState  = { startCol: col, startRow: row, endCol: col, endRow: row };
    renderCanvas(currentConfig);
  });

  // 캔버스: 마우스 이동 (이동·크기조절·커서·드래그)
  gridCanvas.addEventListener('mousemove', (e) => {
    if (!projectCreated || !currentConfig) return;
    const { col, row } = getCellFromMouse(e, currentConfig);

    // 이동 상태 업데이트
    if (moveState) {
      const dc = col - moveState.startMouseCol;
      const dr = row - moveState.startMouseRow;
      const clampedDC = Math.max(-moveState.origStartCol,
                          Math.min(currentConfig.cols - 1 - moveState.origEndCol, dc));
      const clampedDR = Math.max(-moveState.origStartRow,
                          Math.min(currentConfig.rows - 1 - moveState.origEndRow, dr));
      moveState.previewStartCol = moveState.origStartCol + clampedDC;
      moveState.previewStartRow = moveState.origStartRow + clampedDR;
      moveState.previewEndCol   = moveState.origEndCol   + clampedDC;
      moveState.previewEndRow   = moveState.origEndRow   + clampedDR;
      if (moveState.origCompositeRects) {
        // 복합 객체: 각 rect가 다른 객체와 겹치지 않는지 확인
        moveState.valid = !moveState.origCompositeRects.some(r =>
          overlapsOtherObjects(r.startCol + clampedDC, r.startRow + clampedDR,
                               r.endCol   + clampedDC, r.endRow   + clampedDR, moveState.obj.id)
        );
      } else {
        moveState.valid = !overlapsOtherObjects(
          moveState.previewStartCol, moveState.previewStartRow,
          moveState.previewEndCol,   moveState.previewEndRow,
          moveState.obj.id
        );
      }
      gridCanvas.style.cursor = 'grabbing';
      renderCanvas(currentConfig);
      return;
    }

    // 크기 조절 상태 업데이트
    if (resizeState) {
      const dc = col - resizeState.startMouseCol;
      const dr = row - resizeState.startMouseRow;
      const { sc, sr, ec, er } = computeResizeBounds(resizeState, dc, dr, currentConfig);
      resizeState.previewStartCol = sc; resizeState.previewStartRow = sr;
      resizeState.previewEndCol   = ec; resizeState.previewEndRow   = er;
      resizeState.valid = !overlapsOtherObjects(sc, sr, ec, er, resizeState.obj.id);
      gridCanvas.style.cursor = EDGE_CURSORS[resizeState.edge];
      renderCanvas(currentConfig);
      return;
    }

    // 커서 스타일 (hover)
    const hovered = objectAtCell(col, row);
    if (selectedObject && hovered === selectedObject) {
      const edge = getEdgeAtMouse(e, selectedObject, currentConfig);
      gridCanvas.style.cursor = edge ? EDGE_CURSORS[edge] : 'grab';
    } else {
      gridCanvas.style.cursor = hovered ? 'pointer' : 'crosshair';
    }

    // 드래그 선택 업데이트 (새 객체 생성)
    if (isDragging && dragState) {
      dragState.endCol = col;
      dragState.endRow = row;
      renderCanvas(currentConfig);
    }
  });

  // 팬 드래그 업데이트 (캔버스 밖으로 나가도 동작하도록 window 레벨)
  window.addEventListener('mousemove', (e) => {
    if (!panDrag) return;
    viewPanX = panDrag.startPanX + (e.clientX - panDrag.startX);
    viewPanY = panDrag.startPanY + (e.clientY - panDrag.startY);
    applyCanvasTransform();
  });

  // 마우스 업: 이동·크기조절 확정 또는 취소
  window.addEventListener('mouseup', (e) => {
    // 휠클릭 팬 종료
    if (e.button === 1 && panDrag) {
      panDrag = null;
      document.getElementById('canvas-area').style.cursor = '';
      return;
    }
    isDragging = false;

    if (moveState && projectCreated) {
      const { previewStartCol:psc, previewStartRow:psr, valid } = moveState;
      const changed = psc !== moveState.origStartCol || psr !== moveState.origStartRow;
      if (changed && valid) {
        pushHistory();
        const dc = moveState.previewStartCol - moveState.origStartCol;
        const dr = moveState.previewStartRow - moveState.origStartRow;
        moveState.obj.startCol = moveState.previewStartCol;
        moveState.obj.startRow = moveState.previewStartRow;
        moveState.obj.endCol   = moveState.previewEndCol;
        moveState.obj.endRow   = moveState.previewEndRow;
        if (moveState.origCompositeRects) {
          moveState.obj.compositeRects = moveState.origCompositeRects.map(r => ({
            startCol: r.startCol + dc, startRow: r.startRow + dr,
            endCol:   r.endCol   + dc, endRow:   r.endRow   + dr
          }));
        }
      }
      moveState = null;
      renderCanvas(currentConfig);
    }

    if (resizeState && projectCreated) {
      const { previewStartCol:psc, previewStartRow:psr,
              previewEndCol:pec,   previewEndRow:per, valid } = resizeState;
      const changed = psc !== resizeState.origStartCol || psr !== resizeState.origStartRow ||
                      pec !== resizeState.origEndCol   || per !== resizeState.origEndRow;
      if (changed && valid) {
        pushHistory();
        resizeState.obj.startCol = psc; resizeState.obj.startRow = psr;
        resizeState.obj.endCol   = pec; resizeState.obj.endRow   = per;
      }
      resizeState = null;
      renderCanvas(currentConfig);
    }
  });

  // 객체 생성 버튼
  document.getElementById('btn-obj-create').addEventListener('click', () => {
    createObjectFromSelection();
  });

  // 키보드
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.matches('input, textarea')) return;

    // R → 객체 생성
    if (e.key === 'r' && !e.target.matches('input, textarea') && projectCreated) createObjectFromSelection();

    // D → 도려내기
    if (e.key === 'd' && !e.target.matches('input, textarea') && projectCreated && dragState) carveOutRegion();

    // M → 병합
    if (e.key === 'm' && !e.target.matches('input, textarea') && projectCreated) mergeSelectedObjects();

    // Escape → 취소 순서대로
    if (e.key === 'Escape') {
      if (!document.getElementById('export-modal').classList.contains('hidden')) {
        closeExportModal(); return;
      }
      if (moveState)    { moveState = null;   renderCanvas(currentConfig); }
      else if (resizeState) { resizeState = null; renderCanvas(currentConfig); }
      else if (dragState) {
        dragState  = null; isDragging = false; renderCanvas(currentConfig);
      } else if (selectedObject) {
        deselectObject();
      } else if (multiSelection.size > 0) {
        clearMultiSelection();
        propertyPanel.classList.add('hidden');
      }
    }

    // Delete → 선택 객체 삭제
    if (e.key === 'Delete' && !e.target.matches('input, textarea') && projectCreated) {
      if (multiSelection.size > 0) deleteMultiSelection();
      else if (selectedObject)     deleteSelectedObject();
    }

    // Ctrl+Z → Undo
    if ((e.ctrlKey || e.metaKey) && e.key === 'z' && projectCreated) {
      e.preventDefault();
      undo();
    }

    // Ctrl+S → 저장
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      saveProject();
    }

    // G → 격자선 토글
    if ((e.key === 'g' || e.key === 'G') && !e.ctrlKey &&
        !e.target.matches('input, textarea') && projectCreated) {
      showGrid = !showGrid;
      renderCanvas(currentConfig);
      document.getElementById('btn-grid-toggle').classList.toggle('active', showGrid);
    }
  });

  // 속성 패널: 다중 선택 일괄 삭제
  document.getElementById('panel-btn-multi-delete').addEventListener('click', () => {
    deleteMultiSelection();
  });

  // 속성 패널: 다중 선택 병합
  document.getElementById('panel-btn-multi-merge').addEventListener('click', () => {
    mergeSelectedObjects();
  });

  // 속성 패널: 이름 변경
  panelLabelInput.addEventListener('input', () => {
    if (selectedObject) {
      selectedObject.label = panelLabelInput.value;
      renderCanvas(currentConfig);
      updateObjectList();
    }
  });

  // 속성 패널: 설명 변경
  panelDescInput.addEventListener('input', () => {
    if (selectedObject) selectedObject.description = panelDescInput.value;
  });

  // 속성 패널: 삭제
  document.getElementById('panel-btn-delete').addEventListener('click', () => {
    deleteSelectedObject();
  });

  // 맞추기 버튼 → 줌·팬 리셋
  document.getElementById('btn-fit').addEventListener('click', () => {
    if (!projectCreated) return;
    viewZoom = 1.0;
    viewPanX = 0;
    viewPanY = 0;
    applyCanvasTransform();
    applyCanvasSize();
    renderCanvas(currentConfig);
  });

  // 격자선 토글 버튼
  document.getElementById('btn-grid-toggle').addEventListener('click', () => {
    if (!projectCreated) return;
    showGrid = !showGrid;
    renderCanvas(currentConfig);
    document.getElementById('btn-grid-toggle').classList.toggle('active', showGrid);
  });

  // 단축키 패널
  const shortcutsPanel  = document.getElementById('shortcuts-panel');
  let shortcutsPanelOpen = false;

  function openShortcutsPanel() {
    shortcutsPanelOpen = true;
    shortcutsPanel.classList.remove('hidden');
  }
  function closeShortcutsPanel() {
    shortcutsPanelOpen = false;
    shortcutsPanel.classList.add('hidden');
  }

  // 툴바 버튼 → 패널 토글
  document.getElementById('btn-shortcuts').addEventListener('click', (e) => {
    e.stopPropagation();
    shortcutsPanelOpen ? closeShortcutsPanel() : openShortcutsPanel();
  });

  // X 버튼 → 패널 닫기
  document.getElementById('btn-shortcuts-close').addEventListener('click', (e) => {
    e.stopPropagation();
    closeShortcutsPanel();
  });

  // 헤더 드래그로 패널 이동 (X 버튼 클릭은 제외)
  shortcutsPanel.querySelector('.shortcuts-header').addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const rect = shortcutsPanel.getBoundingClientRect();
    // right-based CSS → left-based inline으로 전환
    shortcutsPanel.style.left  = rect.left + 'px';
    shortcutsPanel.style.top   = rect.top  + 'px';
    shortcutsPanel.style.right = 'auto';
    panelDragState = { startMouseX: e.clientX, startMouseY: e.clientY,
                       startLeft: rect.left,   startTop: rect.top };
    panelDragged = false;
  });

  window.addEventListener('mousemove', (e) => {
    if (!panelDragState) return;
    const dx = e.clientX - panelDragState.startMouseX;
    const dy = e.clientY - panelDragState.startMouseY;
    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) panelDragged = true;
    shortcutsPanel.style.left = (panelDragState.startLeft + dx) + 'px';
    shortcutsPanel.style.top  = (panelDragState.startTop  + dy) + 'px';
  });

  window.addEventListener('mouseup', (e) => {
    if (e.button === 0 && panelDragState) panelDragState = null;
  });

  // 외부 클릭 → 닫기 (드래그 후 클릭은 제외)
  document.addEventListener('click', (e) => {
    if (panelDragged) { panelDragged = false; return; }
    if (shortcutsPanelOpen &&
        !shortcutsPanel.contains(e.target) &&
        e.target.id !== 'btn-shortcuts') {
      closeShortcutsPanel();
    }
  });

  // 리사이즈
  window.addEventListener('resize', () => {
    if (projectCreated && currentConfig) {
      resizeCanvas(currentConfig);
      renderCanvas(currentConfig);
    }
  });

  // ===== 저장·불러오기 =====

  const LOCAL_STORAGE_KEY = 'gridframe_autosave';
  let pendingLoadData    = null; // 덮어쓰기 대기 데이터
  let pendingRestoreData = null; // 복원 대기 데이터

  // 프로젝트 상태 → JSON 구조 생성 (save-load.md 규격)
  function buildProjectData() {
    return {
      projectName:    displayProjectName.value,
      preset:         currentPreset,
      resolution:     { w: currentConfig.w, h: currentConfig.h },
      gridSize:       { cols: currentConfig.cols, rows: currentConfig.rows },
      gridMultiplier: scale,
      objects:        objects.map(o => {
        const obj = { id: o.id, label: o.label, description: o.description, color: o.color,
          startCol: o.startCol, startRow: o.startRow, endCol: o.endCol, endRow: o.endRow };
        if (o.compositeRects) obj.compositeRects = o.compositeRects.map(r => ({ ...r }));
        return obj;
      }),
      objectOrder:    objects.map(o => o.id)
    };
  }

  // localStorage 자동 저장
  function saveToLocalStorage() {
    if (!projectCreated) return;
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(buildProjectData()));
  }

  // .gridframe.json 파일 다운로드
  function saveProject() {
    if (!projectCreated) return;
    const blob = new Blob([JSON.stringify(buildProjectData(), null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `${displayProjectName.value}.gridframe.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    saveToLocalStorage();
  }

  // JSON 데이터로 프로젝트 초기화
  function loadFromData(data) {
    const cfg = {
      w:    data.resolution.w,
      h:    data.resolution.h,
      cols: data.gridSize.cols,
      rows: data.gridSize.rows
    };
    currentPreset = data.preset || 'custom';
    scale         = data.gridMultiplier || 1.0;

    initProject(data.projectName || '복원된 프로젝트', cfg);

    // objectOrder 기반 정렬
    const orderMap = {};
    (data.objectOrder || []).forEach((id, i) => { orderMap[id] = i; });
    const sorted = [...(data.objects || [])].sort(
      (a, b) => (orderMap[a.id] ?? 999) - (orderMap[b.id] ?? 999)
    );

    objects    = [];
    usedColors = new Set();

    sorted.forEach(o => {
      const obj = {
        id: o.id, label: o.label, description: o.description, color: o.color,
        startCol: o.startCol, startRow: o.startRow, endCol: o.endCol, endRow: o.endRow
      };
      if (o.compositeRects) obj.compositeRects = o.compositeRects.map(r => ({ ...r }));
      objects.push(obj);
      usedColors.add(o.color);
    });

    renderCanvas(cfg);
    updateObjectBar();
    updateObjectList();
  }

  // 파일 읽기 → 파싱 → 덮어쓰기 확인 또는 바로 로드
  function handleFileLoad(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);
        if (projectCreated) {
          pendingLoadData = data;
          document.getElementById('overwrite-modal').classList.remove('hidden');
        } else {
          loadFromData(data);
        }
      } catch {
        alert('올바른 .gridframe.json 파일이 아닙니다.');
      }
    };
    reader.readAsText(file);
  }

  // 툴바 저장 버튼
  document.getElementById('btn-save').addEventListener('click', saveProject);

  // 툴바 불러오기 버튼
  const fileInput = document.getElementById('file-input');
  document.getElementById('btn-load').addEventListener('click', () => {
    fileInput.value = '';
    fileInput.click();
  });
  fileInput.addEventListener('change', () => {
    if (fileInput.files[0]) handleFileLoad(fileInput.files[0]);
  });

  // 드래그앤드롭 불러오기
  document.body.addEventListener('dragover', e => e.preventDefault());
  document.body.addEventListener('drop', e => {
    e.preventDefault();
    const file = [...e.dataTransfer.files].find(f => f.name.endsWith('.json'));
    if (file) handleFileLoad(file);
  });

  // 덮어쓰기 확인 팝업
  document.getElementById('btn-overwrite-confirm').addEventListener('click', () => {
    document.getElementById('overwrite-modal').classList.add('hidden');
    if (pendingLoadData) { loadFromData(pendingLoadData); pendingLoadData = null; }
  });
  document.getElementById('btn-overwrite-cancel').addEventListener('click', () => {
    document.getElementById('overwrite-modal').classList.add('hidden');
    pendingLoadData = null;
  });

  // localStorage 30초마다 자동 저장
  setInterval(saveToLocalStorage, 30000);

  // 재접속 시 복원 확인
  const savedRaw = localStorage.getItem(LOCAL_STORAGE_KEY);
  if (savedRaw) {
    try {
      pendingRestoreData = JSON.parse(savedRaw);
      document.getElementById('restore-modal-name').textContent =
        pendingRestoreData.projectName || '(이름 없음)';
      document.getElementById('restore-modal').classList.remove('hidden');
    } catch {
      localStorage.removeItem(LOCAL_STORAGE_KEY);
    }
  }

  document.getElementById('btn-restore-confirm').addEventListener('click', () => {
    document.getElementById('restore-modal').classList.add('hidden');
    if (pendingRestoreData) { loadFromData(pendingRestoreData); pendingRestoreData = null; }
  });
  document.getElementById('btn-restore-cancel').addEventListener('click', () => {
    document.getElementById('restore-modal').classList.add('hidden');
    pendingRestoreData = null;
    localStorage.removeItem(LOCAL_STORAGE_KEY);
  });

  // ===== Export =====

  // 색상 코드 → 영어 이름 매핑
  const COLOR_NAMES = {
    '#FF0000': 'Red',     '#0000FF': 'Blue',    '#00CC00': 'Green',  '#FFFF00': 'Yellow',
    '#8800FF': 'Violet',  '#FF8800': 'Orange',  '#00FFFF': 'Cyan',   '#FF00FF': 'Magenta',
    '#884400': 'Brown',   '#FF88AA': 'Pink',    '#88FF00': 'Lime',   '#0088FF': 'Sky Blue',
    '#AA00AA': 'Purple',  '#00AA44': 'Emerald', '#FFAA00': 'Amber',  '#4444FF': 'Indigo',
    '#CCCCCC': 'Gray'
  };

  function getColorName(hex) {
    return COLOR_NAMES[hex.toUpperCase()] || hex;
  }

  // 객체 중심점 기반 3×3 영역 위치 판정
  function getObjectPosition(obj, cfg) {
    const cx = (obj.startCol + obj.endCol + 1) / 2 / cfg.cols;
    const cy = (obj.startRow + obj.endRow + 1) / 2 / cfg.rows;
    const sw = (obj.endCol  - obj.startCol + 1) / cfg.cols;
    const sh = (obj.endRow  - obj.startRow + 1) / cfg.rows;

    let h, v;
    if (sw >= 0.66)      h = 'entire-width';
    else if (cx < 0.334) h = 'left';
    else if (cx < 0.667) h = 'center';
    else                 h = 'right';

    if (sh >= 0.66)      v = 'entire-height';
    else if (cy < 0.334) v = 'top';
    else if (cy < 0.667) v = 'middle';
    else                 v = 'bottom';

    if (h === 'entire-width' && v === 'entire-height') return 'full-canvas';
    if (h === 'entire-width')  return `${v}, entire-width`;
    if (v === 'entire-height') return `${h}, entire-height`;
    return `${v}-${h}`;
  }

  // ===== Export =====

  // 프리뷰 PNG 생성 (전체 페이지, 격자선·범례 없음)
  function generatePreviewMap() {
    const cfg = currentConfig;
    const c   = document.createElement('canvas');
    c.width   = cfg.w; c.height = cfg.h;
    const cx  = c.getContext('2d');
    const cw  = cfg.w / cfg.cols, ch = cfg.h / cfg.rows;
    const lw  = Math.max(2, Math.floor(cfg.w / 600));

    cx.fillStyle = '#ffffff';
    cx.fillRect(0, 0, cfg.w, cfg.h);

    objects.forEach(obj => {
      cx.globalAlpha = 0.65;
      cx.fillStyle   = obj.color;
      getObjectRects(obj).forEach(r => {
        cx.fillRect(r.startCol * cw, r.startRow * ch,
          (r.endCol - r.startCol + 1) * cw, (r.endRow - r.startRow + 1) * ch);
      });
      cx.globalAlpha = 1;
      cx.strokeStyle = obj.color;
      cx.lineWidth   = lw;
      if (obj.compositeRects) {
        drawCompositeBorder(obj.compositeRects, cw, ch, cx);
      } else {
        const x = obj.startCol * cw, y = obj.startRow * ch;
        const w = (obj.endCol - obj.startCol + 1) * cw, h = (obj.endRow - obj.startRow + 1) * ch;
        cx.strokeRect(x + 1, y + 1, w - 2, h - 2);
      }
    });

    objects.forEach(obj => {
      if (!obj.label) return;
      const lr = obj.compositeRects
        ? obj.compositeRects.reduce((best, r) => {
            const a = (r.endCol - r.startCol + 1) * (r.endRow - r.startRow + 1);
            const ba = (best.endCol - best.startCol + 1) * (best.endRow - best.startRow + 1);
            return a > ba ? r : best;
          })
        : obj;
      const x = lr.startCol * cw, y = lr.startRow * ch;
      const w = (lr.endCol - lr.startCol + 1) * cw;
      const h = (lr.endRow - lr.startRow + 1) * ch;
      const fs = Math.max(8, Math.min(Math.floor(h * 0.2), 36));
      cx.font = `bold ${fs}px Segoe UI, sans-serif`;
      cx.fillStyle = 'rgba(0,0,0,0.9)';
      cx.textAlign = 'center'; cx.textBaseline = 'middle';
      cx.shadowColor = 'rgba(255,255,255,0.9)'; cx.shadowBlur = 3;
      cx.fillText(obj.label, x + w / 2, y + h / 2);
      cx.shadowBlur = 0;
    });

    return c;
  }

  // 프롬프트 텍스트 자동 생성
  function generatePromptText() {
    if (!projectCreated || objects.length === 0) return '';
    return objects.map(obj => {
      const pos  = getObjectPosition(obj, currentConfig);
      const desc = obj.description || obj.label || '';
      return `${getColorName(obj.color)} | ${pos} | ${desc}`;
    }).join('\n');
  }

  let exportPrevCanvas = null;

  function openExportModal() {
    if (!projectCreated) return;
    exportPrevCanvas = generatePreviewMap();
    document.getElementById('prev-preview-img').src = exportPrevCanvas.toDataURL('image/png');
    document.getElementById('export-prompt-text').value = generatePromptText();
    document.getElementById('export-modal').classList.remove('hidden');
  }

  function closeExportModal() {
    document.getElementById('export-modal').classList.add('hidden');
  }

  function downloadCanvas(canvas, filename) {
    canvas.toBlob(blob => {
      const url = URL.createObjectURL(blob);
      const a   = Object.assign(document.createElement('a'), { href: url, download: filename });
      document.body.appendChild(a); a.click();
      document.body.removeChild(a); URL.revokeObjectURL(url);
    });
  }

  document.getElementById('btn-export').addEventListener('click', openExportModal);
  document.getElementById('btn-export-close').addEventListener('click', closeExportModal);

  document.getElementById('btn-dl-prev').addEventListener('click', () => {
    if (exportPrevCanvas) downloadCanvas(exportPrevCanvas, `${displayProjectName.value}_preview.png`);
  });

  document.getElementById('btn-copy-prompt').addEventListener('click', () => {
    const text = document.getElementById('export-prompt-text').value;
    navigator.clipboard.writeText(text).then(() => {
      const btn  = document.getElementById('btn-copy-prompt');
      const orig = btn.textContent;
      btn.textContent = '✅ 복사됨';
      setTimeout(() => { btn.textContent = orig; }, 1500);
    }).catch(() => {
      // 구형 브라우저 폴백
      const ta = document.getElementById('export-prompt-text');
      ta.select();
      document.execCommand('copy');
    });
  });
