const bcrypt = require('bcryptjs');
const db = require('./db');

async function initializeDatabase() {
  const isPostgres = db.getClientType() === 'postgres';
  console.log(`[DB] Inicializando banco de dados no modo: ${isPostgres ? 'PostgreSQL' : 'SQLite'}...`);

  // DDL adaptado para o motor ativo
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
      clock_in ${isPostgres ? 'TIMESTAMP WITH TIME ZONE' : 'TEXT'} NOT NULL,
      lunch_start ${isPostgres ? 'TIMESTAMP WITH TIME ZONE' : 'TEXT'},
      lunch_end ${isPostgres ? 'TIMESTAMP WITH TIME ZONE' : 'TEXT'},
      clock_out ${isPostgres ? 'TIMESTAMP WITH TIME ZONE' : 'TEXT'},
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
      record_id INTEGER NOT NULL REFERENCES time_records(id) ON DELETE CASCADE,
      admin_id INTEGER NOT NULL REFERENCES users(id),
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
      record_id INTEGER REFERENCES time_records(id) ON DELETE SET NULL,
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

  // Criar índices
  try {
    await db.query(`CREATE INDEX IF NOT EXISTS idx_records_user ON time_records(user_id);`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_records_date ON time_records(record_date);`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_records_status ON time_records(status);`);
  } catch (e) {
    // Índices podem já existir
  }

  // Cria somente o administrador inicial solicitado. Não semeamos funcionários de
  // demonstração, pois eles poluem o painel e podem ser confundidos com pessoas reais.
  const userCheck = await db.query(`SELECT id FROM users LIMIT 1;`);
  const hasUsers = userCheck.rows.length > 0;

  if (!hasUsers) {
    console.log('[DB] Criando administrador inicial...');
    const salt = await bcrypt.genSalt(10);
    const adminPassHash = await bcrypt.hash('1234', salt);
    await db.query(`
      INSERT INTO users (name, employee_code, email, password_hash, role, position, department, is_active)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8);
    `, ['Drigues', 'DRIGUES', 'admin@empresa.com.br', adminPassHash, 'admin', 'Administrador do Sistema', null, isPostgres ? true : 1]);
    console.log('[DB] Administrador criado: Usuário "DRIGUES", Senha: "1234"');
  } else {
    console.log('[DB] Usuários já existem, pulando criação padrão.');
  }

  // Configurações padrão do sistema
  const defaultSettings = [
    { key: 'notification_email', val: process.env.ADMIN_NOTIFICATION_EMAIL || 'admin@empresa.com.br', desc: 'E-mail do administrador para receber notificações de encerramento de ponto e relatórios' },
    { key: 'company_name', val: 'Empresa Demo Tecnologia S.A.', desc: 'Nome oficial da empresa' },
    { key: 'daily_report_enabled', val: 'true', desc: 'Habilitar envio de relatório diário automático por e-mail' },
    { key: 'smtp_configured', val: 'false', desc: 'Indica se o SMTP foi configurado com sucesso' }
  ];

  for (const s of defaultSettings) {
    const checkSetting = await db.query(`SELECT id FROM system_settings WHERE setting_key = $1;`, [s.key]);
    if (checkSetting.rows.length === 0) {
      await db.query(`
        INSERT INTO system_settings (setting_key, setting_value, description)
        VALUES ($1, $2, $3);
      `, [s.key, s.val, s.desc]);
    }
  }

  console.log('[DB] Banco de dados inicializado com sucesso!');
}

if (require.main === module) {
  initializeDatabase()
    .then(() => {
      console.log('[DB] Processo de inicialização finalizado.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('[DB] Erro ao inicializar banco de dados:', err);
      process.exit(1);
    });
}

module.exports = { initializeDatabase };
