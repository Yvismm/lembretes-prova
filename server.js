// Instale com npm install e execute com npm start.
const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');
const arquivoEnv = path.join(__dirname, '.env');
if (fs.existsSync(arquivoEnv)) process.loadEnvFile(arquivoEnv);

const app = express();
const porta = Number(process.env.PORT || 80);
const enderecoMongo = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/lembretes_prova';

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.urlencoded({ extended: false, limit: '20kb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Para adicionar um campo, altere o schema, o formulário, a validação
// em salvar() e a exibição em resposta.ejs.
const lembreteSchema = new mongoose.Schema({
  titulo: { type: String, required: true, trim: true, maxlength: 120 },
  descricao: { type: String, required: true, trim: true, maxlength: 1000 },
  local: { type: String, required: true, trim: true, maxlength: 200 },
  // Strings preservam a data e a hora escolhidas sem conversão de fuso horário.
  data: { type: String, required: true },
  hora: { type: String, required: true }
}, { versionKey: false });

// Os documentos ficam na coleção "lembretes", no banco "lembretes_prova".
const Lembrete = mongoose.model('Lembrete', lembreteSchema);

// localhost, localhost/home e localhost/home.ejs abrem a mesma página.
app.get(['/', '/home', '/home.ejs'], (req, res) => {
  res.render('home', {
    tituloPagina: 'Cadastre um novo lembrete',
    categorias: ['Tarefas', 'Reuniões', 'Compromissos']
  });
});

function responder(res, status, mensagem) {
  return res.status(status).render('resposta', {
    tipo: 'mensagem', mensagem, lembretes: []
  });
}

async function salvar(req, res) {
  // GET recebe os campos por req.query. POST recebe por req.body.
  const campos = req.method === 'GET' ? req.query : req.body;
  const dados = {};
  for (const nome of ['titulo', 'descricao', 'local', 'data', 'hora']) {
    if (!campos || typeof campos[nome] !== 'string' || !campos[nome].trim()) {
      return responder(res, 400, 'Preencha todos os campos do lembrete.');
    }
    dados[nome] = campos[nome].trim();
  }

  const dataValida = /^\d{4}-\d{2}-\d{2}$/.test(dados.data)
    && !Number.isNaN(Date.parse(dados.data + 'T00:00:00Z'))
    && new Date(dados.data + 'T00:00:00Z').toISOString().slice(0, 10) === dados.data;
  if (!dataValida || !/^([01]\d|2[0-3]):[0-5]\d$/.test(dados.hora)) {
    return responder(res, 400, 'Informe uma data e uma hora válidas.');
  }

  // create() grava realmente no MongoDB. Não há dados fictícios na lista.
  await Lembrete.create(dados);
  if (req.method === 'POST') {
    // Redirecionar evita duplicar o cadastro ao atualizar a tela de sucesso.
    return res.redirect(303, '/resposta.ejs');
  }
  return responder(res, 200, 'Lembrete cadastrado com sucesso!');
}

async function listar(req, res) {
  // find() busca TODOS os documentos. {} significa: sem filtro.
  // Para filtrar por local, por exemplo: Lembrete.find({ local: 'FEI' }).
  const lembretes = await Lembrete.find({}).sort({ _id: 1 }).lean();
  return res.render('resposta', { tipo: 'lista', mensagem: '', lembretes });
}

// O formulário original salva com POST e lista com GET.
// As duas operações também aceitam o outro método para estudar GET/POST.
// O wrapper encaminha erros das funções async para o tratamento abaixo.
function tratar(funcao) {
  return (req, res, next) => Promise.resolve(funcao(req, res)).catch(next);
}
app.get('/salvar', tratar(salvar));
app.post('/salvar', tratar(salvar));
app.get('/listar', tratar(listar));
app.post('/listar', tratar(listar));
app.get('/resposta.ejs', (req, res) => {
  responder(res, 200, 'Lembrete cadastrado com sucesso!');
});

app.use((req, res) => responder(res, 404, 'Página não encontrada.'));
// Exibe uma resposta amigável se a validação ou o banco falhar.
app.use((erro, req, res, next) => {
  console.error('Erro ao processar a solicitação:', erro.name);
  if (erro.name === 'ValidationError') {
    return responder(res, 400, 'Confira os campos e respeite os limites de tamanho.');
  }
  if (erro.status === 413 || erro.status === 400) {
    return responder(res, erro.status, 'Os dados enviados são inválidos ou muito grandes.');
  }
  return responder(res, 503, 'Não foi possível acessar o banco de dados. Tente novamente.');
});

async function iniciar() {
  // Só abre a porta HTTP depois que a conexão com o MongoDB funciona.
  await mongoose.connect(enderecoMongo, { serverSelectionTimeoutMS: 5000 });
  console.log('MongoDB conectado.');
  const servidor = app.listen(porta, () => {
    console.log(`Site disponível em http://localhost${porta === 80 ? '' : ':' + porta}`);
  });
  servidor.on('error', async (erro) => {
    console.error(erro.code === 'EADDRINUSE'
      ? `A porta ${porta} já está em uso. Feche o outro servidor ou ajuste PORT no .env.`
      : `Não foi possível abrir a porta ${porta}: ${erro.message}`);
    await mongoose.disconnect();
    process.exitCode = 1;
  });
  async function encerrar() {
    servidor.close(async () => { await mongoose.disconnect(); });
  }
  process.on('SIGINT', encerrar);
  process.on('SIGTERM', encerrar);
}

if (require.main === module) {
  iniciar().catch(() => {
    console.error('Não foi possível conectar ao MongoDB. Inicie o MongoDB Community Server ou configure MONGODB_URI no .env.');
    process.exitCode = 1;
  });
}

// Permite verificar as rotas sem iniciar uma segunda cópia do servidor.
module.exports = { app, Lembrete, iniciar };
