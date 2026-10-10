const cron = require('node-cron');
const db = require('../database/db');
const { sendDailyReportEmail } = require('./emailService');

require('dotenv').config();

function startDailyReportCron() {
  const cronExpression = process.env.DAILY_REPORT_CRON || '0 20 * * 1-5'; // Seg a sex às 20:00

  if (!cron.validate(cronExpression)) {
    console.warn(`[CRON] Expressão cron inválida: "${cronExpression}". Usando padrão diário.`);
  }

  cron.schedule(cronExpression, async () => {
    console.log('[CRON] Executando rotina agendada de fechamento diário de ponto...');
    try {
      // Verifica se o relatório diário está habilitado nas configurações
      const setting = await db.query(`SELECT setting_value FROM system_settings WHERE setting_key = 'daily_report_enabled'`);
      if (setting.rows.length && setting.rows[0].setting_value === 'false') {
        console.log('[CRON] Envio diário está desabilitado nas configurações do sistema.');
        return;
      }

      const todayStr = new Date().toISOString().split('T')[0];
      const records = await db.query(
        `SELECT r.*, u.name, u.employee_code 
         FROM time_records r 
         JOIN users u ON u.id = r.user_id 
         WHERE r.record_date = $1`,
        [todayStr]
      );

      await sendDailyReportEmail(records.rows, todayStr);
      console.log(`[CRON] Rotina de envio diário finalizada para a data ${todayStr}.`);
    } catch (err) {
      console.error('[CRON] Erro ao processar relatório diário agendado:', err.message);
    }
  });

  console.log(`[CRON] Agendador ativo: Relatório diário agendado com expressão "${cronExpression}".`);
}

module.exports = { startDailyReportCron };
