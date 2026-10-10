const nodemailer = require('nodemailer');
const db = require('../database/db');
const { formatMinutes } = require('./calculations');

require('dotenv').config();

/**
 * Cria ou recupera o transporte Nodemailer configurado
 */
async function getTransporter() {
  // Tenta obter credenciais atualizadas da tabela system_settings ou usa process.env
  let smtpHost = process.env.SMTP_HOST || 'smtp.mailtrap.io';
  let smtpPort = parseInt(process.env.SMTP_PORT || '2525', 10);
  let smtpSecure = process.env.SMTP_SECURE === 'true';
  let smtpUser = process.env.SMTP_USER || '';
  let smtpPass = process.env.SMTP_PASS || '';

  try {
    const customHost = await db.query(`SELECT setting_value FROM system_settings WHERE setting_key = 'smtp_host'`);
    if (customHost.rows.length && customHost.rows[0].setting_value) smtpHost = customHost.rows[0].setting_value;

    const customPort = await db.query(`SELECT setting_value FROM system_settings WHERE setting_key = 'smtp_port'`);
    if (customPort.rows.length && customPort.rows[0].setting_value) smtpPort = parseInt(customPort.rows[0].setting_value, 10);

    const customUser = await db.query(`SELECT setting_value FROM system_settings WHERE setting_key = 'smtp_user'`);
    if (customUser.rows.length && customUser.rows[0].setting_value) smtpUser = customUser.rows[0].setting_value;

    const customPass = await db.query(`SELECT setting_value FROM system_settings WHERE setting_key = 'smtp_pass'`);
    if (customPass.rows.length && customPass.rows[0].setting_value) smtpPass = customPass.rows[0].setting_value;
  } catch (err) {
    // Continua com process.env
  }

  const transportConfig = {
    host: smtpHost,
    port: smtpPort,
    secure: smtpSecure,
    auth: smtpUser ? {
      user: smtpUser,
      pass: smtpPass,
    } : undefined,
    // Timeout para não travar a requisição caso o host não responda
    connectionTimeout: 8000,
    greetingTimeout: 8000,
  };

  return {
    transporter: nodemailer.createTransport(transportConfig),
    smtpHost,
    smtpUser,
    hasAuth: Boolean(smtpUser && smtpPass),
  };
}

/**
 * Obtém o e-mail do destinatário administrativo
 */
async function getAdminNotificationEmail() {
  try {
    const res = await db.query(`SELECT setting_value FROM system_settings WHERE setting_key = 'notification_email'`);
    if (res.rows.length && res.rows[0].setting_value) {
      return res.rows[0].setting_value;
    }
  } catch (err) {
    // fallback
  }
  return process.env.ADMIN_NOTIFICATION_EMAIL || 'admin@empresa.com.br';
}

/**
 * Formata data/hora em formato amigável brasileiro
 */
function formatDateTimeBR(isoString) {
  if (!isoString) return '--:--';
  const d = new Date(isoString);
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function formatDateBR(dateString) {
  if (!dateString) return '';
  const parts = dateString.split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return dateString;
}

/**
 * Envia notificação por e-mail de encerramento de expediente
 */
async function sendClockOutEmail(recordDetails) {
  const {
    id: recordId,
    employeeName,
    employeeCode,
    recordDate,
    clockIn,
    lunchStart,
    lunchEnd,
    clockOut,
    totalMinutes,
    uniqueCode,
  } = recordDetails;

  const recipient = await getAdminNotificationEmail();
  const subject = `[PONTO ENCERRADO] ${employeeName} - ${formatDateBR(recordDate)} (${formatMinutes(totalMinutes)})`;

  const htmlContent = `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0b0f19; color: #f3f4f6; margin: 0; padding: 24px; }
        .card { max-width: 600px; margin: 0 auto; background: #111827; border: 1px solid #1f2937; border-radius: 12px; overflow: hidden; box-shadow: 0 10px 25px rgba(0,0,0,0.5); }
        .header { background: linear-gradient(135deg, #1e3a8a, #2563eb); padding: 24px; text-align: center; }
        .header h1 { margin: 0; color: #ffffff; font-size: 20px; font-weight: 700; letter-spacing: -0.5px; }
        .badge { display: inline-block; background: rgba(255,255,255,0.2); padding: 4px 12px; border-radius: 9999px; font-size: 12px; margin-top: 8px; color: #ffffff; }
        .content { padding: 28px; }
        .emp-info { margin-bottom: 24px; padding-bottom: 16px; border-bottom: 1px solid #1f2937; }
        .emp-name { font-size: 18px; font-weight: 600; color: #ffffff; margin: 0 0 4px 0; }
        .emp-code { font-size: 13px; color: #9ca3af; margin: 0; }
        .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 24px; }
        .data-box { background: #1a2234; padding: 14px; border-radius: 8px; border: 1px solid #2d3748; }
        .data-label { font-size: 11px; text-transform: uppercase; color: #94a3b8; font-weight: 600; margin-bottom: 4px; }
        .data-value { font-size: 16px; color: #f8fafc; font-weight: 600; }
        .total-box { background: #0f233a; border: 1px solid #2563eb; padding: 18px; border-radius: 8px; text-align: center; margin-bottom: 24px; }
        .total-label { font-size: 13px; color: #93c5fd; font-weight: 500; }
        .total-value { font-size: 28px; font-weight: 800; color: #ffffff; margin-top: 4px; }
        .footer { background: #0b0f19; padding: 16px 28px; text-align: center; font-size: 12px; color: #6b7280; border-top: 1px solid #1f2937; }
        .auth-code { font-family: monospace; font-size: 11px; color: #60a5fa; word-break: break-all; margin-top: 6px; }
      </style>
    </head>
    <body>
      <div class="card">
        <div class="header">
          <h1>Registro de Ponto Eletrônico</h1>
          <div class="badge">Expediente Encerrado</div>
        </div>
        <div class="content">
          <div class="emp-info">
            <h2 class="emp-name">${employeeName}</h2>
            <p class="emp-code">Matrícula: <strong>${employeeCode}</strong> | Data: <strong>${formatDateBR(recordDate)}</strong></p>
          </div>
          
          <div class="grid">
            <div class="data-box">
              <div class="data-label">Horário de Entrada</div>
              <div class="data-value">${formatDateTimeBR(clockIn)}</div>
            </div>
            <div class="data-box">
              <div class="data-label">Horário de Saída</div>
              <div class="data-value">${formatDateTimeBR(clockOut)}</div>
            </div>
            ${lunchStart ? `
            <div class="data-box">
              <div class="data-label">Início Intervalo</div>
              <div class="data-value">${formatDateTimeBR(lunchStart)}</div>
            </div>
            <div class="data-box">
              <div class="data-label">Fim Intervalo</div>
              <div class="data-value">${lunchEnd ? formatDateTimeBR(lunchEnd) : '--:--'}</div>
            </div>
            ` : ''}
          </div>

          <div class="total-box">
            <div class="total-label">Total Líquido Trabalhado no Dia</div>
            <div class="total-value">${formatMinutes(totalMinutes)}</div>
          </div>
        </div>
        <div class="footer">
          <div>Comprovante autenticado digitalmente pelo servidor corporativo.</div>
          <div class="auth-code">ID: #${recordId} | Token: ${uniqueCode}</div>
        </div>
      </div>
    </body>
    </html>
  `;

  return await attemptSendEmail({
    recordId,
    recipient,
    subject,
    htmlContent,
    emailType: 'clock_out_notification',
  });
}

/**
 * Envia o Relatório Diário com o resumo de todos os funcionários
 */
async function sendDailyReportEmail(records, dateStr) {
  const recipient = await getAdminNotificationEmail();
  const subject = `[RELATÓRIO DIÁRIO] Fechamento de Ponto - ${formatDateBR(dateStr)}`;

  let totalEquipeMinutos = 0;
  const rowsHtml = records.map((r) => {
    totalEquipeMinutos += (r.total_minutes || 0);
    return `
      <tr style="border-bottom: 1px solid #1f2937;">
        <td style="padding: 12px; color: #ffffff; font-weight: 500;">${r.name} (${r.employee_code})</td>
        <td style="padding: 12px; color: #cbd5e1;">${formatDateTimeBR(r.clock_in)}</td>
        <td style="padding: 12px; color: #cbd5e1;">${r.clock_out ? formatDateTimeBR(r.clock_out) : '<span style="color:#f59e0b">Em aberto</span>'}</td>
        <td style="padding: 12px; color: #60a5fa; font-weight: 600;">${formatMinutes(r.total_minutes)}</td>
      </tr>
    `;
  }).join('');

  const htmlContent = `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; background-color: #0b0f19; color: #f3f4f6; margin: 0; padding: 24px; }
        .card { max-width: 720px; margin: 0 auto; background: #111827; border: 1px solid #1f2937; border-radius: 12px; overflow: hidden; }
        .header { background: #1e293b; padding: 24px; border-bottom: 2px solid #2563eb; }
        .header h1 { margin: 0; color: #ffffff; font-size: 20px; }
        .content { padding: 24px; }
        table { width: 100%; border-collapse: collapse; margin-top: 16px; font-size: 14px; }
        th { text-align: left; padding: 10px 12px; background: #1e293b; color: #94a3b8; font-size: 12px; text-transform: uppercase; }
        .summary-card { background: #0f233a; border: 1px solid #2563eb; padding: 16px; border-radius: 8px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center; }
      </style>
    </head>
    <body>
      <div class="card">
        <div class="header">
          <h1>Relatório Consolidado Diário de Ponto</h1>
          <p style="margin: 4px 0 0 0; color: #94a3b8; font-size: 13px;">Data de Referência: ${formatDateBR(dateStr)}</p>
        </div>
        <div class="content">
          <div class="summary-card">
            <div>
              <div style="font-size: 12px; color: #93c5fd;">Total de Registros: <strong>${records.length}</strong></div>
              <div style="font-size: 12px; color: #93c5fd; margin-top: 4px;">Horas Totais da Equipe:</div>
            </div>
            <div style="font-size: 24px; font-weight: 700; color: #ffffff;">${formatMinutes(totalEquipeMinutos)}</div>
          </div>

          <table>
            <thead>
              <tr>
                <th>Colaborador</th>
                <th>Entrada</th>
                <th>Saída</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml || '<tr><td colspan="4" style="padding:16px; text-align:center; color:#94a3b8;">Nenhum registro de ponto encontrado nesta data.</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>
    </body>
    </html>
  `;

  return await attemptSendEmail({
    recordId: null,
    recipient,
    subject,
    htmlContent,
    emailType: 'daily_summary',
  });
}

/**
 * Envia um e-mail de teste para validação imediata do SMTP
 */
async function sendTestEmail(targetRecipient) {
  const recipient = targetRecipient || await getAdminNotificationEmail();
  const subject = '[TESTE] Validação de Configuração SMTP - Sistema de Ponto';
  const htmlContent = `
    <div style="font-family: sans-serif; background: #0b0f19; color: #fff; padding: 24px; border-radius: 8px;">
      <h2 style="color: #3b82f6;">Sucesso no Teste de E-mail!</h2>
      <p>As configurações do servidor SMTP estão funcionando corretamente.</p>
      <p style="color: #94a3b8; font-size: 13px;">Data do teste: ${new Date().toLocaleString('pt-BR')}</p>
    </div>
  `;

  return await attemptSendEmail({
    recordId: null,
    recipient,
    subject,
    htmlContent,
    emailType: 'test',
  });
}

/**
 * Tenta enviar o e-mail e registra o resultado na tabela email_logs
 */
async function attemptSendEmail({ recordId, recipient, subject, htmlContent, emailType }) {
  let status = 'pending';
  let errorMessage = null;

  try {
    const { transporter, smtpHost, hasAuth } = await getTransporter();

    // Se não tiver credenciais ou for o mailtrap padrão sem credenciais, podemos tentar enviar se for localhost/teste
    // Caso falhe, captura o erro e grava em email_logs sem afetar o fluxo do usuário
    const info = await transporter.sendMail({
      from: process.env.SMTP_FROM || 'Sistema de Ponto <ponto@empresa.com.br>',
      to: recipient,
      subject: subject,
      html: htmlContent,
    });

    status = 'sent';
    const nowIso = new Date().toISOString();

    await db.query(`
      INSERT INTO email_logs (record_id, recipient, subject, email_type, status, attempts, error_message, sent_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `, [recordId, recipient, subject, emailType, status, 1, null, nowIso]);

    console.log(`[EMAIL] E-mail (${emailType}) enviado com sucesso para ${recipient}. MessageId: ${info.messageId}`);
    return { success: true, messageId: info.messageId };
  } catch (err) {
    status = 'failed';
    errorMessage = err.message || 'Erro desconhecido ao conectar ao servidor SMTP';

    console.warn(`[EMAIL] Falha ao enviar e-mail (${emailType}) para ${recipient}: ${errorMessage}`);

    try {
      await db.query(`
        INSERT INTO email_logs (record_id, recipient, subject, email_type, status, attempts, error_message, sent_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `, [recordId, recipient, subject, emailType, status, 1, errorMessage, null]);
    } catch (dbErr) {
      console.error('[EMAIL] Erro ao registrar log de e-mail no banco:', dbErr.message);
    }

    return {
      success: false,
      error: errorMessage,
      note: 'O registro de ponto foi salvo com sucesso, porém o envio de e-mail falhou e foi registrado para reenvio.',
    };
  }
}

module.exports = {
  sendClockOutEmail,
  sendDailyReportEmail,
  sendTestEmail,
  getAdminNotificationEmail,
};
