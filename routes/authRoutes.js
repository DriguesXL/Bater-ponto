const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../database/db');
const { authenticateToken, JWT_SECRET } = require('../middlewares/authMiddleware');

/**
 * POST /api/auth/login
 * Login unificado para Administradores e Funcionários
 */
router.post('/login', async (req, res) => {
  try {
    const { identifier, password } = req.body;

    if (!identifier || !password) {
      return res.status(400).json({ error: 'Identificador (matrícula ou e-mail) e senha são obrigatórios.' });
    }

    const cleanIdentifier = String(identifier).trim();

    // Busca por matrícula (employee_code) ou por e-mail
    const result = await db.query(
      `SELECT * FROM users WHERE LOWER(employee_code) = LOWER($1) OR LOWER(email) = LOWER($1) LIMIT 1`,
      [cleanIdentifier]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Credenciais inválidas. Verifique sua matrícula/e-mail e senha.' });
    }

    const user = result.rows[0];

    if (!user.is_active) {
      return res.status(403).json({ error: 'Este usuário está inativo no sistema. Contate o RH/Administrador.' });
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ error: 'Credenciais inválidas. Senha incorreta.' });
    }

    // Gera token JWT com validade de 24 horas
    const token = jwt.sign(
      {
        userId: user.id,
        role: user.role,
        code: user.employee_code,
      },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    return res.json({
      success: true,
      token,
      user: {
        id: user.id,
        name: user.name,
        employee_code: user.employee_code,
        email: user.email,
        role: user.role,
        position: user.position,
        department: user.department,
      },
    });
  } catch (err) {
    console.error('[AUTH] Erro no login:', err);
    return res.status(500).json({ error: 'Erro interno ao realizar autenticação.' });
  }
});

/**
 * POST /api/auth/reset
 * Rota temporária para resetar o banco (apagar todos e criar Drigues)
 */
router.post('/reset', async (req, res) => {
  try {
    const { master_key } = req.body;
    if (master_key !== 'RESET_2026_DRIGUES') {
      return res.status(403).json({ error: 'Chave mestre inválida.' });
    }

    const isPostgres = db.getClientType() === 'postgres';

    // Apagar todos os usuários
    await db.query(`DELETE FROM users;`);

    // Criar apenas o administrador Drigues, que também pode registrar o próprio ponto.
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

    return res.json({
      success: true,
      message: 'Banco resetado! Apenas Drigues administrador (Matrícula: DRIGUES, senha: 1234) foi criado.',
    });
  } catch (err) {
    console.error('[RESET] Erro ao resetar banco:', err);
    return res.status(500).json({ error: 'Erro ao resetar banco de dados.' });
  }
});

/**
 * GET /api/auth/me
 * Retorna os dados do perfil autenticado
 */
router.get('/me', authenticateToken, (req, res) => {
  return res.json({
    user: req.user,
  });
});

module.exports = router;
