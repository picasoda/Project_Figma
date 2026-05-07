
  // ===== 팔레트 =====
  const PALETTE = [
    '#FF0000', '#0000FF', '#00CC00', '#FFFF00',
    '#8800FF', '#FF8800', '#00FFFF', '#FF00FF',
    '#884400', '#FF88AA', '#88FF00', '#0088FF',
    '#AA00AA', '#00AA44', '#FFAA00', '#4444FF'
  ];

  // ===== 프리셋 데이터 =====
  const PRESETS = {
    desktop: { w: 1920, h: 1080, cols: 48, rows: 27 },
    tablet:  { w: 768,  h: 1024, cols: 24, rows: 32 },
    mobile:  { w: 390,  h: 844,  cols: 18, rows: 39 }
  };

  // ===== 상태 =====
  let currentPreset  = 'desktop';
  let scale          = 1.0;
  let projectCreated = false;
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
  const gridSizeDisplay    = document.getElementById('grid-size-display');
  const resolutionDisplay  = document.getElementById('resolution-display');
  const customInputs       = document.getElementById('custom-inputs');
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
    document.getElementById('btn-bg-create'),
    document.getElementById('btn-fit'),
    document.getElementById('btn-grid-toggle'),
    document.getElementById('btn-save'),
    document.getElementById('btn-export')
  ];

  // ===== 유틸 =====
  function applyCanvasTransform() {
    // CSS의 translate(-50%,-50%) 센터링을 인라인 스타일로 덮으므로 항상 포함
    gridCanvas.style.transform =
      `translate(calc(-50% + ${viewPanX}px), calc(-50% + ${viewPanY}px)) scale(${viewZoom})`;
    document.getElementById('display-zoom').textContent =
      Math.round(viewZoom * 100) + '%';
  }

  function generateId() {
    return 'obj_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
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

  // 겹침 체크 (bg 제외)
  function overlapsAnyObject(sc, sr, ec, er) {
    return objects.some(obj =>
      !obj.isBg &&
      sc <= obj.endCol && ec >= obj.startCol &&
      sr <= obj.endRow && er >= obj.startRow
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

  // 해당 셀에 있는 객체 반환 (위에 그려진 객체 우선, bg 제외)
  function objectAtCell(col, row) {
    for (let i = objects.length - 1; i >= 0; i--) {
      const obj = objects[i];
      if (obj.isBg) continue;
      if (col >= obj.startCol && col <= obj.endCol &&
          row >= obj.startRow && row <= obj.endRow) return obj;
    }
    return null;
  }

  // 특정 객체를 제외한 겹침 체크 (이동·크기조절용, bg 제외)
  function overlapsOtherObjects(sc, sr, ec, er, excludeId) {
    return objects.some(obj =>
      obj.id !== excludeId &&
      !obj.isBg &&
      sc <= obj.endCol && ec >= obj.startCol &&
      sr <= obj.endRow && er >= obj.startRow
    );
  }

  // 선택된 객체 가장자리 감지 → edge 문자열 반환 (n/s/e/w/nw/ne/sw/se/null)
  function getEdgeAtMouse(e, obj, cfg) {
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
    history.push({ objects: objects.map(o => ({ ...o })), usedColors: new Set(usedColors) });
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

  // 속성 패널 열기 (필드 채우기, bg 객체는 설명만 편집 가능)
  function openPropertyPanel(obj) {
    panelLabelInput.value    = obj.label;
    panelDescInput.value     = obj.description;
    panelLabelInput.disabled = !!obj.isBg;
    const colorGroup = document.getElementById('panel-color-group');
    if (obj.isBg) colorGroup.classList.add('hidden');
    else          colorGroup.classList.remove('hidden');
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
    if (!selectedObject.isBg) usedColors.delete(selectedObject.color);
    objects = objects.filter(o => o.id !== selectedObject.id);
    selectedObject = null;
    propertyPanel.classList.add('hidden');
    renderCanvas(currentConfig);
    updateObjectBar();
    updateObjectList();
  }

  // 캔버스 내 객체 이름 텍스트 렌더링 (자동 축소 → 말줄임)
  function drawObjectLabel(text, x, y, w, h) {
    if (!text || w < 10 || h < 10) return;
    const maxW = w - 8;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    // 자동 축소: 14→12→10→8px
    let fs = 14;
    for (; fs >= 8; fs -= 2) {
      ctx.font = `bold ${fs}px Segoe UI, sans-serif`;
      if (ctx.measureText(text).width <= maxW) break;
    }
    fs = Math.max(8, fs);
    ctx.font = `bold ${fs}px Segoe UI, sans-serif`;
    if (h < fs + 4) return;
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
    ctx.fillStyle   = 'rgba(255,255,255,0.9)';
    ctx.shadowColor = 'rgba(0,0,0,0.7)';
    ctx.shadowBlur  = 2;
    ctx.fillText(display, x + w / 2, y + h / 2);
    ctx.shadowBlur  = 0;
  }

  // ===== 캔버스 크기 설정 (리사이즈·초기화 시) =====
  function resizeCanvas(cfg) {
    const canvasArea = document.getElementById('canvas-area');
    const areaW = canvasArea.clientWidth;
    const areaH = canvasArea.clientHeight;
    const ratio  = cfg.w / cfg.h;
    let canvasW, canvasH;
    if (areaW / areaH > ratio) {
      canvasH = Math.floor(areaH * 0.85);
      canvasW = Math.floor(canvasH * ratio);
    } else {
      canvasW = Math.floor(areaW * 0.85);
      canvasH = Math.floor(canvasW / ratio);
    }
    gridCanvas.width        = canvasW;
    gridCanvas.height       = canvasH;
    gridCanvas.style.width  = canvasW + 'px';
    gridCanvas.style.height = canvasH + 'px';
  }

  // ===== 캔버스 전체 렌더링 =====
  function renderCanvas(cfg) {
    const canvasW = gridCanvas.width;
    const canvasH = gridCanvas.height;
    const cellW   = canvasW / cfg.cols;
    const cellH   = canvasH / cfg.rows;

    // 배경
    ctx.fillStyle = '#2a2a3a';
    ctx.fillRect(0, 0, canvasW, canvasH);

    // 이동·크기조절 중인 객체 ID (해당 객체는 별도 프리뷰로 렌더링)
    const activeId = moveState ? moveState.obj.id : (resizeState ? resizeState.obj.id : null);

    // 일반 객체 렌더링 (활성 객체 제외, 배경 객체는 더 투명)
    objects.forEach(obj => {
      if (obj.id === activeId) return;
      const x = obj.startCol * cellW;
      const y = obj.startRow * cellH;
      const w = (obj.endCol - obj.startCol + 1) * cellW;
      const h = (obj.endRow - obj.startRow + 1) * cellH;
      ctx.globalAlpha = obj.isBg ? 0.3 : 0.55;
      ctx.fillStyle   = obj.color;
      ctx.fillRect(x, y, w, h);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = obj.color;
      ctx.lineWidth   = obj.isBg ? 1 : 2;
      ctx.setLineDash([]);
      ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
    });

    // 다중 선택 하이라이트 (청록색 점선)
    if (multiSelection.size > 0) {
      objects.forEach(obj => {
        if (!multiSelection.has(obj.id)) return;
        const x = obj.startCol * cellW;
        const y = obj.startRow * cellH;
        const w = (obj.endCol - obj.startCol + 1) * cellW;
        const h = (obj.endRow - obj.startRow + 1) * cellH;
        ctx.strokeStyle = '#00ffff';
        ctx.lineWidth   = 2;
        ctx.setLineDash([5, 4]);
        ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
        ctx.setLineDash([]);
      });
    }

    // 단일 선택 하이라이트 (흰 점선) — 이동·크기조절 중에는 프리뷰로 대체
    if (selectedObject && !moveState && !resizeState) {
      const obj = selectedObject;
      const sx  = obj.startCol * cellW;
      const sy  = obj.startRow * cellH;
      const sw  = (obj.endCol - obj.startCol + 1) * cellW;
      const sh  = (obj.endRow - obj.startRow + 1) * cellH;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth   = 2;
      ctx.setLineDash([6, 3]);
      ctx.strokeRect(sx + 1, sy + 1, sw - 2, sh - 2);
      ctx.setLineDash([]);
    }

    // 이동 프리뷰
    if (moveState) {
      const { previewStartCol:psc, previewStartRow:psr,
              previewEndCol:pec,   previewEndRow:per, valid, obj } = moveState;
      const x = psc * cellW, y = psr * cellH;
      const w = (pec - psc + 1) * cellW, h = (per - psr + 1) * cellH;
      ctx.globalAlpha = valid ? 0.7 : 0.4;
      ctx.fillStyle   = valid ? obj.color : '#ff3333';
      ctx.fillRect(x, y, w, h);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = valid ? '#ffffff' : '#ff5555';
      ctx.lineWidth   = 2;
      ctx.setLineDash([6, 3]);
      ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
      ctx.setLineDash([]);
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
      ctx.lineWidth   = 2;
      ctx.setLineDash([6, 3]);
      ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
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
      ctx.lineWidth   = 2;
      ctx.setLineDash([]);
      ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
    }

    // 격자선 (showGrid 토글에 따라 조건부 렌더링)
    if (showGrid) {
      ctx.strokeStyle = '#3a3a5a';
      ctx.lineWidth   = 1;
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

    // 객체 이름 텍스트 렌더링 (격자선 위에 표시)
    objects.forEach(obj => {
      if (obj.id === activeId || !obj.label) return;
      const x = obj.startCol * cellW, y = obj.startRow * cellH;
      const w = (obj.endCol - obj.startCol + 1) * cellW;
      const h = (obj.endRow - obj.startRow + 1) * cellH;
      drawObjectLabel(obj.label, x, y, w, h);
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

    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.font      = '11px Segoe UI, sans-serif';
    ctx.fillText(`${cfg.cols}×${cfg.rows}  |  ${cfg.w}×${cfg.h}`, 8, 16);
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
    const count = objects.filter(o => !o.isBg).length;
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

      // 드래그 정렬 (bg 객체는 고정)
      if (!obj.isBg) {
        item.draggable = true;
        item.addEventListener('dragstart', e => {
          e.dataTransfer.setData('text/plain', obj.id);
          item.classList.add('dragging');
        });
        item.addEventListener('dragend', () => {
          item.classList.remove('dragging');
          listEl.querySelectorAll('.obj-list-item').forEach(el => el.classList.remove('drag-over'));
        });
      }
      item.addEventListener('dragover', e => {
        if (obj.isBg) return;
        e.preventDefault();
        listEl.querySelectorAll('.obj-list-item').forEach(el => el.classList.remove('drag-over'));
        item.classList.add('drag-over');
      });
      item.addEventListener('drop', e => {
        if (obj.isBg) return;
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

  // ===== 모달 열기/닫기 =====
  function openCreateModal() {
    createModal.classList.remove('hidden');
    inputProjectName.value = '';
    createError.classList.remove('show');
    inputProjectName.classList.remove('error');
    scale         = 1.0;
    currentPreset = 'desktop';
    customInputs.classList.remove('show');
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
    if (currentPreset === 'custom') {
      return {
        w:    parseInt(document.getElementById('custom-width').value)  || 1920,
        h:    parseInt(document.getElementById('custom-height').value) || 1080,
        cols: parseInt(document.getElementById('custom-cols').value)   || 32,
        rows: parseInt(document.getElementById('custom-rows').value)   || 18
      };
    }
    const p = PRESETS[currentPreset];
    return {
      w:    p.w,
      h:    p.h,
      cols: Math.round(p.cols * scale),
      rows: Math.round(p.rows * scale)
    };
  }

  function updateDisplay() {
    const cfg = getCurrentConfig();
    scaleValue.textContent        = `×${scale.toFixed(1)}`;
    gridSizeDisplay.textContent   = `${cfg.cols}열 × ${cfg.rows}행`;
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
      customInputs.classList.toggle('show', currentPreset === 'custom');
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

  // Custom 실시간
  ['custom-width', 'custom-height', 'custom-cols', 'custom-rows'].forEach(id => {
    document.getElementById(id).addEventListener('input', updateDisplay);
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
      moveState.valid = !overlapsOtherObjects(
        moveState.previewStartCol, moveState.previewStartRow,
        moveState.previewEndCol,   moveState.previewEndRow,
        moveState.obj.id
      );
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
        moveState.obj.startCol = moveState.previewStartCol;
        moveState.obj.startRow = moveState.previewStartRow;
        moveState.obj.endCol   = moveState.previewEndCol;
        moveState.obj.endRow   = moveState.previewEndRow;
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

    // Enter → 객체 생성
    if (e.key === 'Enter' && projectCreated) createObjectFromSelection();

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

  // 배경 객체 생성 버튼 (1개 제한, #CCCCCC 고정)
  document.getElementById('btn-bg-create').addEventListener('click', () => {
    if (!projectCreated) return;
    if (objects.some(o => o.isBg)) return; // 이미 배경 있음
    pushHistory();
    const bg = {
      id:          generateId(),
      label:       '배경',
      description: '',
      color:       '#CCCCCC',
      isBg:        true,
      startCol:    0,
      startRow:    0,
      endCol:      currentConfig.cols - 1,
      endRow:      currentConfig.rows - 1
    };
    objects.unshift(bg);
    renderCanvas(currentConfig);
    updateObjectBar();
    updateObjectList();
  });

  // 맞추기 버튼 → 줌·팬 리셋
  document.getElementById('btn-fit').addEventListener('click', () => {
    if (!projectCreated) return;
    viewZoom = 1.0;
    viewPanX = 0;
    viewPanY = 0;
    applyCanvasTransform();
  });

  // 격자선 토글 버튼
  document.getElementById('btn-grid-toggle').addEventListener('click', () => {
    if (!projectCreated) return;
    showGrid = !showGrid;
    renderCanvas(currentConfig);
    document.getElementById('btn-grid-toggle').classList.toggle('active', showGrid);
  });

  // 단축키 패널
  const shortcutsPanel = document.getElementById('shortcuts-panel');
  let shortcutsPanelOpen = false;

  function openShortcutsPanel() {
    shortcutsPanelOpen = true;
    shortcutsPanel.classList.remove('hidden');
  }
  function closeShortcutsPanel() {
    shortcutsPanelOpen = false;
    shortcutsPanel.classList.add('hidden');
  }

  document.getElementById('btn-shortcuts').addEventListener('click', (e) => {
    e.stopPropagation();
    shortcutsPanelOpen ? closeShortcutsPanel() : openShortcutsPanel();
  });
  document.getElementById('btn-shortcuts-close').addEventListener('click', (e) => {
    e.stopPropagation();
    closeShortcutsPanel();
  });
  document.addEventListener('click', (e) => {
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
    const bgObj = objects.find(o => o.isBg);
    return {
      projectName:    displayProjectName.value,
      preset:         currentPreset,
      resolution:     { w: currentConfig.w, h: currentConfig.h },
      gridSize:       { cols: currentConfig.cols, rows: currentConfig.rows },
      gridMultiplier: scale,
      background:     bgObj ? { color: bgObj.color, description: bgObj.description } : null,
      objects:        objects.filter(o => !o.isBg).map(o => ({
        id: o.id, label: o.label, description: o.description, color: o.color,
        startCol: o.startCol, startRow: o.startRow, endCol: o.endCol, endRow: o.endRow
      })),
      objectOrder:    objects.filter(o => !o.isBg).map(o => o.id)
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

    if (data.background) {
      objects.push({
        id: generateId(), label: '배경',
        description: data.background.description || '',
        color: data.background.color || '#CCCCCC',
        isBg: true,
        startCol: 0, startRow: 0,
        endCol: cfg.cols - 1, endRow: cfg.rows - 1
      });
    }

    sorted.forEach(o => {
      objects.push({
        id: o.id, label: o.label, description: o.description, color: o.color,
        startCol: o.startCol, startRow: o.startRow, endCol: o.endCol, endRow: o.endRow
      });
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

  // 프리뷰 PNG 생성 (테두리 + 색상 + 이름, 격자선·범례 없음)
  function generatePreviewMap() {
    const cfg = currentConfig;
    const c  = document.createElement('canvas');
    c.width  = cfg.w; c.height = cfg.h;
    const cx = c.getContext('2d');
    const cw = cfg.w / cfg.cols, ch = cfg.h / cfg.rows;

    cx.fillStyle = '#2a2a3a';
    cx.fillRect(0, 0, cfg.w, cfg.h);

    objects.forEach(obj => {
      const x = obj.startCol * cw, y = obj.startRow * ch;
      const w = (obj.endCol - obj.startCol + 1) * cw;
      const h = (obj.endRow - obj.startRow + 1) * ch;
      cx.globalAlpha = obj.isBg ? 0.25 : 0.65;
      cx.fillStyle   = obj.color;
      cx.fillRect(x, y, w, h);
      cx.globalAlpha = 1;
      cx.strokeStyle = obj.color;
      cx.lineWidth   = Math.max(2, Math.floor(cfg.w / 600));
      cx.strokeRect(x + 1, y + 1, w - 2, h - 2);
    });

    // 객체 이름 텍스트 (bg 제외)
    objects.forEach(obj => {
      if (obj.isBg || !obj.label) return;
      const x = obj.startCol * cw, y = obj.startRow * ch;
      const w = (obj.endCol - obj.startCol + 1) * cw;
      const h = (obj.endRow - obj.startRow + 1) * ch;
      const labelFs = Math.max(8, Math.min(Math.floor(h * 0.2), 36));
      cx.font         = `bold ${labelFs}px Segoe UI, sans-serif`;
      cx.fillStyle    = 'rgba(255,255,255,0.9)';
      cx.textAlign    = 'center';
      cx.textBaseline = 'middle';
      cx.shadowColor  = 'rgba(0,0,0,0.8)';
      cx.shadowBlur   = 3;
      cx.fillText(obj.label, x + w / 2, y + h / 2);
      cx.shadowBlur   = 0;
    });

    return c;
  }

  // 프롬프트 텍스트 자동 생성
  function generatePromptText() {
    if (!projectCreated || objects.length === 0) return '';
    return objects.map(obj => {
      const colorName = getColorName(obj.color);
      const pos       = getObjectPosition(obj, currentConfig);
      const desc      = obj.description || obj.label || '';
      return `${colorName} | ${pos} | ${desc}`;
    }).join('\n');
  }

  let exportPrevCanvas = null;

  function openExportModal() {
    if (!projectCreated) return;
    exportPrevCanvas = generatePreviewMap();
    // img src를 full-res data URL로 설정 → 우클릭 복사도 원본 해상도
    document.getElementById('prev-preview-img').src = exportPrevCanvas.toDataURL('image/png');
    document.getElementById('export-modal').classList.remove('hidden');
    document.getElementById('export-prompt-text').value = generatePromptText();
  }

  function closeExportModal() {
    document.getElementById('export-modal').classList.add('hidden');
  }

  function downloadCanvas(canvas, filename) {
    canvas.toBlob(blob => {
      const url = URL.createObjectURL(blob);
      const a   = Object.assign(document.createElement('a'), { href: url, download: filename });
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
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
