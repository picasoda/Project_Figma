
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

  // 겹침 체크
  function overlapsAnyObject(sc, sr, ec, er) {
    return objects.some(obj =>
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

  // 해당 셀에 있는 객체 반환
  function objectAtCell(col, row) {
    return objects.find(obj =>
      col >= obj.startCol && col <= obj.endCol &&
      row >= obj.startRow && row <= obj.endRow
    ) || null;
  }

  // 특정 객체를 제외한 겹침 체크 (이동·크기조절용)
  function overlapsOtherObjects(sc, sr, ec, er, excludeId) {
    return objects.some(obj =>
      obj.id !== excludeId &&
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
  }

  // 선택 해제: 하이라이트 제거 + 패널 닫기
  function deselectObject() {
    selectedObject = null;
    moveState      = null;
    resizeState    = null;
    clearMultiSelection();
    propertyPanel.classList.add('hidden');
    renderCanvas(currentConfig);
  }

  // 속성 패널 열기 (필드 채우기)
  function openPropertyPanel(obj) {
    panelLabelInput.value = obj.label;
    panelDescInput.value  = obj.description;
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

    // 일반 객체 렌더링 (활성 객체 제외)
    objects.forEach(obj => {
      if (obj.id === activeId) return;
      const x = obj.startCol * cellW;
      const y = obj.startRow * cellH;
      const w = (obj.endCol - obj.startCol + 1) * cellW;
      const h = (obj.endRow - obj.startRow + 1) * cellH;
      ctx.globalAlpha = 0.55;
      ctx.fillStyle   = obj.color;
      ctx.fillRect(x, y, w, h);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = obj.color;
      ctx.lineWidth   = 2;
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

    // 격자선
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

    resizeCanvas(cfg);
    renderCanvas(cfg);
  }

  // ===== 하단 바 업데이트 =====
  function updateObjectBar() {
    barEmptyMsg.textContent = objects.length === 0
      ? '객체 없음'
      : `객체 ${objects.length}개`;
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
    // TODO: 저장 로직 (6단계)
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

  // 마우스 업: 이동·크기조절 확정 또는 취소
  window.addEventListener('mouseup', () => {
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
  });

  // 속성 패널: 다중 선택 일괄 삭제
  document.getElementById('panel-btn-multi-delete').addEventListener('click', () => {
    deleteMultiSelection();
  });

  // 속성 패널: 이름 변경
  panelLabelInput.addEventListener('input', () => {
    if (selectedObject) selectedObject.label = panelLabelInput.value;
  });

  // 속성 패널: 설명 변경
  panelDescInput.addEventListener('input', () => {
    if (selectedObject) selectedObject.description = panelDescInput.value;
  });

  // 속성 패널: 삭제
  document.getElementById('panel-btn-delete').addEventListener('click', () => {
    deleteSelectedObject();
  });

  // 단축키 버튼 (8단계 구현 예정)
  document.getElementById('btn-shortcuts').addEventListener('click', () => {
    // 8단계 구현 예정
  });

  // 리사이즈
  window.addEventListener('resize', () => {
    if (projectCreated && currentConfig) {
      resizeCanvas(currentConfig);
      renderCanvas(currentConfig);
    }
  });
