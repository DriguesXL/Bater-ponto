# Chronos Ponto - Sistema Web de Controle de Ponto Corporativo

Sistema web completo, profissional e moderno para controle de ponto eletrônico de funcionários, com painel administrativo em tempo real, cálculos precisos de horas (diárias, semanais e mensais), suporte a intervalos de almoço/descanso, exportação em CSV, auditoria de alterações com justificativa obrigatória e notificações automáticas por e-mail via Nodemailer.

---

## 📋 Sumário
1. [Visão Geral e Diferenciais](#-visão-geral-e-diferenciais)
2. [Estrutura Completa de Pastas](#-estrutura-completa-de-pastas)
3. [Tecnologias Utilizadas](#-tecnologias-utilizadas)
4. [Instalação e Execução Rápida](#-instalação-e-execução-rápida)
5. [Configuração do Banco de Dados (PostgreSQL e SQLite)](#-configuração-do-banco-de-dados)
6. [Configuração de E-mails e SMTP](#-configuração-de-e-mails-e-smtp)
7. [Credenciais de Acesso Inicial](#-credenciais-de-acesso-inicial)
8. [Fluxos do Sistema e Funcionalidades](#-fluxos-do-sistema-e-funcionalidades)
9. [Execução dos Testes Automatizados](#-execução-dos-testes-automatizados)
10. [Instruções para Publicar na Internet (Deploy)](#-instruções-para-publicar-na-internet-deploy)

---

## 🌟 Visão Geral e Diferenciais

- **Horários pelo Servidor:** Impossibilita fraudes no relógio do computador do funcionário. O carimbo de data e hora é gerado estritamente no backend.
- **Relógio Digital em Tempo Real:** Sincronizado dinamicamente com o servidor, com contador de tempo trabalhado ao vivo.
- **Estrutura de Intervalos (Almoço/Descanso):** Permite registrar início e fim de intervalo sem contabilizá-los nas horas trabalhadas.
- **Trilha de Auditoria:** Correções manuais de ponto são restritas ao Administrador e exigem justificativa formal obrigatória, registrando data, autor e valores anteriores/novos.
- **Envio Resiliente de E-mails:** Ao encerrar o expediente, o gestor recebe um e-mail com layout escuro moderno contendo dados do expediente e código verificador. Se o provedor de e-mail oscilar, o registro de ponto permanece salvo com segurança e a tentativa é registrada em log para reenvio.
- **Exportação de Relatórios CSV:** Compatível diretamente com o Microsoft Excel (formatação brasileira com separador `;` e codificação UTF-8 com BOM).

---

## 📂 Estrutura Completa de Pastas

```
c:/MeuSite/Sistema de bater ponto/
├── .env                         # Variáveis de ambiente ativas
├── .env.example                 # Modelo documentado de variáveis
├── package.json                 # Manifesto de dependências e scripts Node.js
├── server.js                    # Servidor Express principal e ponto de entrada
│
├── database/                    # Camada de persistência e banco de dados
│   ├── db.js                    # Adaptador de conexão unificado (PostgreSQL / SQLite)
│   ├── schema.sql               # DDL completo das tabelas em PostgreSQL
│   └── init.js                  # Inicializador automático de tabelas e seeds
│
├── services/                    # Regras de negócio e integrações
│   ├── calculations.js          # Cálculos matemáticos precisos de horas e intervalos
│   ├── emailService.js          # Envio de e-mails via Nodemailer e templates HTML
│   └── cronService.js           # Agendador do relatório diário corporativo
│
├── middlewares/                 # Filtros e validações de requisições
│   └── authMiddleware.js        # Verificação de tokens JWT e perfis de acesso
│
├── routes/                      # Endpoints da API REST
│   ├── authRoutes.js            # Login de colaboradores e administradores
│   ├── punchRoutes.js           # Bater ponto, relógio do servidor e histórico pessoal
│   ├── adminRoutes.js           # Dashboard, gestão de funcionários, CSV e auditoria
│   └── settingsRoutes.js        # Configurações de e-mail e disparo de testes
│
├── public/                      # Interface Web moderna (Single Page Application)
│   ├── index.html               # Estrutura semântica e views da aplicação
│   ├── css/
│   │   └── style.css            # Design system em tema escuro (Dark SaaS)
│   └── js/
│       ├── api.js               # Cliente HTTP com autenticação JWT e toasts
│       ├── app.js               # Lógica do funcionário e relógio ao vivo
│       └── admin.js             # Lógica do painel de controle administrativo
│
└── tests/                       # Qualidade de software
    └── system.test.js           # Suíte de testes automatizados de ponta a ponta
```

---

## 🛠️ Tecnologias Utilizadas

- **Backend:** Node.js (v18+) com Express.
- **Autenticação:** JSON Web Tokens (JWT) e Criptografia com BCrypt.
- **Banco de Dados:** PostgreSQL (Driver nativo `pg`) com fallback automático para SQLite embutido para inicialização zero-config.
- **Comunicação por E-mail:** Nodemailer com suporte a SMTP real (Gmail, Mailtrap, Outlook, SendGrid, Amazon SES).
- **Agendamento:** `node-cron` para fechamentos e relatórios diários automáticos.
- **Frontend:** Vanilla HTML5, CSS3 Moderno (Glassmorphism, Flexbox, CSS Grid) e JavaScript Modular.

---

## 🚀 Instalação e Execução Rápida

### 1. Clonar ou navegar até o diretório
```powershell
cd "c:\MeuSite\Sistema de bater ponto"
```

### 2. Instalar as dependências
```powershell
npm.cmd install
```

### 3. Iniciar o servidor
```powershell
npm.cmd start
```
Ou no modo de desenvolvimento com hot-reload:
```powershell
npm.cmd run dev
```

Acesse no seu navegador: **`http://localhost:3000`**

---

## 🗄️ Configuração do Banco de Dados

O sistema possui suporte dual e inteligente:

### Modo 1: SQLite (Padrão para Teste e Execução Imediata)
Já vem ativo no arquivo `.env` (`DB_CLIENT=sqlite`). Ao iniciar o servidor pela primeira vez, as tabelas e dados iniciais são gerados automaticamente sem você precisar instalar nenhum software externo.

### Modo 2: PostgreSQL (Ambiente Corporativo de Produção)
1. Crie um banco de dados no PostgreSQL chamado `pontodb`:
   ```sql
   CREATE DATABASE pontodb;
   ```
2. Edite o arquivo `.env`:
   ```env
   DB_CLIENT=postgres
   PG_HOST=localhost
   PG_PORT=5432
   PG_DATABASE=pontodb
   PG_USER=postgres
   PG_PASSWORD=sua_senha
   # Ou use a URL de conexão direta:
   # DATABASE_URL=postgresql://usuario:senha@host:5432/pontodb
   ```
3. Execute o script de inicialização para carregar as tabelas e usuários iniciais:
   ```powershell
   node database/init.js
   ```
*(Opcional: Você também pode rodar diretamente o script SQL localizado em `database/schema.sql` no PgAdmin ou DBeaver).*

---

## ✉️ Configuração de E-mails e SMTP

O sistema envia notificações automaticamente ao administrador quando um colaborador encerra o expediente e também um relatório consolidado diário.

No arquivo `.env` ou diretamente pela interface na aba **Configurações & E-mails**, informe os dados do seu provedor:

### Exemplo 1: Mailtrap (Ambiente de Testes)
```env
SMTP_HOST=smtp.mailtrap.io
SMTP_PORT=2525
SMTP_USER=seu_usuario_mailtrap
SMTP_PASS=sua_senha_mailtrap
ADMIN_NOTIFICATION_EMAIL=gestor@suaempresa.com.br
```

### Exemplo 2: Gmail (Ambiente Real)
1. Ative a *Verificação em duas etapas* na sua Conta Google.
2. Gere uma **Senha de App** em `Segurança > Senhas de app`.
3. Configure no `.env`:
```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=seu-email@gmail.com
SMTP_PASS=sua-senha-de-app-de-16-digitos
ADMIN_NOTIFICATION_EMAIL=admin@empresa.com.br
```

> **Resiliência a Falhas:** Caso o serviço de e-mail esteja temporariamente indisponível ou as credenciais estejam incorretas, **o registro de ponto do colaborador NÃO é interrompido**. O sistema grava o ponto normalmente e agenda o erro na tabela `email_logs`, permitindo que o administrador visualize e reenvie pelo painel.

---

## 🔐 Credenciais de Acesso Inicial

O banco é pré-carregado automaticamente com contas prontas para uso:

### 1. Administrador do Sistema
- **Matrícula / Identificador:** `ADM001` (ou `admin@empresa.com.br`)
- **Senha:** `admin123`
- **Permissões:** Acesso ao Painel com KPIs, listagem ao vivo, gestão de funcionários, auditoria de registros e configurações de e-mail.

### 2. Funcionários de Demonstração
- **Colaborador 1:** Matrícula `FUNC001` | Senha: `123456` *(Carlos Alberto Silva - Desenvolvedor)*
- **Colaborador 2:** Matrícula `FUNC002` | Senha: `123456` *(Mariana Oliveira - Analista Financeiro)*
- **Colaborador 3:** Matrícula `FUNC003` | Senha: `123456` *(Rafael Costa - Designer)*

*(Na tela inicial de login, há botões de preenchimento rápido em 1 clique para agilizar a demonstração).*

---

## ⚡ Fluxos do Sistema e Funcionalidades

### 1. Fluxo do Colaborador
1. O funcionário acessa o sistema e digita sua matrícula e senha individual.
2. A tela exibe o relógio digital corporativo e o status atual (`Expediente Não Iniciado`).
3. Clica em **Iniciar Expediente**: o sistema carimba o horário do servidor e inicia o cronômetro do dia.
4. Caso vá almoçar, clica em **Pausar para Almoço**. Ao voltar, clica em **Retornar do Almoço**.
5. Ao terminar a jornada, clica em **Encerrar Expediente**: o sistema calcula os minutos líquidos trabalhados, gera um comprovante digital único (`REG-XXXXXX`), exibe o resumo e dispara o e-mail ao gestor.

### 2. Fluxo do Administrador
1. Acessa com a matrícula `ADM001`.
2. **Dashboard:** Acompanha em tempo real os funcionários que estão trabalhando no momento com contagem de horas decorridas.
3. **Registros & Relatórios:** Filtra por funcionário, datas e status, pesquisa por texto e exporta relatórios formatados em **CSV** com 1 clique.
4. **Correção Auditada de Registros:** Caso um colaborador precise de ajuste em um horário, o administrador pode editar o registro mediante o preenchimento de uma **Justificativa Obrigatória**. Todas as alterações ficam salvas com autor, valores antigos, novos valores e data na **Trilha de Auditoria**.
5. **Configurações:** Altera o e-mail de recebimento, testa o envio do SMTP na hora e pode disparar o relatório diário manualmente.

---

## 🧪 Execução dos Testes Automatizados

O sistema inclui uma suíte completa de testes de integração ponta a ponta:

```powershell
npm.cmd test
```

Os testes validam automaticamente:
- Sincronização e precisão do carimbo de tempo do servidor.
- Autenticação e bloqueio de senhas incorretas.
- Início de expediente, prevenção de duplicidade e geração de comprovante único.
- Início e término de intervalos de almoço.
- Encerramento de expediente e cálculo líquido de horas trabalhadas.
- Bloqueio de rotas administrativas para usuários sem privilégios.
- Cadastro de novos colaboradores.
- Ajuste auditado de registros com justificativa e persistência na trilha de auditoria.
- Consulta aos logs de e-mail.

---

## 🌐 Instruções para Publicar na Internet (Deploy)

### Opção A: Render / Railway / Fly.io (Recomendado - Gratuito/Simples)
1. Crie um repositório no GitHub e faça o upload do código.
2. No [Render](https://render.com) ou [Railway](https://railway.app), crie um novo **Web Service**.
3. Crie um banco de dados gerenciado **PostgreSQL** na mesma plataforma.
4. Adicione as Variáveis de Ambiente no painel do Render/Railway:
   - `PORT`: `3000`
   - `JWT_SECRET`: uma chave longa e aleatória
   - `DB_CLIENT`: `postgres`
   - `DATABASE_URL`: URL fornecida pelo serviço do PostgreSQL
   - `ADMIN_NOTIFICATION_EMAIL`: seu e-mail
   - `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`
5. Comando de Build: `npm install`
6. Comando de Start: `npm start`

### Opção B: Servidor VPS Próprio (Ubuntu com Nginx e PM2)
1. Conecte ao seu servidor via SSH:
   ```bash
   ssh root@seu-servidor-ip
   ```
2. Instale o Node.js e o PM2:
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
   sudo apt install -y nodejs nginx postgresql
   sudo npm install -g pm2
   ```
3. Clone o projeto e instale as dependências:
   ```bash
   cd /var/www/ponto
   npm install
   ```
4. Inicie a aplicação com o PM2 para reiniciar automaticamente:
   ```bash
   pm2 start server.js --name "sistema-ponto"
   pm2 save
   pm2 startup
   ```
5. Configure o Nginx como Proxy Reverso apontando para a porta `3000` e ative o certificado SSL gratuito via Certbot:
   ```bash
   sudo certbot --nginx -d ponto.suaempresa.com.br
   ```

---

## ⚖️ Conformidade e Privacidade (LGPD)

- **Minimização de Dados:** Coleta exclusivamente os dados necessários para a relação de trabalho e registro de jornada.
- **Armazenamento Criptografado:** Nenhuma senha é salva em texto simples (todas usam hash BCrypt com salt dinâmico).
- **Integridade dos Registros:** Bloqueio contra adulteração direta de horários pelos funcionários; apenas administradores autorizados realizam correções mediante registro auditável formal.
