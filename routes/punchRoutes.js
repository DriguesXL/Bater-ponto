const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const db = require('../database/db');
const { authenticateToken } = require('../middlewares/authMiddleware');
const { calculateWorkMinutes, formatMinutes, getWeekRange, getMonthRange } = require('../services/calculations');
const { sendClockOutEmail } = require('../services/emailService');

/**
 * Retorna a data corrente em formato YYYY-MM-DD com base no fuso horário do servidor
 */
function getTodayString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * GET /api/punch/server-time
 * Retorna o horário atual do servidor para sincronização perfeita do relógio digital
 */
router.get('/server-time', (req, res) => {
  const now = new Date();
  res.json({
    iso: now.toISOString(),
    timestamp: now.getTime(),
    formattedDate: now.toLocaleDateString('pt-BR', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }),
  });
});

/**
 * GET /api/punch/status
 * Retorna o status do dia atual e resumo de horas para o funcionário autenticado
 */
router.get('/status', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const todayStr = getTodayString();
    const now = new Date();

    // 1. Busca o registro mais recente do dia de hoje para o usuário
    const todayRecordQuery = await db.query(
      `SELECT * FROM time_records 
       WHERE user_id = $1 AND record_date = $2 
       ORDER BY id DESC LIMIT 1`,
      [userId, todayStr]
    );

    let activeRecord = null;
    let status = 'not_started'; // 'not_started', 'in_progress', 'lunch_break', 'completed'

    if (todayRecordQuery.rows.length > 0) {
      activeRecord = todayRecordQuery.rows[0];
      status = activeRecord.status;
    }

    // 2. Calcula tempo trabalhado no dia
    let todayMinutes = 0;
    if (activeRecord) {
      if (activeRecord.status === 'completed') {
        todayMinutes = activeRecord.total_minutes || 0;
      } else {
        const calc = calculateWorkMinutes(
          activeRecord.clock_in,
          activeRecord.clock_out,
          activeRecord.lunch_start,
          activeRecord.lunch_end,
          now
        );
        todayMinutes = calc.totalMinutes;
      }
    }

    // 3. Totais da semana e do mês acumulados
    const { startOfWeek, endOfWeek } = getWeekRange(now);
    const { startOfMonth, endOfMonth } = getMonthRange(now);

    const weekQuery = await db.query(
      `SELECT SUM(total_minutes) as sum_minutes 
       FROM time_records 
       WHERE user_id = $1 AND record_date >= $2 AND record_date <= $3 AND status = 'completed'`,
      [userId, startOfWeek, endOfWeek]
    );

    const monthQuery = await db.query(
      `SELECT SUM(total_minutes) as sum_minutes 
       FROM time_records 
       WHERE user_id = $1 AND record_date >= $2 AND record_date <= $3 AND status = 'completed'`,
      [userId, startOfMonth, endOfMonth]
    );

    const weekMinutes = (parseInt(weekQuery.rows[0]?.sum_minutes, 10) || 0) + (activeRecord && activeRecord.status !== 'completed' ? todayMinutes : 0);
    const monthMinutes = (parseInt(monthQuery.rows[0]?.sum_minutes, 10) || 0) + (activeRecord && activeRecord.status !== 'completed' ? todayMinutes : 0);

    return res.json({
      status,
      activeRecord,
      serverTime: now.toISOString(),
      summary: {
        todayMinutes,
        todayFormatted: formatMinutes(todayMinutes),
        weekMinutes,
        weekFormatted: formatMinutes(weekMinutes),
        monthMinutes,
        monthFormatted: formatMinutes(monthMinutes),
      },
    });
  } catch (err) {
    console.error('[PUNCH] Erro ao obter status:', err);
    return res.status(500).json({ error: 'Erro ao verificar status do ponto.' });
  }
});

/**
 * POST /api/punch/clock-in
 * Inicia o expediente com carimbo de tempo rigoroso do servidor
 */
router.post('/clock-in', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const now = new Date();
    const todayStr = getTodayString();
    const nowIso = now.toISOString();

    // Verifica se já existe expediente em andamento ou em pausa de almoço
    const checkOpen = await db.query(
      `SELECT * FROM time_records 
       WHERE user_id = $1 AND status IN ('in_progress', 'lunch_break') LIMIT 1`,
      [userId]
    );

    if (checkOpen.rows.length > 0) {
      return res.status(400).json({
        error: 'Você já possui um expediente em andamento! Encerre-o antes de iniciar outro.',
        record: checkOpen.rows[0],
      });
    }

    // Verifica se já completou expediente hoje
    const checkTodayCompleted = await db.query(
      `SELECT * FROM time_records 
       WHERE user_id = $1 AND record_date = $2 AND status = 'completed' LIMIT 1`,
      [userId, todayStr]
    );

    if (checkTodayCompleted.rows.length > 0) {
      return res.status(400).json({
        error: 'Você já encerrou o expediente de hoje. Caso precise de um registro extra, consulte o administrador.',
      });
    }

    // Gera código único criptográfico do comprovante
    const uniqueCode = 'REG-' + crypto.randomBytes(6).toString('hex').toUpperCase();

    const insertResult = await db.query(
      `INSERT INTO time_records (user_id, record_date, clock_in, status, unique_code, total_minutes)
       VALUES ($1, $2, $3, 'in_progress', $4, 0)`,
      [userId, todayStr, nowIso, uniqueCode]
    );

    // Busca o registro recém-criado
    const newRecordQuery = await db.query(
      `SELECT * FROM time_records WHERE user_id = $1 AND unique_code = $2 LIMIT 1`,
      [userId, uniqueCode]
    );

    return res.json({
      success: true,
      message: 'Expediente iniciado com sucesso!',
      record: newRecordQuery.rows[0],
      clockIn: nowIso,
    });
  } catch (err) {
    console.error('[PUNCH] Erro ao iniciar expediente:', err);
    return res.status(500).json({ error: 'Erro interno ao iniciar expediente.' });
  }
});

/**
 * POST /api/punch/lunch-start
 * Inicia intervalo de almoço/descanso
 */
router.post('/lunch-start', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const now = new Date();
    const nowIso = now.toISOString();

    const checkRecord = await db.query(
      `SELECT * FROM time_records 
       WHERE user_id = $1 AND status = 'in_progress' ORDER BY id DESC LIMIT 1`,
      [userId]
    );

    if (checkRecord.rows.length === 0) {
      return res.status(400).json({ error: 'Nenhum expediente em andamento para iniciar almoço.' });
    }

    const record = checkRecord.rows[0];

    if (record.lunch_start) {
      return res.status(400).json({ error: 'O intervalo deste expediente já foi registrado anteriormente.' });
    }

    await db.query(
      `UPDATE time_records 
       SET lunch_start = $1, status = 'lunch_break', updated_at = $1 
       WHERE id = $2`,
      [nowIso, record.id]
    );

    return res.json({
      success: true,
      message: 'Intervalo de almoço iniciado com sucesso.',
      lunchStart: nowIso,
    });
  } catch (err) {
    console.error('[PUNCH] Erro ao iniciar almoço:', err);
    return res.status(500).json({ error: 'Erro ao registrar intervalo.' });
  }
});

/**
 * POST /api/punch/lunch-end
 * Retorna do intervalo de almoço/descanso
 */
router.post('/lunch-end', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const now = new Date();
    const nowIso = now.toISOString();

    const checkRecord = await db.query(
      `SELECT * FROM time_records 
       WHERE user_id = $1 AND status = 'lunch_break' ORDER BY id DESC LIMIT 1`,
      [userId]
    );

    if (checkRecord.rows.length === 0) {
      return res.status(400).json({ error: 'Você não está em intervalo de almoço no momento.' });
    }

    const record = checkRecord.rows[0];

    await db.query(
      `UPDATE time_records 
       SET lunch_end = $1, status = 'in_progress', updated_at = $1 
       WHERE id = $2`,
      [nowIso, record.id]
    );

    return res.json({
      success: true,
      message: 'Retorno do intervalo registrado com sucesso.',
      lunchEnd: nowIso,
    });
  } catch (err) {
    console.error('[PUNCH] Erro ao finalizar almoço:', err);
    return res.status(500).json({ error: 'Erro ao retornar do intervalo.' });
  }
});

/**
 * POST /api/punch/clock-out
 * Encerra o expediente, calcula tempo total líquido, salva permanentemente e dispara e-mail
 */
router.post('/clock-out', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const now = new Date();
    const nowIso = now.toISOString();

    const checkRecord = await db.query(
      `SELECT * FROM time_records 
       WHERE user_id = $1 AND status IN ('in_progress', 'lunch_break') ORDER BY id DESC LIMIT 1`,
      [userId]
    );

    if (checkRecord.rows.length === 0) {
      return res.status(400).json({ error: 'Você não possui expediente em andamento para encerrar.' });
    }

    const record = checkRecord.rows[0];

    // Se estava em almoço e não finalizou, finaliza o almoço no mesmo instante
    let lunchEndToSet = record.lunch_end;
    if (record.status === 'lunch_break' && !record.lunch_end) {
      lunchEndToSet = nowIso;
    }

    // Cálculo preciso de minutos trabalhados
    const calculation = calculateWorkMinutes(
      record.clock_in,
      nowIso,
      record.lunch_start,
      lunchEndToSet,
      now
    );

    const totalMinutes = calculation.totalMinutes;

    await db.query(
      `UPDATE time_records 
       SET clock_out = $1, lunch_end = $2, total_minutes = $3, status = 'completed', updated_at = $1 
       WHERE id = $4`,
      [nowIso, lunchEndToSet, totalMinutes, record.id]
    );

    // Busca o registro atualizado com dados completos
    const updatedRecordQuery = await db.query(
      `SELECT r.*, u.name as employee_name, u.employee_code 
       FROM time_records r 
       JOIN users u ON u.id = r.user_id 
       WHERE r.id = $1`,
      [record.id]
    );
    const finalRecord = updatedRecordQuery.rows[0];

    // Disparo assíncrono do e-mail ao administrador para não reter a resposta HTTP
    sendClockOutEmail({
      id: finalRecord.id,
      employeeName: finalRecord.employee_name,
      employeeCode: finalRecord.employee_code,
      recordDate: finalRecord.record_date,
      clockIn: finalRecord.clock_in,
      lunchStart: finalRecord.lunch_start,
      lunchEnd: finalRecord.lunch_end,
      clockOut: finalRecord.clock_out,
      totalMinutes: finalRecord.total_minutes,
      uniqueCode: finalRecord.unique_code,
    }).catch((emailErr) => {
      console.warn('[PUNCH] Falha no disparo do e-mail de encerramento:', emailErr.message);
    });

    return res.json({
      success: true,
      message: 'Expediente encerrado com sucesso! Notificação enviada ao administrador.',
      record: finalRecord,
      totalMinutes,
      totalFormatted: formatMinutes(totalMinutes),
    });
  } catch (err) {
    console.error('[PUNCH] Erro ao encerrar expediente:', err);
    return res.status(500).json({ error: 'Erro interno ao encerrar expediente.' });
  }
});

/**
 * GET /api/punch/history
 * Histórico individual de registros do funcionário autenticado
 */
router.get('/history', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const limit = parseInt(req.query.limit || '15', 10);

    const historyQuery = await db.query(
      `SELECT * FROM time_records 
       WHERE user_id = $1 
       ORDER BY record_date DESC, clock_in DESC 
       LIMIT $2`,
      [userId, limit]
    );

    const formattedHistory = historyQuery.rows.map((row) => ({
      ...row,
      totalFormatted: formatMinutes(row.total_minutes || 0),
    }));

    return res.json({
      history: formattedHistory,
    });
  } catch (err) {
    console.error('[PUNCH] Erro ao obter histórico individual:', err);
    return res.status(500).json({ error: 'Erro ao carregar histórico.' });
  }
});

module.exports = router;
