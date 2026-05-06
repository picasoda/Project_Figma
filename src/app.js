
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

  // ===== 객체 선택·패널 =====

  // 객체 선택: 하이라이트 + 패널 열기
  function selectObject(obj) {
    selectedObject = obj;
    dragState      = null;
    isDragging     = false;
    renderCanvas(currentConfig);
    openPropertyPanel(obj);
  }

  // 선택 해제: 하이라이트 제거 + 패널 닫기
  function deselectObject() {
    selectedObject = null;
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

    // 객체 렌더링
    objects.forEach(obj => {
      const x = obj.startCol * cellW;
      const y = obj.startRow * cellH;
      const w = (obj.endCol - obj.startCol + 1) * cellW;
      const h = (obj.endRow - obj.startRow + 1) * cellH;
      // 반투명 채우기
      ctx.globalAlpha = 0.55;
      ctx.fillStyle   = obj.color;
      ctx.fillRect(x, y, w, h);
      ctx.globalAlpha = 1;
      // 테두리
      ctx.strokeStyle = obj.color;
      ctx.lineWidth   = 2;
      ctx.setLineDash([]);
      ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
    });

    // 선택된 객체 하이라이트 (흰 점선 테두리)
    if (selectedObject) {
      const obj = selectedObject;
      const sx = obj.startCol * cellW;
      const sy = obj.startRow * cellH;
      const sw = (obj.endCol - obj.startCol + 1) * cellW;
      const sh = (obj.endRow - obj.startRow + 1) * cellH;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth   = 2;
      ctx.setLineDash([6, 3]);
      ctx.strokeRect(sx + 1, sy + 1, sw - 2, sh - 2);
      ctx.setLineDash([]);
    }

    // 드래그 선택 하이라이트
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
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvasH);
      ctx.stroke();
    }
    for (let j = 0; j <= cfg.rows; j++) {
      const y = Math.floor(j * cellH) + 0.5;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvasW, y);
      ctx.stroke();
    }

    // 격자 정보 텍스트
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
    propertyPanel.classList.add('hidden');

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

  // 캔버스: 클릭 처리 (객체 선택 또는 드래그 시작)
  gridCanvas.addEventListener('mousedown', (e) => {
    if (!projectCreated || e.button !== 0) return;
    const { col, row } = getCellFromMouse(e, currentConfig);
    const clicked = objectAtCell(col, row);
    if (clicked) {
      // 객체 클릭 → 선택 (다른 객체면 패널 전환)
      selectObject(clicked);
      return;
    }
    // 빈 셀 클릭 → 선택 해제 + 드래그 시작
    if (selectedObject) deselectObject();
    isDragging = true;
    dragState  = { startCol: col, startRow: row, endCol: col, endRow: row };
    renderCanvas(currentConfig);
  });

  // 캔버스: 드래그 중
  gridCanvas.addEventListener('mousemove', (e) => {
    if (!projectCreated || !currentConfig) return;
    const { col, row } = getCellFromMouse(e, currentConfig);
    // 커서 스타일
    gridCanvas.style.cursor = objectAtCell(col, row) ? 'pointer' : 'crosshair';
    // 드래그 선택 업데이트
    if (isDragging && dragState) {
      dragState.endCol = col;
      dragState.endRow = row;
      renderCanvas(currentConfig);
    }
  });

  // 캔버스: 드래그 완료 (선택 유지)
  gridCanvas.addEventListener('mouseup', () => {
    isDragging = false;
  });

  // 캔버스 밖에서 마우스 업 시에도 드래그 종료
  window.addEventListener('mouseup', () => {
    isDragging = false;
  });

  // 객체 생성 버튼
  document.getElementById('btn-obj-create').addEventListener('click', () => {
    createObjectFromSelection();
  });

  // 키보드: Enter → 객체 생성, Escape → 드래그 취소 또는 선택 해제
  document.addEventListener('keydown', (e) => {
    // input/textarea에서 Enter는 차단 (객체 생성 방지), ESC는 허용
    if (e.key === 'Enter' && e.target.matches('input, textarea')) return;
    if (e.key === 'Enter' && projectCreated) {
      createObjectFromSelection();
    }
    if (e.key === 'Escape') {
      if (dragState) {
        dragState  = null;
        isDragging = false;
        renderCanvas(currentConfig);
      } else if (selectedObject) {
        deselectObject();
      }
    }
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
