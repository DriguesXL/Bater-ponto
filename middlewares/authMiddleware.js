const jwt = require('jsonwebtoken');
const db = require('../database/db');

require('dotenv').config();

const JWT_SECRET = process.env.JWT_SECRET || 'chave_secreta_ponto_eletronico_prod_2026_secur3';

/**
 * Middleware para validar o token JWT nas requisições
 */
async function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Token de autenticação não fornecido.' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);

    // Verifica no banco se o usuário ainda existe e está ativo
    const userResult = await db.query(
      `SELECT id, name, employee_code, email, role, position, department, is_active FROM users WHERE id = $1`,
      [decoded.userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(401).json({ error: 'Usuário não encontrado.' });
    }

    const user = userResult.rows[0];
    if (!user.is_active) {
      return res.status(403).json({ error: 'Acesso bloqueado: colaborador inativo.' });
    }

    req.user = user;
    next();
  } catch (err) {
    return res.status(403).json({ error: 'Token inválido ou expirado.' });
  }
}

/**
 * Middleware para restringir acesso apenas a administradores
 */
function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Acesso negado: privilégios de administrador necessários.' });
  }
  next();
}

module.exports = {
  authenticateToken,
  requireAdmin,
  JWT_SECRET,
};
