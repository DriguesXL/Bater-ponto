const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const { initializeDatabase } = require('./database/init');
const { startDailyReportCron } = require('./services/cronService');

const authRoutes = require('./routes/authRoutes');
const punchRoutes = require('./routes/punchRoutes');
const adminRoutes = require('./routes/adminRoutes');
const settingsRoutes = require('./routes/settingsRoutes');

const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares essenciais
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Servir arquivos estáticos do frontend moderno
app.use(express.static(path.join(__dirname, 'public')));

// Rotas da API
app.use('/api/auth', authRoutes);
app.use('/api/punch', punchRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/settings', settingsRoutes);

// Rota de verificação de integridade (Health Check)
app.get('/api/health', (req, res) => {
  res.json({
    status: 'online',
    timestamp: new Date().toISOString(),
    service: 'Sistema de Controle de Ponto',
  });
});

// Fallback para SPA (qualquer rota desconhecida direciona para index.html)
app.get('*', (req, res) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ error: 'Endpoint da API não encontrado.' });
  }
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Tratamento de erros global
app.use((err, req, res, next) => {
  console.error('[SERVER ERROR]', err);
  res.status(500).json({ error: 'Erro interno no servidor.', details: err.message });
});

// Inicialização do servidor
async function startServer() {
  try {
    // 1. Inicializa tabelas e sementes do banco
    await initializeDatabase();

    // 2. Inicia o agendador de tarefas
    startDailyReportCron();

    // 3. Inicia escuta HTTP
    app.listen(PORT, () => {
      console.log(`=======================================================`);
      console.log(`🚀 SISTEMA DE CONTROLE DE PONTO ONLINE`);
      console.log(`🌐 Acesso Local: http://localhost:${PORT}`);
      console.log(`💼 Painel de Ponto & Admin prontos para uso`);
      console.log(`=======================================================`);
    });
  } catch (error) {
    console.error('Falha catastrófica na inicialização do servidor:', error);
    process.exit(1);
  }
}

startServer();
