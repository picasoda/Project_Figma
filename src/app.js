
  // ===== 프리셋 데이터 =====
  const PRESETS = {
    desktop: { w: 1920, h: 1080, cols: 64, rows: 36 },
    tablet:  { w: 768,  h: 1024, cols: 24, rows: 32 },
    mobile:  { w: 390,  h: 844,  cols: 18, rows: 39 }
  };

  // ===== 상태 =====
  let currentPreset = 'desktop';
  let scale = 1.0;
  let projectCreated = false;
  let currentConfig = null;

  // ===== DOM =====
  const toolbar          = document.getElementById('toolbar');
  const mainArea         = document.getElementById('main-area');
  const objectBar        = document.getElementById('object-bar');
  const createModal      = document.getElementById('create-modal');
  const floatingMsg      = document.getElementById('floating-msg');
  const emptyMsg         = document.getElementById('empty-msg');
  const barEmptyMsg      = document.getElementById('bar-empty-msg');

  const inputProjectName = document.getElementById('input-project-name');
  const createError      = document.getElementById('create-error');
  const scaleValue       = document.getElementById('scale-value');
  const gridSizeDisplay  = document.getElementById('grid-size-display');
  const resolutionDisplay= document.getElementById('resolution-display');
  const customInputs     = document.getElementById('custom-inputs');
  const displayProjectName = document.getElementById('display-project-name');

  const gridCanvas       = document.getElementById('grid-canvas');
  const ctx              = gridCanvas.getContext('2d');

  // 프로젝트 생성 후 활성화할 버튼들
  const projectButtons = [
    document.getElementById('btn-obj-create'),
    document.getElementById('btn-fit'),
    document.getElementById('btn-grid-toggle'),
    document.getElementById('btn-save'),
    document.getElementById('btn-export')
  ];

  // ===== 모달 열기/닫기 =====
  function openCreateModal() {
    createModal.classList.remove('hidden');
    inputProjectName.value = '';
    createError.classList.remove('show');
    inputProjectName.classList.remove('error');
    scale = 1.0;
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

  // ===== 새파일 버튼 =====
  document.getElementById('btn-toolbar-new').addEventListener('click', () => {
    if (projectCreated) {
      floatingMsg.classList.add('visible');
    } else {
      openCreateModal();
    }
  });

  // ===== 플로팅 메시지 =====
  document.getElementById('btn-float-save').addEventListener('click', () => {
    floatingMsg.classList.remove('visible');
    // TODO: 저장 로직
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

  // ===== 프리셋 선택 =====
  document.querySelectorAll('.preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentPreset = btn.dataset.preset;

      if (currentPreset === 'custom') {
        customInputs.classList.add('show');
      } else {
        customInputs.classList.remove('show');
      }

      scale = 1.0;
      updateDisplay();
    });
  });

  // ===== 배율 조절 =====
  document.getElementById('btn-scale-up').addEventListener('click', () => {
    if (scale < 3.0) {
      scale = Math.round((scale + 0.1) * 10) / 10;
      updateDisplay();
    }
  });
  document.getElementById('btn-scale-down').addEventListener('click', () => {
    if (scale > 0.5) {
      scale = Math.round((scale - 0.1) * 10) / 10;
      updateDisplay();
    }
  });

  // ===== Custom 실시간 =====
  ['custom-width','custom-height','custom-cols','custom-rows'].forEach(id => {
    document.getElementById(id).addEventListener('input', updateDisplay);
  });

  // ===== 설정값 계산 =====
  function getCurrentConfig() {
    if (currentPreset === 'custom') {
      return {
        w: parseInt(document.getElementById('custom-width').value) || 1920,
        h: parseInt(document.getElementById('custom-height').value) || 1080,
        cols: parseInt(document.getElementById('custom-cols').value) || 32,
        rows: parseInt(document.getElementById('custom-rows').value) || 18
      };
    }
    const p = PRESETS[currentPreset];
    return {
      w: p.w,
      h: p.h,
      cols: Math.round(p.cols * scale),
      rows: Math.round(p.rows * scale)
    };
  }

  function updateDisplay() {
    const cfg = getCurrentConfig();
    scaleValue.textContent = `×${scale.toFixed(1)}`;
    gridSizeDisplay.textContent = `${cfg.cols}열 × ${cfg.rows}행`;
    resolutionDisplay.textContent = `${cfg.w} × ${cfg.h}`;
  }

  // ===== 취소 =====
  document.getElementById('btn-create-cancel').addEventListener('click', closeCreateModal);

  // ===== 에러 초기화 =====
  inputProjectName.addEventListener('input', () => {
    createError.classList.remove('show');
    inputProjectName.classList.remove('error');
  });

  // ===== 만들기 =====
  document.getElementById('btn-create-confirm').addEventListener('click', () => {
    const name = inputProjectName.value.trim();

    if (!name) {
      createError.textContent = '프로젝트 이름을 입력해주세요.';
      createError.classList.add('show');
      inputProjectName.classList.add('error');
      return;
    }

    const forbidden = /[\\/:*?"<>|]/;
    if (forbidden.test(name)) {
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

    // 성공
    closeCreateModal();
    projectCreated = true;
    currentConfig = cfg;

    displayProjectName.value = name;
    enableProjectButtons();

    emptyMsg.classList.add('hidden');
    barEmptyMsg.textContent = '객체 없음';
    gridCanvas.classList.add('visible');

    drawGrid(cfg);
  });

  // ===== 격자 그리기 =====
  function drawGrid(cfg) {
    const canvasArea = document.getElementById('canvas-area');
    const areaW = canvasArea.clientWidth;
    const areaH = canvasArea.clientHeight;

    const ratio = cfg.w / cfg.h;
    let canvasW, canvasH;

    if (areaW / areaH > ratio) {
      canvasH = Math.floor(areaH * 0.85);
      canvasW = Math.floor(canvasH * ratio);
    } else {
      canvasW = Math.floor(areaW * 0.85);
      canvasH = Math.floor(canvasW / ratio);
    }

    gridCanvas.width = canvasW;
    gridCanvas.height = canvasH;
    gridCanvas.style.width = canvasW + 'px';
    gridCanvas.style.height = canvasH + 'px';

    const cellW = canvasW / cfg.cols;
    const cellH = canvasH / cfg.rows;

    // 배경
    ctx.fillStyle = '#2a2a3a';
    ctx.fillRect(0, 0, canvasW, canvasH);

    // 격자선
    ctx.strokeStyle = '#3a3a5a';
    ctx.lineWidth = 1;

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

    // 정보
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.font = '11px Segoe UI, sans-serif';
    ctx.fillText(`${cfg.cols}×${cfg.rows}  |  ${cfg.w}×${cfg.h}`, 8, 16);
  }

  // ===== 리사이즈 =====
  window.addEventListener('resize', () => {
    if (projectCreated && currentConfig) {
      drawGrid(currentConfig);
    }
  });
