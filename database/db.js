const { Pool } = require('pg');
const path = require('path');
const fs = require('fs');

require('dotenv').config();

const DB_CLIENT = (process.env.DB_CLIENT || 'sqlite').toLowerCase();

let pool = null;
let sqliteDb = null;

if (DB_CLIENT === 'postgres') {
    const connectionConfig = process.env.DATABASE_URL
    ? { connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } }
    : {
        host: process.env.PG_HOST || 'localhost',
        port: parseInt(process.env.PG_PORT || '5432', 10),
        database: process.env.PG_DATABASE || 'pontodb',
        user: process.env.PG_USER || 'postgres',
        password: process.env.PG_PASSWORD || 'postgres',
      };

    pool = new Pool(connectionConfig);

    pool.on('error', (err) => {
        console.error('[DB] Erro inesperado no pool do PostgreSQL:', err.message);
    });
} else {
    // SQLite nativo do Node.js (Node >= 22.5)
    const { DatabaseSync } = require('node:sqlite');
    const dbDir = path.resolve(__dirname, '..', 'data');
    if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
    }
    const dbFile = process.env.SQLITE_DB_PATH
    ? path.resolve(process.env.SQLITE_DB_PATH)
    : path.join(dbDir, 'ponto.sqlite');
    sqliteDb = new DatabaseSync(dbFile);
    sqliteDb.exec('PRAGMA foreign_keys = ON;');
}

/**
 * Converte strings ISO para Date objects quando necessário (PostgreSQL)
 */
function adaptParams(params) {
    if (DB_CLIENT !== 'postgres') return params;
    
    return params.map(p => {
        if (typeof p === 'string') {
            // Detecta strings de data (ISO ou formato JS Date.toString())
            if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(p) || 
                /^[A-Z][a-z]{2} [A-Z][a-z]{2} \d{4} \d{2}:\d{2}:\d{2}/.test(p)) {
                const d = new Date(p);
                if (!isNaN(d.getTime())) return d;
            }
        }
        return p;
    });
}

/**
 * Executa uma consulta SQL parametrizada de forma unificada para PostgreSQL ou SQLite
 * @param {string} text Consulta SQL (usando sintaxe $1, $2 para parâmetros)
 * @param {Array} params Parâmetros da consulta
 * @returns {Promise<{ rows: Array, rowCount: number, insertId?: number }>}
 */
async function query(text, params = []) {
    if (DB_CLIENT === 'postgres') {
        const adaptedParams = adaptParams(params);
        const res = await pool.query(text, adaptedParams);
        return {
            rows: res.rows,
            rowCount: res.rowCount,
        };
    }

    // SQLite Adapter com mapeamento exato de parâmetros $1, $2...
    return new Promise((resolve, reject) => {
        try {
            const isSelect = /^\s*(SELECT|PRAGMA)/i.test(text);

            const paramIndices = [];
            const sqliteSql = text.replace(/\$(\d+)/g, (match, num) => {
                paramIndices.push(parseInt(num, 10) - 1);
                return '?';
            });

            const sqliteParams = paramIndices.length > 0 
                ? paramIndices.map(idx => (params[idx] !== undefined ? params[idx] : null))
                : params;

            const stmt = sqliteDb.prepare(sqliteSql);

            if (isSelect) {
                const rows = stmt.all(...sqliteParams);
                resolve({
                    rows: rows || [],
                    rowCount: rows ? rows.length : 0,
                });
            } else {
                const result = stmt.run(...sqliteParams);
                resolve({
                    rows: [],
                    rowCount: result.changes,
                    insertId: Number(result.lastInsertRowid),
                });
            }
        } catch (err) {
            reject(err);
        }
    });
}

/**
 * Fecha as conexões do banco de dados de forma graciosa
 */
async function close() {
    if (pool) {
        await pool.end();
    }
    if (sqliteDb) {
        sqliteDb.close();
    }
}

module.exports = {
    query,
    close,
    getClientType: () => DB_CLIENT,
};