const express = require('express');
const router = express.Router();
const db = require('../database/db');
const { authenticateToken, requireAdmin } = require('../middlewares/authMiddleware');
const { sendTestEmail, sendDailyReportEmail, getAdminNotificationEmail } = require('../services/emailService');

router.use(authenticateToken, requireAdmin);

/**
 * GET /api/settings
 * Retorna as configurações do sistema
 */
router.get('/', async (req, res) => {
  try {
    const result = await db.query(`SELECT setting_key, setting_value, description FROM system_settings`);
    const settings = {};
    result.rows.forEach(r => {
      settings[r.setting_key] = r.setting_value;
    });

    return res.json({
      settings: {
        notification_email: settings.notification_email || process.env.ADMIN_NOTIFICATION_EMAIL || 'admin@empresa.com.br',
        company_name: settings.company_name || 'Empresa Tecnologia',
        daily_report_enabled: settings.daily_report_enabled !== 'false',
        smtp_host: settings.smtp_host || process.env.SMTP_HOST || 'smtp.mailtrap.io',
        smtp_port: settings.smtp_port || process.env.SMTP_PORT || '2525',
        smtp_user: settings.smtp_user || process.env.SMTP_USER || '',
      },
    });
  } catch (err) {
    console.error('[SETTINGS] Erro ao carregar configurações:', err);
    return res.status(500).json({ error: 'Erro ao carregar configurações.' });
  }
});

/**
 * PUT /api/settings
 * Atualiza configurações do sistema
 */
router.put('/', async (req, res) => {
  try {
    const { notification_email, company_name, daily_report_enabled, smtp_host, smtp_port, smtp_user, smtp_pass } = req.body;

    const updates = [
      { key: 'notification_email', val: notification_email },
      { key: 'company_name', val: company_name },
      { key: 'daily_report_enabled', val: daily_report_enabled ? 'true' : 'false' },
      { key: 'smtp_host', val: smtp_host },
      { key: 'smtp_port', val: smtp_port },
      { key: 'smtp_user', val: smtp_user },
    ];

    if (smtp_pass && smtp_pass.trim().length > 0) {
      updates.push({ key: 'smtp_pass', val: smtp_pass });
    }

    for (const item of updates) {
      if (item.val !== undefined && item.val !== null) {
        const check = await db.query(`SELECT id FROM system_settings WHERE setting_key = $1`, [item.key]);
        if (check.rows.length > 0) {
          await db.query(`UPDATE system_settings SET setting_value = $1, updated_at = CURRENT_TIMESTAMP WHERE setting_key = $2`, [String(item.val), item.key]);
        } else {
          await db.query(`INSERT INTO system_settings (setting_key, setting_value) VALUES ($1, $2)`, [item.key, String(item.val)]);
        }
      }
    }

    return res.json({
      success: true,
      message: 'Configurações atualizadas com sucesso!',
    });
  } catch (err) {
    console.error('[SETTINGS] Erro ao salvar configurações:', err);
    return res.status(500).json({ error: 'Erro ao salvar configurações.' });
  }
});

/**
 * POST /api/settings/test-email
 * Envia um e-mail de teste
 */
router.post('/test-email', async (req, res) => {
  try {
    const { recipient } = req.body;
    const targetEmail = recipient || await getAdminNotificationEmail();

    const result = await sendTestEmail(targetEmail);

    if (result.success) {
      return res.json({
        success: true,
        message: `E-mail de teste enviado com sucesso para ${targetEmail}!`,
      });
    } else {
      return res.status(400).json({
        success: false,
        error: result.error,
        message: 'Falha ao enviar e-mail. Verifique suas credenciais de host e porta SMTP.',
      });
    }
  } catch (err) {
    console.error('[SETTINGS] Erro no teste de e-mail:', err);
    return res.status(500).json({ error: 'Erro ao executar teste de envio.' });
  }
});

/**
 * POST /api/settings/send-daily-report
 * Dispara o relatório diário manualmente
 */
router.post('/send-daily-report', async (req, res) => {
  try {
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];

    const recordsQuery = await db.query(
      `SELECT r.*, u.name, u.employee_code 
       FROM time_records r
       JOIN users u ON u.id = r.user_id
       WHERE r.record_date = $1
       ORDER BY u.name ASC`,
      [todayStr]
    );

    const result = await sendDailyReportEmail(recordsQuery.rows, todayStr);

    if (result.success) {
      return res.json({
        success: true,
        message: `Relatório diário enviado com sucesso contendo ${recordsQuery.rows.length} registros!`,
      });
    } else {
      return res.status(400).json({
        success: false,
        error: result.error,
        message: 'Não foi possível entregar o relatório diário por e-mail.',
      });
    }
  } catch (err) {
    console.error('[SETTINGS] Erro ao enviar relatório diário:', err);
    return res.status(500).json({ error: 'Erro ao gerar e enviar relatório diário.' });
  }
});

/**
 * GET /api/settings/email-logs
 * Lista histórico de envios de e-mails
 */
router.get('/email-logs', async (req, res) => {
  try {
    const logs = await db.query(
      `SELECT * FROM email_logs ORDER BY created_at DESC LIMIT 50`
    );
    return res.json({ logs: logs.rows });
  } catch (err) {
    console.error('[SETTINGS] Erro ao buscar logs de e-mail:', err);
    return res.status(500).json({ error: 'Erro ao carregar histórico de e-mails.' });
  }
});

module.exports = router;
