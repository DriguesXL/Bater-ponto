const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const db = require('../database/db');
const { authenticateToken, requireAdmin } = require('../middlewares/authMiddleware');
const { calculateWorkMinutes, formatMinutes, getMonthRange } = require('../services/calculations');

const isPostgres = db.getClientType() === 'postgres';

// Todas as rotas deste router exigem autenticação e privilégio de administrador
router.use(authenticateToken, requireAdmin);

/**
 * Retorna a data corrente em formato YYYY-MM-DD
 */
function getTodayString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * GET /api/admin/dashboard
 * Visão geral dos indicadores chave de desempenho em tempo real
 */
router.get('/dashboard', async (req, res) => {
  try {
    const todayStr = getTodayString();
    const now = new Date();

    const isPostgres = db.getClientType() === 'postgres';
    const activeCond = isPostgres ? 'TRUE' : '1';

    // 1. Total de funcionários ativos
    const employeesCountQuery = await db.query(
      `SELECT COUNT(*) as count FROM users WHERE role = 'employee' AND is_active = ${activeCond}`
    );
    const activeEmployeesCount = parseInt(employeesCountQuery.rows[0]?.count, 10) || 0;

    // 2. Funcionários trabalhando agora (ao vivo!)
    const activePunchQuery = await db.query(
      `SELECT r.id, r.user_id, r.record_date, r.clock_in, r.lunch_start, r.lunch_end, r.status, r.unique_code,
              u.name, u.employee_code, u.position, u.department
       FROM time_records r
       JOIN users u ON u.id = r.user_id
       WHERE r.record_date = $1 AND r.status IN ('in_progress', 'lunch_break')
       ORDER BY r.clock_in ASC`,
      [todayStr]
    );

    const workingNow = activePunchQuery.rows.map((row) => {
      const calc = calculateWorkMinutes(row.clock_in, null, row.lunch_start, row.lunch_end, now);
      return {
        ...row,
        elapsedMinutes: calc.totalMinutes,
        elapsedFormatted: formatMinutes(calc.totalMinutes),
        inLunchBreak: row.status === 'lunch_break',
      };
    });

    // 3. Funcionários que já encerraram hoje
    const completedTodayQuery = await db.query(
      `SELECT r.id, r.user_id, r.record_date, r.clock_in, r.clock_out, r.total_minutes, r.status, r.unique_code,
              u.name, u.employee_code, u.position
       FROM time_records r
       JOIN users u ON u.id = r.user_id
       WHERE r.record_date = $1 AND r.status = 'completed'
       ORDER BY r.clock_out DESC`,
      [todayStr]
    );

    const completedToday = completedTodayQuery.rows.map((row) => ({
      ...row,
      totalFormatted: formatMinutes(row.total_minutes || 0),
    }));

    // 4. Total de horas da empresa hoje e no mês
    let todayCompanyMinutes = 0;
    completedToday.forEach(r => todayCompanyMinutes += (r.total_minutes || 0));
    workingNow.forEach(r => todayCompanyMinutes += r.elapsedMinutes);

    const { startOfMonth, endOfMonth } = getMonthRange(now);
    const monthQuery = await db.query(
      `SELECT SUM(total_minutes) as sum_minutes 
       FROM time_records 
       WHERE record_date >= $1 AND record_date <= $2 AND status = 'completed'`,
      [startOfMonth, endOfMonth]
    );
    const monthMinutes = parseInt(monthQuery.rows[0]?.sum_minutes, 10) || 0;

    return res.json({
      activeEmployeesCount,
      workingNowCount: workingNow.length,
      completedTodayCount: completedToday.length,
      todayCompanyFormatted: formatMinutes(todayCompanyMinutes),
      monthCompanyFormatted: formatMinutes(monthMinutes),
      workingNow,
      completedToday,
    });
  } catch (err) {
    console.error('[ADMIN] Erro no dashboard:', err);
    return res.status(500).json({ error: 'Erro ao carregar dados do dashboard.' });
  }
});

/**
 * GET /api/admin/employees
 * Lista todos os funcionários com suporte a busca e filtros
 */
router.get('/employees', async (req, res) => {
  try {
    const search = req.query.search ? `%${req.query.search.toLowerCase()}%` : null;

    let sql = `SELECT id, name, employee_code, email, role, position, department, is_active, created_at 
               FROM users WHERE role = 'employee'`;
    const params = [];

    if (search) {
      params.push(search);
      sql += ` AND (LOWER(name) LIKE $1 OR LOWER(employee_code) LIKE $1 OR LOWER(email) LIKE $1)`;
    }

    sql += ` ORDER BY name ASC`;

    const result = await db.query(sql, params);
    return res.json({ employees: result.rows });
  } catch (err) {
    console.error('[ADMIN] Erro ao listar funcionários:', err);
    return res.status(500).json({ error: 'Erro ao listar funcionários.' });
  }
});

/**
 * POST /api/admin/employees
 * Cadastra um novo funcionário
 */
router.post('/employees', async (req, res) => {
  try {
    const { name, employee_code, email, password, position, department } = req.body;

    if (!name || !employee_code || !password) {
      return res.status(400).json({ error: 'Nome, matrícula e senha/PIN são obrigatórios.' });
    }

    const cleanCode = String(employee_code).trim().toUpperCase();
    const cleanEmail = email ? String(email).trim().toLowerCase() : null;

    // Verifica duplicidade de matrícula
    const checkCode = await db.query(
      `SELECT id FROM users WHERE UPPER(employee_code) = $1`,
      [cleanCode]
    );
    if (checkCode.rows.length > 0) {
      return res.status(400).json({ error: 'Já existe um funcionário com esta matrícula.' });
    }

    if (cleanEmail) {
      const checkEmail = await db.query(
        `SELECT id FROM users WHERE LOWER(email) = $1`,
        [cleanEmail]
      );
      if (checkEmail.rows.length > 0) {
        return res.status(400).json({ error: 'Já existe um usuário com este e-mail.' });
      }
    }

    const salt = await bcrypt.genSalt(10);
    const passHash = await bcrypt.hash(password, salt);

    await db.query(
      `INSERT INTO users (name, employee_code, email, password_hash, role, position, department, is_active)
       VALUES ($1, $2, $3, $4, 'employee', $5, $6, ${isPostgres ? 'TRUE' : 1})`,
      [name.trim(), cleanCode, cleanEmail, passHash, position || null, department || null]
    );

    return res.json({
      success: true,
      message: 'Funcionário cadastrado com sucesso!',
    });
  } catch (err) {
    console.error('[ADMIN] Erro ao cadastrar funcionário:', err);
    return res.status(500).json({ error: 'Erro interno ao cadastrar funcionário.' });
  }
});

/**
 * PUT /api/admin/employees/:id
 * Atualiza dados, cargo, status e opcionalmente redefine senha
 */
router.put('/employees/:id', async (req, res) => {
  try {
    const empId = parseInt(req.params.id, 10);
    const { name, email, position, department, is_active, new_password } = req.body;

    const empCheck = await db.query(`SELECT * FROM users WHERE id = $1 AND role = 'employee'`, [empId]);
    if (empCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Funcionário não encontrado.' });
    }

    let passHash = empCheck.rows[0].password_hash;
    if (new_password && String(new_password).trim().length > 0) {
      const salt = await bcrypt.genSalt(10);
      passHash = await bcrypt.hash(String(new_password).trim(), salt);
    }

    const activeVal = isPostgres
      ? (is_active === false || is_active === 0 || is_active === '0' ? false : true)
      : (is_active === false || is_active === 0 || is_active === '0' ? 0 : 1);

    await db.query(
      `UPDATE users 
       SET name = $1, email = $2, position = $3, department = $4, is_active = $5, password_hash = $6, updated_at = CURRENT_TIMESTAMP
       WHERE id = $7`,
      [name || empCheck.rows[0].name, email || null, position || null, department || null, activeVal, passHash, empId]
    );

    return res.json({
      success: true,
      message: 'Dados do funcionário atualizados com sucesso.',
    });
  } catch (err) {
    console.error('[ADMIN] Erro ao atualizar funcionário:', err);
    return res.status(500).json({ error: 'Erro ao atualizar funcionário.' });
  }
});

/**
 * DELETE /api/admin/employees/:id
 * Remove definitivamente um funcionário e seus registros de ponto.
 */
router.delete('/employees/:id', async (req, res) => {
  try {
    const empId = parseInt(req.params.id, 10);

    if (!Number.isInteger(empId) || empId <= 0) {
      return res.status(400).json({ error: 'Funcionário inválido.' });
    }

    const employeeResult = await db.query(
      `SELECT id, name FROM users WHERE id = $1 AND role = 'employee'`,
      [empId]
    );
    if (employeeResult.rows.length === 0) {
      return res.status(404).json({ error: 'Funcionário não encontrado.' });
    }

    // A remoção dos pontos antes do usuário também funciona com bancos antigos
    // que foram criados sem a chave estrangeira ON DELETE CASCADE.
    await db.query(`DELETE FROM time_records WHERE user_id = $1`, [empId]);
    await db.query(`DELETE FROM users WHERE id = $1 AND role = 'employee'`, [empId]);

    return res.json({
      success: true,
      message: `Funcionário ${employeeResult.rows[0].name} removido com sucesso.`,
    });
  } catch (err) {
    console.error('[ADMIN] Erro ao excluir funcionário:', err);
    return res.status(500).json({ error: 'Erro ao excluir funcionário.' });
  }
});

/**
 * GET /api/admin/records
 * Relatório completo de registros de ponto com filtros múltiplos
 */
router.get('/records', async (req, res) => {
  try {
    const { employee_id, start_date, end_date, status, search } = req.query;

    let sql = `
      SELECT r.*, u.name as employee_name, u.employee_code, u.position, u.department
      FROM time_records r
      JOIN users u ON u.id = r.user_id
      WHERE 1=1
    `;
    const params = [];

    if (employee_id) {
      params.push(employee_id);
      sql += ` AND r.user_id = $${params.length}`;
    }

    if (start_date) {
      params.push(start_date);
      sql += ` AND r.record_date >= $${params.length}`;
    }

    if (end_date) {
      params.push(end_date);
      sql += ` AND r.record_date <= $${params.length}`;
    }

    if (status) {
      params.push(status);
      sql += ` AND r.status = $${params.length}`;
    }

    if (search) {
      params.push(`%${search.toLowerCase()}%`);
      sql += ` AND (LOWER(u.name) LIKE $${params.length} OR LOWER(u.employee_code) LIKE $${params.length})`;
    }

    sql += ` ORDER BY r.record_date DESC, r.clock_in DESC LIMIT 200`;

    const result = await db.query(sql, params);

    const records = result.rows.map((row) => ({
      ...row,
      totalFormatted: formatMinutes(row.total_minutes || 0),
    }));

    return res.json({ records });
  } catch (err) {
    console.error('[ADMIN] Erro ao buscar registros:', err);
    return res.status(500).json({ error: 'Erro ao carregar registros.' });
  }
});

/**
 * GET /api/admin/records/export-csv
 * Exporta registros filtrados em arquivo CSV formatado para o Excel Brasil
 */
router.get('/records/export-csv', async (req, res) => {
  try {
    const { employee_id, start_date, end_date, status, search } = req.query;

    let sql = `
      SELECT r.*, u.name as employee_name, u.employee_code, u.position, u.department
      FROM time_records r
      JOIN users u ON u.id = r.user_id
      WHERE 1=1
    `;
    const params = [];

    if (employee_id) {
      params.push(employee_id);
      sql += ` AND r.user_id = $${params.length}`;
    }
    if (start_date) {
      params.push(start_date);
      sql += ` AND r.record_date >= $${params.length}`;
    }
    if (end_date) {
      params.push(end_date);
      sql += ` AND r.record_date <= $${params.length}`;
    }
    if (status) {
      params.push(status);
      sql += ` AND r.status = $${params.length}`;
    }
    if (search) {
      params.push(`%${search.toLowerCase()}%`);
      sql += ` AND (LOWER(u.name) LIKE $${params.length} OR LOWER(u.employee_code) LIKE $${params.length})`;
    }

    sql += ` ORDER BY r.record_date DESC, r.clock_in DESC`;

    const result = await db.query(sql, params);

    // Formata CSV com separador ponto-e-vírgula (padrão Brasil/Excel) e UTF-8 BOM
    let csv = '\uFEFF'; // Byte Order Mark para acentuação correta no Excel
    csv += 'Data;Matrícula;Nome do Funcionário;Cargo;Departamento;Entrada;Início Almoço;Retorno Almoço;Saída;Total Horas;Status;Comprovante\r\n';

    result.rows.forEach((r) => {
      const formatTime = (iso) => (iso ? new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '');
      const formatDate = (d) => {
        if (!d) return '';
        const parts = d.split('-');
        return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : d;
      };

      const line = [
        formatDate(r.record_date),
        `"${r.employee_code}"`,
        `"${(r.employee_name || '').replace(/"/g, '""')}"`,
        `"${(r.position || '').replace(/"/g, '""')}"`,
        `"${(r.department || '').replace(/"/g, '""')}"`,
        formatTime(r.clock_in),
        formatTime(r.lunch_start),
        formatTime(r.lunch_end),
        formatTime(r.clock_out),
        formatMinutes(r.total_minutes || 0),
        r.status === 'completed' ? 'Encerrado' : (r.status === 'lunch_break' ? 'Em Almoço' : 'Em Andamento'),
        r.unique_code,
      ].join(';');

      csv += line + '\r\n';
    });

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="relatorio_pontos_${getTodayString()}.csv"`);
    return res.send(csv);
  } catch (err) {
    console.error('[ADMIN] Erro ao exportar CSV:', err);
    return res.status(500).json({ error: 'Erro ao gerar exportação em CSV.' });
  }
});

/**
 * PUT /api/admin/records/:id/correct
 * Correção auditada de registro de ponto com justificativa obrigatória
 */
router.put('/records/:id/correct', async (req, res) => {
  try {
    const recordId = parseInt(req.params.id, 10);
    const { clock_in, clock_out, lunch_start, lunch_end, justification } = req.body;
    const adminId = req.user.id;

    if (!justification || justification.trim().length < 5) {
      return res.status(400).json({ error: 'A justificativa é obrigatória para qualquer alteração auditada (mínimo 5 caracteres).' });
    }

    const currentRecordResult = await db.query(`SELECT * FROM time_records WHERE id = $1`, [recordId]);
    if (currentRecordResult.rows.length === 0) {
      return res.status(404).json({ error: 'Registro de ponto não encontrado.' });
    }

    const oldRecord = currentRecordResult.rows[0];

    const newClockIn = clock_in !== undefined ? clock_in : oldRecord.clock_in;
    const newClockOut = clock_out !== undefined ? clock_out : oldRecord.clock_out;
    const newLunchStart = lunch_start !== undefined ? lunch_start : oldRecord.lunch_start;
    const newLunchEnd = lunch_end !== undefined ? lunch_end : oldRecord.lunch_end;

    // Recalcula os minutos
    const calc = calculateWorkMinutes(newClockIn, newClockOut, newLunchStart, newLunchEnd);
    const newTotalMinutes = calc.totalMinutes;
    const newStatus = newClockOut ? 'completed' : oldRecord.status;

    // Grava histórico de auditoria para cada campo modificado
    const changes = [
      { field: 'clock_in', old: oldRecord.clock_in, now: newClockIn },
      { field: 'clock_out', old: oldRecord.clock_out, now: newClockOut },
      { field: 'lunch_start', old: oldRecord.lunch_start, now: newLunchStart },
      { field: 'lunch_end', old: oldRecord.lunch_end, now: newLunchEnd },
    ];

    for (const change of changes) {
      if (change.old !== change.now) {
        await db.query(
          `INSERT INTO audit_logs (record_id, admin_id, field_changed, old_value, new_value, justification)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [recordId, adminId, change.field, String(change.old || 'null'), String(change.now || 'null'), justification.trim()]
        );
      }
    }

    // Atualiza o registro
    await db.query(
      `UPDATE time_records 
       SET clock_in = $1, clock_out = $2, lunch_start = $3, lunch_end = $4, total_minutes = $5, status = $6, updated_at = CURRENT_TIMESTAMP
       WHERE id = $7`,
      [newClockIn, newClockOut, newLunchStart, newLunchEnd, newTotalMinutes, newStatus, recordId]
    );

    return res.json({
      success: true,
      message: 'Registro corrigido com sucesso e auditado!',
      totalMinutes: newTotalMinutes,
      totalFormatted: formatMinutes(newTotalMinutes),
    });
  } catch (err) {
    console.error('[ADMIN] Erro ao corrigir registro:', err);
    return res.status(500).json({ error: 'Erro ao aplicar correção no registro.' });
  }
});

/**
 * GET /api/admin/records/:id/audit
 * Retorna as alterações auditadas de um registro específico
 */
router.get('/records/:id/audit', async (req, res) => {
  try {
    const recordId = parseInt(req.params.id, 10);
    const result = await db.query(
      `SELECT a.*, u.name as admin_name 
       FROM audit_logs a
       JOIN users u ON u.id = a.admin_id
       WHERE a.record_id = $1 
       ORDER BY a.created_at DESC`,
      [recordId]
    );

    return res.json({ audits: result.rows });
  } catch (err) {
    console.error('[ADMIN] Erro ao buscar auditoria:', err);
    return res.status(500).json({ error: 'Erro ao buscar trilha de auditoria.' });
  }
});

module.exports = router;
