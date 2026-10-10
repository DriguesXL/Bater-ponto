/**
 * Lógica do Painel Administrativo
 */

let allEmployeesCache = [];
let currentEditingRecordId = null;

async function initAdminApp() {
  setupAdminTabs();
  await loadDashboardKPIs();
  await loadAdminEmployees();
  await loadAdminRecords();
  await loadAdminSettings();
}

/**
 * Controle de abas da área administrativa
 */
function setupAdminTabs() {
  const tabs = document.querySelectorAll('.admin-tab-btn');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.admin-tab-content').forEach(c => c.classList.remove('active'));

      tab.classList.add('active');
      const targetId = tab.getAttribute('data-target');
      const content = document.getElementById(targetId);
      if (content) {
        content.classList.add('active');
      }

      // Atualiza dados específicos da aba ao entrar
      if (targetId === 'tabAdminDashboard') loadDashboardKPIs();
      if (targetId === 'tabAdminRecords') loadAdminRecords();
      if (targetId === 'tabAdminEmployees') loadAdminEmployees();
      if (targetId === 'tabAdminSettings') {
        loadAdminSettings();
        loadEmailLogs();
      }
    });
  });
}

/**
 * Carrega indicadores do Dashboard e lista de funcionários trabalhando agora
 */
async function loadDashboardKPIs() {
  try {
    const data = await api.get('/admin/dashboard');

    document.getElementById('kpiActiveEmployees').textContent = data.activeEmployeesCount;
    document.getElementById('kpiWorkingNow').textContent = data.workingNowCount;
    document.getElementById('kpiCompletedToday').textContent = data.completedTodayCount;
    document.getElementById('kpiMonthTotal').textContent = data.monthCompanyFormatted;

    // Renderiza lista de quem está trabalhando ao vivo
    const workingNowTbody = document.getElementById('workingNowTableBody');
    if (workingNowTbody) {
      if (!data.workingNow || data.workingNow.length === 0) {
        workingNowTbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding: 20px; color: var(--text-muted);">Nenhum colaborador com expediente aberto no momento.</td></tr>`;
      } else {
        workingNowTbody.innerHTML = data.workingNow.map(w => `
          <tr>
            <td style="font-weight: 600; color: #fff;">
              ${w.name}
              <div style="font-size: 0.75rem; color: var(--text-muted);">${w.employee_code} • ${w.position || 'Sem cargo'}</div>
            </td>
            <td>${formatTimeBR(w.clock_in)}</td>
            <td>
              ${w.inLunchBreak 
                ? '<span style="color:var(--accent-orange); font-weight:600;">🍽️ Em Almoço</span>' 
                : '<span style="color:var(--accent-green); font-weight:600;"><span class="status-indicator-dot" style="display:inline-block; margin-right:4px;"></span> Ativo</span>'}
            </td>
            <td style="font-weight:700; color:var(--primary-light);">${w.elapsedFormatted}</td>
            <td><span class="token-code">${w.unique_code}</span></td>
          </tr>
        `).join('');
      }
    }
  } catch (err) {
    console.error('Erro ao carregar Dashboard:', err);
  }
}

/**
 * Gestão de Funcionários - Listagem
 */
async function loadAdminEmployees() {
  try {
    const search = document.getElementById('searchEmployeeInput')?.value || '';
    const res = await api.get(`/admin/employees?search=${encodeURIComponent(search)}`);
    allEmployeesCache = res.employees || [];

    // Popula select de filtros de ponto
    const empSelect = document.getElementById('filterEmployeeSelect');
    if (empSelect) {
      const currentVal = empSelect.value;
      empSelect.innerHTML = `<option value="">Todos os Funcionários</option>` + 
        allEmployeesCache.map(e => `<option value="${e.id}">${e.name} (${e.employee_code})</option>`).join('');
      empSelect.value = currentVal;
    }

    // Popula tabela de funcionários
    const tbody = document.getElementById('employeesTableBody');
    if (tbody) {
      if (allEmployeesCache.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding: 24px; color: var(--text-muted);">Nenhum colaborador encontrado.</td></tr>`;
        return;
      }

      tbody.innerHTML = allEmployeesCache.map(e => `
        <tr>
          <td style="font-weight: 600; color: #fff;">
            ${e.name}
            <div style="font-size: 0.75rem; color: var(--text-muted);">${e.email || 'Sem e-mail'}</div>
          </td>
          <td><span class="token-code">${e.employee_code}</span></td>
          <td>${e.position || '-'}</td>
          <td>${e.department || '-'}</td>
          <td>
            ${e.is_active 
              ? '<span style="color:var(--accent-green); font-weight:600;">● Ativo</span>' 
              : '<span style="color:var(--accent-red); font-weight:600;">● Inativo</span>'}
          </td>
          <td>
            <button class="btn btn-outline btn-sm" onclick="openEditEmployeeModal(${e.id})">Editar / Senha</button>
          </td>
        </tr>
      `).join('');
    }
  } catch (err) {
    Toast.error('Erro ao listar funcionários: ' + err.message);
  }
}

/**
 * Modal Adicionar Funcionário
 */
function openAddEmployeeModal() {
  document.getElementById('formAddEmployee').reset();
  // Sugere um código de matrícula
  const nextNum = String(allEmployeesCache.length + 1).padStart(3, '0');
  document.getElementById('addEmpCode').value = `FUNC${nextNum}`;
  document.getElementById('modalAddEmployee').classList.add('active');
}

function closeAddEmployeeModal() {
  document.getElementById('modalAddEmployee').classList.remove('active');
}

async function handleSaveNewEmployee(e) {
  e.preventDefault();
  const name = document.getElementById('addEmpName').value.trim();
  const employee_code = document.getElementById('addEmpCode').value.trim();
  const email = document.getElementById('addEmpEmail').value.trim();
  const password = document.getElementById('addEmpPassword').value.trim();
  const position = document.getElementById('addEmpPosition').value.trim();
  const department = document.getElementById('addEmpDepartment').value.trim();

  try {
    await api.post('/admin/employees', { name, employee_code, email, password, position, department });
    Toast.success('Funcionário cadastrado com sucesso!');
    closeAddEmployeeModal();
    await loadAdminEmployees();
    await loadDashboardKPIs();
  } catch (err) {
    Toast.error(err.message);
  }
}

/**
 * Modal Editar Funcionário
 */
function openEditEmployeeModal(id) {
  const emp = allEmployeesCache.find(e => e.id === id);
  if (!emp) return;

  document.getElementById('editEmpId').value = emp.id;
  document.getElementById('editEmpName').value = emp.name;
  document.getElementById('editEmpCode').value = emp.employee_code;
  document.getElementById('editEmpEmail').value = emp.email || '';
  document.getElementById('editEmpPosition').value = emp.position || '';
  document.getElementById('editEmpDepartment').value = emp.department || '';
  document.getElementById('editEmpActive').value = emp.is_active ? '1' : '0';
  document.getElementById('editEmpNewPass').value = '';

  document.getElementById('modalEditEmployee').classList.add('active');
}

function closeEditEmployeeModal() {
  document.getElementById('modalEditEmployee').classList.remove('active');
}

async function handleUpdateEmployee(e) {
  e.preventDefault();
  const id = document.getElementById('editEmpId').value;
  const name = document.getElementById('editEmpName').value.trim();
  const email = document.getElementById('editEmpEmail').value.trim();
  const position = document.getElementById('editEmpPosition').value.trim();
  const department = document.getElementById('editEmpDepartment').value.trim();
  const is_active = document.getElementById('editEmpActive').value === '1';
  const new_password = document.getElementById('editEmpNewPass').value.trim();

  try {
    await api.put(`/admin/employees/${id}`, { name, email, position, department, is_active, new_password });
    Toast.success('Colaborador atualizado com sucesso!');
    closeEditEmployeeModal();
    await loadAdminEmployees();
    await loadDashboardKPIs();
  } catch (err) {
    Toast.error(err.message);
  }
}

/**
 * Relatórios de Registros de Ponto
 */
async function loadAdminRecords() {
  try {
    const empId = document.getElementById('filterEmployeeSelect')?.value || '';
    const startDate = document.getElementById('filterStartDate')?.value || '';
    const endDate = document.getElementById('filterEndDate')?.value || '';
    const status = document.getElementById('filterStatusSelect')?.value || '';
    const search = document.getElementById('filterSearchRecord')?.value || '';

    const queryParams = new URLSearchParams();
    if (empId) queryParams.append('employee_id', empId);
    if (startDate) queryParams.append('start_date', startDate);
    if (endDate) queryParams.append('end_date', endDate);
    if (status) queryParams.append('status', status);
    if (search) queryParams.append('search', search);

    const res = await api.get(`/admin/records?${queryParams.toString()}`);
    const tbody = document.getElementById('adminRecordsTableBody');
    if (!tbody) return;

    if (!res.records || res.records.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding: 24px; color: var(--text-muted);">Nenhum registro encontrado para os filtros selecionados.</td></tr>`;
      return;
    }

    tbody.innerHTML = res.records.map(r => `
      <tr>
        <td style="font-weight: 600; color: #fff;">
          ${r.employee_name}
          <div style="font-size: 0.75rem; color: var(--text-muted);">${r.employee_code}</div>
        </td>
        <td>${formatDateBR(r.record_date)}</td>
        <td>${formatTimeBR(r.clock_in)}</td>
        <td>${r.lunch_start ? `${formatTimeBR(r.lunch_start)} - ${r.lunch_end ? formatTimeBR(r.lunch_end) : '...'}` : '-'}</td>
        <td>${r.clock_out ? formatTimeBR(r.clock_out) : '<span style="color:var(--accent-orange)">Em aberto</span>'}</td>
        <td style="font-weight: 700; color: var(--primary-light);">${r.totalFormatted || '--:--'}</td>
        <td>
          ${r.status === 'completed' 
            ? '<span class="btn-sm" style="background:rgba(99, 102, 241, 0.2); color:#a5b4fc;">Encerrado</span>' 
            : '<span class="btn-sm" style="background:rgba(16, 185, 129, 0.2); color:#34d399;">Ativo</span>'}
        </td>
        <td>
          <div style="display:flex; gap:6px;">
            <button class="btn btn-outline btn-sm" onclick="openCorrectRecordModal(${r.id})" title="Corrigir Registro com Auditoria">✏️ Ajustar</button>
            <button class="btn btn-ghost btn-sm" onclick="openAuditModal(${r.id})" title="Ver Trilha de Auditoria">🔍 Auditoria</button>
          </div>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    Toast.error('Erro ao carregar registros: ' + err.message);
  }
}

/**
 * Exportação em CSV
 */
function handleExportCSV() {
  const empId = document.getElementById('filterEmployeeSelect')?.value || '';
  const startDate = document.getElementById('filterStartDate')?.value || '';
  const endDate = document.getElementById('filterEndDate')?.value || '';
  const status = document.getElementById('filterStatusSelect')?.value || '';
  const search = document.getElementById('filterSearchRecord')?.value || '';

  const queryParams = new URLSearchParams();
  if (empId) queryParams.append('employee_id', empId);
  if (startDate) queryParams.append('start_date', startDate);
  if (endDate) queryParams.append('end_date', endDate);
  if (status) queryParams.append('status', status);
  if (search) queryParams.append('search', search);

  const token = Auth.getToken();
  // Dispara download direto com cabeçalho
  fetch(`/api/admin/records/export-csv?${queryParams.toString()}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  })
  .then(res => res.blob())
  .then(blob => {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `relatorio_pontos_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    Toast.success('Relatório CSV exportado com sucesso!');
  })
  .catch(err => Toast.error('Erro ao exportar CSV: ' + err.message));
}

/**
 * Modal de Correção Auditada de Registro
 */
async function openCorrectRecordModal(recordId) {
  currentEditingRecordId = recordId;
  const res = await api.get(`/admin/records`);
  const record = res.records.find(r => r.id === recordId);
  if (!record) return;

  const toInputDatetime = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  document.getElementById('correctRecordEmployee').textContent = `${record.employee_name} (${record.employee_code})`;
  document.getElementById('correctRecordDate').textContent = formatDateBR(record.record_date);
  document.getElementById('correctClockIn').value = toInputDatetime(record.clock_in);
  document.getElementById('correctLunchStart').value = toInputDatetime(record.lunch_start);
  document.getElementById('correctLunchEnd').value = toInputDatetime(record.lunch_end);
  document.getElementById('correctClockOut').value = toInputDatetime(record.clock_out);
  document.getElementById('correctJustification').value = '';

  document.getElementById('modalCorrectRecord').classList.add('active');
}

function closeCorrectRecordModal() {
  document.getElementById('modalCorrectRecord').classList.remove('active');
  currentEditingRecordId = null;
}

async function handleSaveRecordCorrection(e) {
  e.preventDefault();
  if (!currentEditingRecordId) return;

  const toIsoOrNull = (val) => val ? new Date(val).toISOString() : null;

  const clock_in = toIsoOrNull(document.getElementById('correctClockIn').value);
  const lunch_start = toIsoOrNull(document.getElementById('correctLunchStart').value);
  const lunch_end = toIsoOrNull(document.getElementById('correctLunchEnd').value);
  const clock_out = toIsoOrNull(document.getElementById('correctClockOut').value);
  const justification = document.getElementById('correctJustification').value.trim();

  try {
    await api.put(`/admin/records/${currentEditingRecordId}/correct`, {
      clock_in,
      lunch_start,
      lunch_end,
      clock_out,
      justification,
    });
    Toast.success('Registro corrigido com sucesso e auditado!');
    closeCorrectRecordModal();
    await loadAdminRecords();
    await loadDashboardKPIs();
  } catch (err) {
    Toast.error(err.message);
  }
}

/**
 * Modal de Trilha de Auditoria
 */
async function openAuditModal(recordId) {
  try {
    const res = await api.get(`/admin/records/${recordId}/audit`);
    const container = document.getElementById('auditTimelineContent');

    if (!res.audits || res.audits.length === 0) {
      container.innerHTML = `<div style="text-align:center; padding: 20px; color: var(--text-muted);">Nenhuma correção ou alteração foi realizada neste registro. Horários originais íntegros.</div>`;
    } else {
      container.innerHTML = res.audits.map(a => `
        <div style="background: var(--bg-surface); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); padding: 14px; margin-bottom: 12px;">
          <div style="display:flex; justify-content:space-between; margin-bottom: 6px;">
            <strong style="color:var(--primary-light); font-size:0.85rem;">Alterado por: ${a.admin_name}</strong>
            <span style="font-size:0.75rem; color:var(--text-muted);">${new Date(a.created_at).toLocaleString('pt-BR')}</span>
          </div>
          <div style="font-size:0.85rem; color:#fff; margin-bottom: 6px;">
            Campo modificado: <strong style="color:#f59e0b;">${a.field_changed}</strong>
          </div>
          <div style="font-size:0.8rem; color:var(--text-secondary); background:rgba(0,0,0,0.2); padding: 8px; border-radius: 4px; margin-bottom: 6px;">
            De: <code>${a.old_value || 'Vazio'}</code> &rarr; Para: <code>${a.new_value || 'Vazio'}</code>
          </div>
          <div style="font-size:0.82rem; color:#cbd5e1;">
            <strong>Justificativa:</strong> "${a.justification}"
          </div>
        </div>
      `).join('');
    }

    document.getElementById('modalAuditLog').classList.add('active');
  } catch (err) {
    Toast.error('Erro ao carregar auditoria: ' + err.message);
  }
}

function closeAuditModal() {
  document.getElementById('modalAuditLog').classList.remove('active');
}

/**
 * Configurações do Sistema & Notificações de E-mail
 */
async function loadAdminSettings() {
  try {
    const res = await api.get('/settings');
    const s = res.settings;

    if (document.getElementById('settingAdminEmail')) {
      document.getElementById('settingAdminEmail').value = s.notification_email || '';
      document.getElementById('settingCompanyName').value = s.company_name || '';
      document.getElementById('settingDailyReportEnabled').checked = s.daily_report_enabled;
      document.getElementById('settingSmtpHost').value = s.smtp_host || '';
      document.getElementById('settingSmtpPort').value = s.smtp_port || '';
      document.getElementById('settingSmtpUser').value = s.smtp_user || '';
    }
  } catch (err) {
    console.error('Erro ao carregar configurações:', err);
  }
}

async function handleSaveSettings(e) {
  e.preventDefault();
  const notification_email = document.getElementById('settingAdminEmail').value.trim();
  const company_name = document.getElementById('settingCompanyName').value.trim();
  const daily_report_enabled = document.getElementById('settingDailyReportEnabled').checked;
  const smtp_host = document.getElementById('settingSmtpHost').value.trim();
  const smtp_port = document.getElementById('settingSmtpPort').value.trim();
  const smtp_user = document.getElementById('settingSmtpUser').value.trim();
  const smtp_pass = document.getElementById('settingSmtpPass').value.trim();

  try {
    await api.put('/settings', {
      notification_email,
      company_name,
      daily_report_enabled,
      smtp_host,
      smtp_port,
      smtp_user,
      smtp_pass,
    });
    Toast.success('Configurações salvas com sucesso!');
  } catch (err) {
    Toast.error(err.message);
  }
}

async function handleTestEmail() {
  const btn = document.getElementById('btnTestEmail');
  btn.disabled = true;
  btn.textContent = 'Enviando teste...';

  try {
    const targetEmail = document.getElementById('settingAdminEmail').value.trim();
    const res = await api.post('/settings/test-email', { recipient: targetEmail });
    Toast.success(res.message);
    await loadEmailLogs();
  } catch (err) {
    Toast.error(err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = '✉️ Disparar E-mail de Teste Agora';
  }
}

async function handleTriggerDailyReport() {
  const btn = document.getElementById('btnTriggerDailyReport');
  btn.disabled = true;
  btn.textContent = 'Gerando relatório...';

  try {
    const res = await api.post('/settings/send-daily-report', {});
    Toast.success(res.message);
    await loadEmailLogs();
  } catch (err) {
    Toast.error(err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = '📊 Disparar Relatório Diário de Hoje por E-mail';
  }
}

async function loadEmailLogs() {
  try {
    const res = await api.get('/settings/email-logs');
    const tbody = document.getElementById('emailLogsTableBody');
    if (!tbody) return;

    if (!res.logs || res.logs.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding: 20px; color: var(--text-muted);">Nenhum envio registrado até o momento.</td></tr>`;
      return;
    }

    tbody.innerHTML = res.logs.map(l => `
      <tr>
        <td style="font-size:0.8rem; color:var(--text-muted);">${new Date(l.created_at).toLocaleString('pt-BR')}</td>
        <td style="color:#fff; font-weight:500;">${l.recipient}</td>
        <td>${l.subject}</td>
        <td>
          ${l.status === 'sent' 
            ? '<span style="color:var(--accent-green); font-weight:600;">✓ Enviado</span>' 
            : `<span style="color:var(--accent-red); font-weight:600;" title="${l.error_message || ''}">✕ Falhou (${l.error_message ? l.error_message.slice(0, 30) + '...' : 'Erro'})</span>`}
        </td>
        <td><span class="token-code">${l.email_type}</span></td>
      </tr>
    `).join('');
  } catch (err) {
    console.error('Erro ao buscar logs de e-mail:', err);
  }
}
