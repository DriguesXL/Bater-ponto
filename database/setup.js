const bcrypt = require('bcryptjs');
const db = require('./db');

async function setupDatabase() {
  const isPostgres = db.getClientType() === 'postgres';
  console.log(`[DB] Modo: ${isPostgres ? 'PostgreSQL' : 'SQLite'}`);

  // DDL adaptado
  const idType = isPostgres ? 'SERIAL PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT';
  const timestampType = isPostgres ? 'TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP' : 'DATETIME DEFAULT CURRENT_TIMESTAMP';
  const booleanType = isPostgres ? 'BOOLEAN' : 'INTEGER';

  // 1. Tabela users
  await db.query(`
    CREATE TABLE IF NOT EXISTS users (
      id ${idType},
      name TEXT NOT NULL,
      employee_code TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'employee',
      position TEXT,
      department TEXT,
      is_active ${booleanType} NOT NULL DEFAULT ${isPostgres ? 'TRUE' : 1},
      created_at ${timestampType},
      updated_at ${timestampType}
    );
  `);

  // 2. Tabela time_records
  await db.query(`
    CREATE TABLE IF NOT EXISTS time_records (
      id ${idType},
      user_id INTEGER NOT NULL,
      record_date TEXT NOT NULL,
      clock_in TEXT NOT NULL,
      lunch_start TEXT,
      lunch_end TEXT,
      clock_out TEXT,
      total_minutes INTEGER DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'in_progress',
      unique_code TEXT NOT NULL UNIQUE,
      notes TEXT,
      created_at ${timestampType},
      updated_at ${timestampType}
    );
  `);

  // 3. Tabela audit_logs
  await db.query(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id ${idType},
      record_id INTEGER NOT NULL,
      admin_id INTEGER NOT NULL,
      field_changed TEXT NOT NULL,
      old_value TEXT,
      new_value TEXT,
      justification TEXT NOT NULL,
      created_at ${timestampType}
    );
  `);

  // 4. Tabela email_logs
  await db.query(`
    CREATE TABLE IF NOT EXISTS email_logs (
      id ${idType},
      record_id INTEGER,
      recipient TEXT NOT NULL,
      subject TEXT NOT NULL,
      email_type TEXT NOT NULL,
      status TEXT NOT NULL,
      attempts INTEGER DEFAULT 1,
      error_message TEXT,
      sent_at TEXT,
      created_at ${timestampType}
    );
  `);

  // 5. Tabela system_settings
  await db.query(`
    CREATE TABLE IF NOT EXISTS system_settings (
      id ${idType},
      setting_key TEXT UNIQUE NOT NULL,
      setting_value TEXT NOT NULL,
      description TEXT,
      updated_at ${timestampType}
    );
  `);

  // Índices
  try {
    await db.query(`CREATE INDEX IF NOT EXISTS idx_records_user ON time_records(user_id);`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_records_date ON time_records(record_date);`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_records_status ON time_records(status);`);
  } catch (e) {}

  // Limpar todos os usuários existentes
  await db.query(`DELETE FROM users;`);
  console.log('[DB] Usuários antigos removidos.');

  // Criar apenas o administrador Drigues. A interface também permite que ele
  // registre o próprio ponto.
  const salt = await bcrypt.genSalt(10);
  const adminPassHash = await bcrypt.hash('1234', salt);

  await db.query(`
    INSERT INTO users (name, employee_code, email, password_hash, role, position, department, is_active)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8);
  `, [
    'Drigues',
    'DRIGUES',
    'admin@empresa.com.br',
    adminPassHash,
    'admin',
    'Administrador do Sistema',
    null,
    isPostgres ? true : 1
  ]);

  console.log('[DB] Administrador criado: Usuário "DRIGUES", Senha: "1234"');

  // Configurações padrão
  const defaultSettings = [
    { key: 'notification_email', val: process.env.ADMIN_NOTIFICATION_EMAIL || 'admin@empresa.com.br', desc: 'E-mail do administrador' },
    { key: 'company_name', val: 'Empresa Demo Tecnologia S.A.', desc: 'Nome da empresa' },
    { key: 'daily_report_enabled', val: 'true', desc: 'Habilitar relatório diário' },
    { key: 'smtp_configured', val: 'false', desc: 'SMTP configurado' }
  ];

  for (const s of defaultSettings) {
    const check = await db.query(`SELECT id FROM system_settings WHERE setting_key = $1;`, [s.key]);
    if (check.rows.length === 0) {
      await db.query(`INSERT INTO system_settings (setting_key, setting_value, description) VALUES ($1, $2, $3);`, [s.key, s.val, s.desc]);
    }
  }

  console.log('[DB] Banco configurado com sucesso!');
}

setupDatabase()
  .then(() => {
    console.log('[DB] Processo finalizado.');
    process.exit(0);
  })
  .catch((err) => {
    console.error('[DB] Erro:', err);
    process.exit(1);
  });
