/**
 * Lógica do Funcionário - Bater Ponto em Tempo Real, Relógio e Histórico
 */

let serverTimeOffsetMs = 0;
let liveTimerInterval = null;
let currentRecordData = null;

// Inicializa a sincronização do relógio e os dados do ponto
async function initEmployeeApp() {
  await syncServerTime();
  startClockTicker();
  await loadPunchStatus();
  await loadEmployeeHistory();
}

/**
 * Sincroniza a diferença entre o relógio da máquina do usuário e o servidor
 */
async function syncServerTime() {
  try {
    const beforeReq = Date.now();
    const data = await api.get('/punch/server-time');
    const afterReq = Date.now();
    const networkLatency = (afterReq - beforeReq) / 2;
    const serverTimestamp = data.timestamp + networkLatency;
    serverTimeOffsetMs = serverTimestamp - Date.now();
  } catch (err) {
    console.warn('[CLOCK] Erro ao sincronizar hora do servidor, usando local:', err);
    serverTimeOffsetMs = 0;
  }
}

/**
 * Atualiza o relógio digital segundo a segundo
 */
function startClockTicker() {
  function tick() {
    const now = new Date(Date.now() + serverTimeOffsetMs);
    
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');

    const clockEl = document.getElementById('digitalClockDisplay');
    if (clockEl) {
      clockEl.innerHTML = `${hours}:${minutes} <span class="seconds">:${seconds}</span>`;
    }

    const dateEl = document.getElementById('currentDateDisplay');
    if (dateEl) {
      const options = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' };
      const str = now.toLocaleDateString('pt-BR', options);
      dateEl.textContent = str.charAt(0).toUpperCase() + str.slice(1);
    }
  }

  tick();
  setInterval(tick, 1000);
}

/**
 * Carrega o status do dia para o funcionário logado
 */
async function loadPunchStatus() {
  try {
    const data = await api.get('/punch/status');
    currentRecordData = data.activeRecord;

    renderStatusUI(data.status, data.activeRecord, data.summary);
  } catch (err) {
    Toast.error('Erro ao verificar status do expediente: ' + err.message);
  }
}

/**
 * Renderiza o painel visual e os botões com base no status do expediente
 */
function renderStatusUI(status, record, summary) {
  const badgeContainer = document.getElementById('punchStatusBadge');
  const btnClockIn = document.getElementById('btnClockIn');
  const btnLunch = document.getElementById('btnLunch');
  const btnClockOut = document.getElementById('btnClockOut');

  // Atualiza métricas semanais e mensais
  if (summary) {
    document.getElementById('metricTodayVal').textContent = summary.todayFormatted;
    document.getElementById('metricWeekVal').textContent = summary.weekFormatted;
    document.getElementById('metricMonthVal').textContent = summary.monthFormatted;
  }

  // Atualiza horários no grid
  document.getElementById('slotClockIn').textContent = record?.clock_in ? formatTimeBR(record.clock_in) : '--:--';
  document.getElementById('slotLunchStart').textContent = record?.lunch_start ? formatTimeBR(record.lunch_start) : '--:--';
  document.getElementById('slotLunchEnd').textContent = record?.lunch_end ? formatTimeBR(record.lunch_end) : '--:--';
  document.getElementById('slotClockOut').textContent = record?.clock_out ? formatTimeBR(record.clock_out) : '--:--';

  // Reseta classes do badge
  badgeContainer.className = `status-badge-container status-${status}`;

  // Para contador anterior se houver
  if (liveTimerInterval) {
    clearInterval(liveTimerInterval);
    liveTimerInterval = null;
  }

  if (status === 'not_started') {
    badgeContainer.innerHTML = `<span class="status-indicator-dot"></span><span>Expediente Não Iniciado</span>`;
    btnClockIn.disabled = false;
    btnLunch.disabled = true;
    btnLunch.innerHTML = `<span>🍽️</span> Iniciar Almoço`;
    btnClockOut.disabled = true;
    document.getElementById('liveTimerDisplay').textContent = '00h 00m';
  } else if (status === 'in_progress') {
    badgeContainer.innerHTML = `<span class="status-indicator-dot"></span><span>Expediente em Andamento</span>`;
    btnClockIn.disabled = true;
    
    // Almoço: verifica se já realizou intervalo
    if (record?.lunch_start && record?.lunch_end) {
      btnLunch.disabled = true;
      btnLunch.innerHTML = `<span>🍽️</span> Intervalo Concluído`;
    } else {
      btnLunch.disabled = false;
      btnLunch.innerHTML = `<span>🍽️</span> Pausar para Almoço`;
      btnLunch.onclick = handleLunchStart;
    }

    btnClockOut.disabled = false;
    startLiveWorkingCounter(record);
  } else if (status === 'lunch_break') {
    badgeContainer.innerHTML = `<span class="status-indicator-dot"></span><span>Intervalo de Almoço / Pausa</span>`;
    btnClockIn.disabled = true;
    btnLunch.disabled = false;
    btnLunch.innerHTML = `<span>↩️</span> Retornar do Almoço`;
    btnLunch.onclick = handleLunchEnd;
    btnClockOut.disabled = false; // Permite encerrar direto se necessário
    document.getElementById('liveTimerDisplay').textContent = (summary?.todayFormatted || '00h 00m') + ' (Em pausa)';
  } else if (status === 'completed') {
    badgeContainer.innerHTML = `<span class="status-indicator-dot"></span><span>Expediente Encerrado</span>`;
    btnClockIn.disabled = true;
    btnLunch.disabled = true;
    btnClockOut.disabled = true;
    document.getElementById('liveTimerDisplay').textContent = summary?.todayFormatted || '00h 00m';
  }
}

/**
 * Contador em tempo real que incrementa o tempo trabalhado enquanto em andamento
 */
function startLiveWorkingCounter(record) {
  if (!record || !record.clock_in) return;

  function update() {
    const now = Date.now() + serverTimeOffsetMs;
    const inTime = new Date(record.clock_in).getTime();

    let lunchDeductionMs = 0;
    if (record.lunch_start && record.lunch_end) {
      lunchDeductionMs = new Date(record.lunch_end).getTime() - new Date(record.lunch_start).getTime();
    }

    let diffMs = now - inTime - lunchDeductionMs;
    if (diffMs < 0) diffMs = 0;

    const totalSecs = Math.floor(diffMs / 1000);
    const hrs = Math.floor(totalSecs / 3600);
    const mins = Math.floor((totalSecs % 3600) / 60);
    const secs = totalSecs % 60;

    const formatted = `${String(hrs).padStart(2, '0')}h ${String(mins).padStart(2, '0')}m ${String(secs).padStart(2, '0')}s`;
    const timerEl = document.getElementById('liveTimerDisplay');
    if (timerEl) {
      timerEl.textContent = formatted;
    }
  }

  update();
  liveTimerInterval = setInterval(update, 1000);
}

/**
 * Ação: Iniciar Expediente
 */
async function handleClockIn() {
  const btn = document.getElementById('btnClockIn');
  btn.disabled = true;

  try {
    const res = await api.post('/punch/clock-in', {});
    Toast.success('Expediente iniciado com sucesso! Bom trabalho!');
    await loadPunchStatus();
    await loadEmployeeHistory();
  } catch (err) {
    Toast.error(err.message);
    btn.disabled = false;
  }
}

/**
 * Ação: Iniciar Almoço
 */
async function handleLunchStart() {
  try {
    await api.post('/punch/lunch-start', {});
    Toast.info('Intervalo de almoço registrado.');
    await loadPunchStatus();
  } catch (err) {
    Toast.error(err.message);
  }
}

/**
 * Ação: Retornar do Almoço
 */
async function handleLunchEnd() {
  try {
    await api.post('/punch/lunch-end', {});
    Toast.success('Retorno do almoço registrado. Bom retorno ao trabalho!');
    await loadPunchStatus();
  } catch (err) {
    Toast.error(err.message);
  }
}

/**
 * Ação: Abrir Modal para Confirmação de Encerramento
 */
function handleOpenClockOutModal() {
  const modal = document.getElementById('modalConfirmClockOut');
  if (modal) {
    modal.classList.add('active');
  }
}

function handleCloseClockOutModal() {
  const modal = document.getElementById('modalConfirmClockOut');
  if (modal) {
    modal.classList.remove('active');
  }
}

/**
 * Ação: Confirmar Encerramento de Expediente
 */
async function handleConfirmClockOut() {
  handleCloseClockOutModal();
  const btn = document.getElementById('btnClockOut');
  btn.disabled = true;

  try {
    const res = await api.post('/punch/clock-out', {});
    Toast.success(`Expediente encerrado! Total trabalhado: ${res.totalFormatted}. E-mail enviado ao gestor.`);
    await loadPunchStatus();
    await loadEmployeeHistory();
  } catch (err) {
    Toast.error(err.message);
    btn.disabled = false;
  }
}

/**
 * Carrega a tabela de histórico recente do funcionário
 */
async function loadEmployeeHistory() {
  try {
    const data = await api.get('/punch/history?limit=10');
    const tbody = document.getElementById('employeeHistoryTableBody');
    if (!tbody) return;

    if (!data.history || data.history.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding: 24px; color: var(--text-muted);">Nenhum registro anterior localizado.</td></tr>`;
      return;
    }

    tbody.innerHTML = data.history.map(r => `
      <tr>
        <td style="font-weight: 600; color: #fff;">${formatDateBR(r.record_date)}</td>
        <td>${formatTimeBR(r.clock_in)}</td>
        <td>${r.lunch_start ? `${formatTimeBR(r.lunch_start)} - ${r.lunch_end ? formatTimeBR(r.lunch_end) : '...'}` : '-'}</td>
        <td>${r.clock_out ? formatTimeBR(r.clock_out) : '<span style="color:var(--accent-orange)">Em aberto</span>'}</td>
        <td style="font-weight: 700; color: var(--primary-light);">${r.totalFormatted || '--:--'}</td>
        <td><span class="token-code">${r.unique_code}</span></td>
      </tr>
    `).join('');
  } catch (err) {
    console.error('Erro ao buscar histórico:', err);
  }
}
