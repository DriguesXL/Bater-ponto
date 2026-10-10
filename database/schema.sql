-- ==========================================================
-- SISTEMA DE CONTROLE DE PONTO DE FUNCIONÁRIOS
-- SCHEMA COMPLETO PARA POSTGRESQL
-- ==========================================================

-- 1. TABELA DE USUÁRIOS (ADMINISTRADORES E FUNCIONÁRIOS)
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    employee_code VARCHAR(50) UNIQUE NOT NULL, -- Matrícula ou código de identificação único
    email VARCHAR(150) UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'employee' CHECK (role IN ('admin', 'employee')),
    position VARCHAR(100), -- Cargo
    department VARCHAR(100), -- Departamento
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. TABELA DE REGISTROS DE PONTO (TIME RECORDS)
CREATE TABLE IF NOT EXISTS time_records (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    record_date DATE NOT NULL,
    clock_in TIMESTAMP WITH TIME ZONE NOT NULL,
    lunch_start TIMESTAMP WITH TIME ZONE,
    lunch_end TIMESTAMP WITH TIME ZONE,
    clock_out TIMESTAMP WITH TIME ZONE,
    total_minutes INTEGER DEFAULT 0, -- Tempo líquido trabalhado em minutos
    status VARCHAR(30) NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'lunch_break', 'completed')),
    unique_code VARCHAR(64) NOT NULL UNIQUE, -- Código verificador do comprovante
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Índices para otimização de consultas e relatórios
CREATE INDEX IF NOT EXISTS idx_time_records_user_date ON time_records(user_id, record_date);
CREATE INDEX IF NOT EXISTS idx_time_records_date ON time_records(record_date);
CREATE INDEX IF NOT EXISTS idx_time_records_status ON time_records(status);

-- 3. TABELA DE AUDITORIA DE ALTERAÇÕES EM REGISTROS
CREATE TABLE IF NOT EXISTS audit_logs (
    id SERIAL PRIMARY KEY,
    record_id INTEGER NOT NULL REFERENCES time_records(id) ON DELETE CASCADE,
    admin_id INTEGER NOT NULL REFERENCES users(id),
    field_changed VARCHAR(50) NOT NULL,
    old_value VARCHAR(100),
    new_value VARCHAR(100),
    justification TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_audit_record ON audit_logs(record_id);

-- 4. TABELA DE LOGS DE E-MAILS
CREATE TABLE IF NOT EXISTS email_logs (
    id SERIAL PRIMARY KEY,
    record_id INTEGER REFERENCES time_records(id) ON DELETE SET NULL,
    recipient VARCHAR(150) NOT NULL,
    subject VARCHAR(200) NOT NULL,
    email_type VARCHAR(50) NOT NULL CHECK (email_type IN ('clock_out_notification', 'daily_summary', 'test')),
    status VARCHAR(30) NOT NULL CHECK (status IN ('sent', 'failed', 'pending')),
    attempts INTEGER DEFAULT 1,
    error_message TEXT,
    sent_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_email_logs_status ON email_logs(status);

-- 5. TABELA DE CONFIGURAÇÕES DO SISTEMA
CREATE TABLE IF NOT EXISTS system_settings (
    id SERIAL PRIMARY KEY,
    setting_key VARCHAR(100) UNIQUE NOT NULL,
    setting_value TEXT NOT NULL,
    description TEXT,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
