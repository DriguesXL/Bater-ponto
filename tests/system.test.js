const http = require('http');
const fs = require('fs');
const path = require('path');

// Os testes sempre usam uma base própria para não alterar registros locais.
const testDatabasePath = path.join(__dirname, '..', 'data', 'test-ponto.sqlite');
process.env.SQLITE_DB_PATH = testDatabasePath;
if (fs.existsSync(testDatabasePath)) fs.unlinkSync(testDatabasePath);

const { initializeDatabase } = require('../database/init');
const db = require('../database/db');

// Inicia um servidor de teste temporário em porta aleatória
async function runTests() {
  console.log('========================================================');
  console.log('🧪 INICIANDO TESTES AUTOMATIZADOS DO SISTEMA DE PONTO');
  console.log('========================================================\n');

  // Inicializa banco
  await initializeDatabase();

  const express = require('express');
  const app = express();
  app.use(express.json());

  app.use('/api/auth', require('../routes/authRoutes'));
  app.use('/api/punch', require('../routes/punchRoutes'));
  app.use('/api/admin', require('../routes/adminRoutes'));
  app.use('/api/settings', require('../routes/settingsRoutes'));

  const server = http.createServer(app);
  await new Promise(res => server.listen(0, res));
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}/api`;

  let adminToken = '';
  let employeeToken = '';
  let testRecordId = null;

  async function request(endpoint, options = {}, token = '') {
    const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(`${baseUrl}${endpoint}`, { ...options, headers });
    const data = await res.json().catch(() => ({}));
    return { status: res.status, ok: res.ok, data };
  }

  let passed = 0;
  let total = 0;

  function assert(condition, message) {
    total++;
    if (condition) {
      console.log(`✅ [PASS] ${message}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${message}`);
      throw new Error(`Falha no teste: ${message}`);
    }
  }

  try {
    // TESTE 1: Sincronização do Relógio do Servidor
    console.log('\n--- 1. Horário do Servidor ---');
    const sTime = await request('/punch/server-time');
    assert(sTime.ok && sTime.data.timestamp, 'Servidor retorna carimbo de tempo válido');

    // TESTE 2: Login do Administrador
    console.log('\n--- 2. Autenticação ---');
    const adminLogin = await request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ identifier: 'ADM001', password: 'admin123' })
    });
    assert(adminLogin.ok && adminLogin.data.token && adminLogin.data.user.role === 'admin', 'Login do Administrador com sucesso');
    adminToken = adminLogin.data.token;

    // TESTE 3: Login do Funcionário
    const empLogin = await request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ identifier: 'FUNC001', password: '123456' })
    });
    assert(empLogin.ok && empLogin.data.token && empLogin.data.user.role === 'employee', 'Login do Funcionário com sucesso');
    employeeToken = empLogin.data.token;

    // TESTE 4: Bloqueio de Login com Senha Incorreta
    const badLogin = await request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ identifier: 'FUNC001', password: 'senha_errada' })
    });
    assert(badLogin.status === 401, 'Bloqueio de credenciais inválidas');

    // TESTE 5: Status do Ponto
    console.log('\n--- 3. Fluxo de Registro de Ponto ---');
    const statusBefore = await request('/punch/status', {}, employeeToken);
    assert(statusBefore.ok && ['not_started', 'in_progress', 'lunch_break', 'completed'].includes(statusBefore.data.status), 'Verificação de status do colaborador');

    // Para garantir um teste limpo, limpamos registros anteriores do FUNC001
    await db.query(`DELETE FROM time_records WHERE user_id = $1`, [empLogin.data.user.id]);

    // TESTE 6: Iniciar Expediente (Clock In)
    const clockInRes = await request('/punch/clock-in', { method: 'POST' }, employeeToken);
    assert(clockInRes.ok && clockInRes.data.record && clockInRes.data.record.status === 'in_progress', 'Iniciar expediente registra status in_progress e código verificador');
    testRecordId = clockInRes.data.record.id;
    assert(clockInRes.data.record.unique_code.startsWith('REG-'), 'Geração de comprovante único do expediente');

    // TESTE 7: Bloqueio de Expediente Duplo
    const doubleClockIn = await request('/punch/clock-in', { method: 'POST' }, employeeToken);
    assert(doubleClockIn.status === 400, 'Impedir início de expediente duplicado em andamento');

    // TESTE 8: Iniciar Almoço / Intervalo
    const lunchStartRes = await request('/punch/lunch-start', { method: 'POST' }, employeeToken);
    assert(lunchStartRes.ok, 'Iniciar intervalo de almoço com sucesso');

    // TESTE 9: Retornar do Almoço
    const lunchEndRes = await request('/punch/lunch-end', { method: 'POST' }, employeeToken);
    assert(lunchEndRes.ok, 'Retornar do almoço com sucesso');

    // TESTE 10: Encerrar Expediente (Clock Out)
    const clockOutRes = await request('/punch/clock-out', { method: 'POST' }, employeeToken);
    assert(clockOutRes.ok && clockOutRes.data.record.status === 'completed', 'Encerrar expediente com cálculo de horas e status completed');

    // TESTE 11: Histórico Individual do Funcionário
    const historyRes = await request('/punch/history', {}, employeeToken);
    assert(historyRes.ok && Array.isArray(historyRes.data.history) && historyRes.data.history.length > 0, 'Histórico pessoal do funcionário carregado com sucesso');

    // TESTE 12: Painel Administrativo - Dashboard KPIs
    console.log('\n--- 4. Painel Administrativo & Gestão ---');
    const dashRes = await request('/admin/dashboard', {}, adminToken);
    assert(dashRes.ok && typeof dashRes.data.activeEmployeesCount === 'number', 'Dashboard administrativo carrega métricas consolidadas');

    // TESTE 13: Bloqueio de Acesso Admin para Funcionário Comum
    const forbiddenRes = await request('/admin/dashboard', {}, employeeToken);
    assert(forbiddenRes.status === 403, 'Acesso a rotas administrativas bloqueado para funcionário sem perfil admin');

    // TESTE 14: Cadastrar Novo Colaborador
    const uniqueMatricula = 'TEST' + Math.floor(Math.random() * 9000 + 1000);
    const newEmpRes = await request('/admin/employees', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Colaborador Teste Automatizado',
        employee_code: uniqueMatricula,
        email: `teste.${uniqueMatricula.toLowerCase()}@empresa.com.br`,
        password: 'senha123teste',
        position: 'Analista de QA',
        department: 'Qualidade'
      })
    }, adminToken);
    assert(newEmpRes.ok, 'Cadastro de novo colaborador pelo administrador');

    // TESTE 15: Correção Auditada de Registro de Ponto com Justificativa
    const correctRes = await request(`/admin/records/${testRecordId}/correct`, {
      method: 'PUT',
      body: JSON.stringify({
        clock_in: new Date(Date.now() - 8 * 3600000).toISOString(),
        clock_out: new Date().toISOString(),
        justification: 'Ajuste solicitado pelo gestor direto devido a problema de conexão na chegada.'
      })
    }, adminToken);
    assert(correctRes.ok, 'Correção de registro de ponto auditada com justificativa obrigatória');

    // TESTE 16: Consulta da Trilha de Auditoria
    const auditRes = await request(`/admin/records/${testRecordId}/audit`, {}, adminToken);
    assert(auditRes.ok && auditRes.data.audits.length > 0 && auditRes.data.audits[0].justification.includes('Ajuste solicitado'), 'Trilha de auditoria gravou justificativa e autor da alteração');

    // TESTE 17: Configurações e Logs de E-mail
    console.log('\n--- 5. Notificações e Configurações ---');
    const settingsRes = await request('/settings', {}, adminToken);
    assert(settingsRes.ok && settingsRes.data.settings.notification_email, 'Consulta de configurações de e-mail e empresa');

    const emailLogsRes = await request('/settings/email-logs', {}, adminToken);
    assert(emailLogsRes.ok && Array.isArray(emailLogsRes.data.logs), 'Consulta de logs de envio de e-mails corporativos');

    console.log(`\n========================================================`);
    console.log(`🎉 TODOS OS ${passed} DE ${total} TESTES PASSARAM COM SUCESSO!`);
    console.log(`========================================================\n`);

  } finally {
    server.close();
    await new Promise(r => setTimeout(r, 600));
    await db.close();
    if (fs.existsSync(testDatabasePath)) fs.unlinkSync(testDatabasePath);
  }
}

runTests().catch(err => {
  console.error('\n❌ ERRO FATAL NOS TESTES:', err);
  process.exit(1);
});
