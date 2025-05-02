      
# 🛒 API Base para E-commerce com Node.js, Express e MongoDB

---

## 📌 Índice

1.  [Descrição](#-descrição)
2.  [Funcionalidades Principais](#-funcionalidades-principais)
3.  [Estrutura do Projeto](#-estrutura-do-projeto)
4.  [Tecnologias Utilizadas](#-tecnologias-utilizadas)
5.  [Pré-requisitos](#-pré-requisitos)
6.  [Instalação e Configuração](#-instalação-e-configuração)
7.  [Executando a Aplicação](#-executando-a-aplicação)
8.  [Executando os Testes](#-executando-os-testes)
9.  [Documentação da API (Swagger)](#-documentação-da-api-swagger)
10. [Variáveis de Ambiente](#-variáveis-de-ambiente)
11. [Como Contribuir](#-como-contribuir)
12. [Licença](#-licença)

---

## 📝 Descrição

<p align="justify">
Este projeto oferece uma API RESTful robusta e escalável, desenvolvida com Node.js, Express e MongoDB, projetada para servir como uma base sólida e eficiente para a construção de plataformas de e-commerce modernas. A API implementa funcionalidades essenciais, incluindo gerenciamento completo de usuários (com autenticação JWT e controle de acesso baseado em roles), categorias dinâmicas (com geração automática de slugs), produtos (com upload de imagens para Cloudinary), carrinho de compras, gerenciamento de endereços, sistema de pedidos com integração básica para pagamentos (Mercado Pago mockado nos testes) e avaliações de produtos.
</p>
<p align="justify">
O desenvolvimento priorizou boas práticas como validação rigorosa de entrada de dados (express-validator), tratamento de erros centralizado e padronizado, testes automatizados abrangentes (Jest/Supertest/MongoDB Memory Server) cobrindo os principais fluxos e cenários de erro, e documentação interativa da API gerada automaticamente via Swagger/OpenAPI.
</p>

---

## ✨ Funcionalidades Principais

*   **Autenticação e Autorização:**
    *   Registro e Login seguro de usuários usando JWT.
    *   Hashing de senhas com Bcrypt.
    *   Invalidação de token JWT ao alterar a senha.
    *   Controle de acesso baseado em Roles (`user`, `admin`) com middlewares dedicados (`authenticate`, `isAdmin`).
*   **Gerenciamento de Usuários:**
    *   CRUD completo para usuários (Admin).
    *   Gerenciamento de perfil pelo próprio usuário (ver, atualizar dados, atualizar senha, deletar conta).
*   **Gerenciamento de Categorias:**
    *   CRUD completo para categorias (Admin).
    *   Geração automática de `slug` a partir do nome da categoria.
*   **Gerenciamento de Produtos:**
    *   CRUD completo para produtos (Admin).
    *   Associação com categorias.
    *   Upload de imagens para Cloudinary integrado (com deleção automática ao atualizar/excluir produto).
    *   Cálculo e armazenamento de média de avaliações (`rating`) e número de avaliações (`numReviews`).
*   **Listagem de Produtos:**
    *   Endpoint público com filtros avançados (categoria por ID ou slug, busca textual no nome/descrição).
    *   Ordenação por diversos campos (nome, preço, data, etc.).
    *   Paginação completa.
*   **Gerenciamento de Endereços:**
    *   CRUD completo de endereços para o usuário logado.
    *   Funcionalidade para definir um endereço como padrão (com atualização automática dos demais).
*   **Gerenciamento de Carrinho:**
    *   Adicionar/incrementar itens.
    *   Atualizar quantidade de item específico.
    *   Remover item específico.
    *   Limpar o carrinho.
    *   Cálculo de subtotal por item (virtual).
*   **Gerenciamento de Pedidos:**
    *   Criação de pedido a partir do carrinho (copiando dados, decrementando estoque, limpando carrinho).
    *   Cálculo de preço total (itens + frete exemplo).
    *   Listagem de pedidos do próprio usuário (`/my`).
    *   Obtenção de pedido específico (usuário vê apenas os seus, admin vê todos).
    *   Processamento de pagamento simulado via `/pay` (com mocks para Mercado Pago).
    *   Listagem de todos os pedidos com paginação (Admin).
    *   Atualização de status de pedido para 'shipped' e 'delivered' (Admin).
*   **Gerenciamento de Avaliações:**
    *   Criação de avaliação para um produto (usuário logado, apenas uma por produto).
    *   Listagem pública de avaliações por produto (com paginação).
    *   Deleção de avaliação (própria ou qualquer uma por admin).
    *   Atualização automática da média e contagem de avaliações no produto associado.
*   **Webhooks:**
    *   Endpoint para recebimento de webhooks do Mercado Pago (`/handler`).
    *   Validação de assinatura HMAC-SHA256.
    *   Processamento de eventos de pagamento (`approved`, `rejected`, etc.) com atualização do status do pedido e retorno de estoque.
*   **Configuração:**
    *   Endpoint público para obter configurações seguras para o frontend (ex: Chave Pública do Mercado Pago).
*   **Qualidade e Boas Práticas:**
    *   Validação de entrada com `express-validator`.
    *   Tratamento de erros centralizado com `AppError` e `errorHandler`.
    *   Middlewares reutilizáveis.
    *   Estrutura de projeto organizada.
    *   Testes automatizados robustos (>80% de cobertura de linha nos módulos testados).
    *   Documentação da API com Swagger.
    *   Configurações de segurança (CORS, Rate Limiting).

---

## 📂 Estrutura do Projeto

```bash
backend/
├── coverage/               # Relatórios de cobertura de testes (gerado)
├── jest.config.js          # Configuração do Jest
├── jest-environment-mongodb-config.js # Config do Mongo para Jest
├── package.json
├── package-lock.json
├── .env                    # Variáveis de ambiente (NÃO versionado)
├── .env.example            # Exemplo de variáveis de ambiente necessárias
├── .gitignore              # Arquivos ignorados pelo Git
├── babel.config.cjs        # Configuração do Babel
└── src/
    ├── app.js              # Configuração principal do Express
    ├── server.js           # Ponto de entrada: Conecta DB e inicia servidor HTTP
    ├── config/
    │   ├── db.js           # Lógica de conexão com MongoDB
    │   ├── mercadopago.js  # Configuração do SDK e cliente Mercado Pago
    │   └── security.js     # Configurações de CORS, Rate Limit, etc.
    ├── controllers/        # Lógica de negócio (request handling)
    │   ├── addressController.js
    │   ├── authController.js     
    │   ├── cartController.js
    │   ├── categoryController.js  
    │   ├── configController.js
    │   ├── orderController.js
    │   ├── productsController.js 
    │   ├── reviewController.js
    │   ├── usersController.js     
    │   └── webhooksController.js 
    ├── middleware/           # Funções intermediárias
    │   ├── auth.js           # Middlewares authenticate, isAdmin
    │   ├── errorHandler.js   # Tratamento global de erros
    │   ├── roles.js          # Middleware checkRole
    │   └── upload.js         # Configuração do Multer para upload
    ├── models/               # Definições de Schema e Model Mongoose
    │   ├── Address.js
    │   ├── Cart.js
    │   ├── Category.js
    │   ├── Order.js
    │   ├── Product.js
    │   ├── Review.js
    │   └── User.js
    ├── routes/               # Definição dos endpoints da API
    │   ├── addressRoutes.js
    │   ├── authRoutes.js        
    │   ├── cartRoutes.js
    │   ├── categoryRoutes.js    
    │   ├── configRoutes.js
    │   ├── orderRoutes.js
    │   ├── productsRoutes.js    
    │   ├── reviewRoutes.js
    │   ├── usersRoutes.js       
    │   └── webhooksRoutes.js    
    ├── tests/                # Testes automatizados
    │   ├── address.test.js
    │   ├── auth.test.js
    │   ├── cart.test.js
    │   ├── category.test.js
    │   ├── config.test.js
    │   ├── order.test.js
    │   ├── products.test.js
    │   ├── review.test.js
    │   ├── users.test.js
    │   ├── webhooks.test.js
    │   └── test-uploads/     # Diretório para arquivos dummy de teste (upload)
    └── utils/                # Funções utilitárias e helpers
        ├── appError.js       # Classe de erro customizada
        ├── cloudinary.js     # Helpers para interagir com Cloudinary
        ├── filterObject.js   # Helper para filtrar campos de objetos
        ├── jwtUtils.js       # Helpers para JWT (signToken)
        └── __mocks__/        # Mocks para testes (ex: cloudinary.js)
```

---

## ⚙️ Tecnologias Utilizadas

    Backend: Node.js, Express.js

    Banco de Dados: MongoDB com Mongoose (ODM)

    Autenticação: JSON Web Token (jsonwebtoken), Bcrypt (bcrypt)

    Upload de Imagens: Multer, Cloudinary

    Validação: express-validator

    Pagamento (Simulado): Mercado Pago SDK (mercadopago) - Mockado nos testes

    Documentação: Swagger UI Express (swagger-ui-express), Swagger JSDoc (swagger-jsdoc)

    Testes: Jest, Supertest, MongoDB Memory Server (mongodb-memory-server)

    Utilitários: Dotenv (dotenv), CORS (cors), Rate Limiter (express-rate-limit), Validador de CPF (cpf-cnpj-validator), Criptografia HMAC (crypto)

    Linguagem: JavaScript (CommonJS - conforme configuração do Jest/Babel)

---

## 📋 Pré-requisitos

    Node.js (Versão LTS recomendada)

    NPM ou Yarn

    MongoDB (Instalado localmente ou uma instância na nuvem como MongoDB Atlas)

    Uma conta Cloudinary (para armazenamento de imagens de produtos)

    Uma conta de desenvolvedor Mercado Pago (para obter credenciais reais se for usar em produção)

---

## 🚀 Instalação e Configuração

    Clone o repositório:
          
    git clone https://github.com/Eng-Soft-Claudio/Bckend_API_RESTful.git
    cd E-commerce/backend


    Instale as dependências:
      
    npm install
    ou
    yarn install


    Configure as Variáveis de Ambiente:

        Renomeie (ou copie) o arquivo .env.example para .env.
        Abra o arquivo .env e preencha TODAS as variáveis com seus valores correspondentes (veja a seção Variáveis de Ambiente abaixo para detalhes).
 
 ---
 
## ▶️ Executando a Aplicação

    Modo de Desenvolvimento (com recarga automática):
          
    npm run dev
    (Requer nodemon instalado globalmente ou como dependência de desenvolvimento).

    
    Modo de Produção (ou execução simples):
    
    npm run start

    O servidor iniciará (por padrão) em http://localhost:5000 (ou na porta definida em PORT no seu .env).

---

## ✅ Executando os Testes

    Para rodar a suíte completa de testes de integração configurada com Jest:
    
    npm run test

    Isso executará todos os arquivos .test.js dentro de src/tests/. Os testes utilizam um banco de dados MongoDB em memória, garantindo que não interfiram com seu banco de dados de desenvolvimento ou produção. Os testes também mockam serviços externos como Cloudinary e Mercado Pago.

    Para ver o relatório de cobertura de código (após rodar os testes):

      
    # Se configurado no package.json (ex: "test:coverage": "jest --coverage")
    npm run test:coverage
    # Abra o arquivo coverage/lcov-report/index.html no navegador

---

## 📖 Documentação da API (Swagger)

    Com o servidor em execução, a documentação interativa da API gerada pelo Swagger está disponível em:

    http://localhost:5000/api-docs

    (Substitua 5000 pela porta correta se você a alterou no .env).

    A interface Swagger permite visualizar todos os endpoints, modelos de dados, parâmetros esperados, respostas possíveis e testar as rotas diretamente.

---

## 🔑 Variáveis de Ambiente (.env)

    Crie um arquivo .env na raiz da pasta backend/ com as seguintes variáveis:
```bash
      
    # Ambiente de Execução ('development', 'production', 'test')
    NODE_ENV=development

    # Configurações do Servidor
    PORT=5000

    # Banco de Dados MongoDB
    Exemplo Local: MONGODB_URI=mongodb://localhost:27017/ecommerce_dev
    Exemplo Atlas: MONGODB_URI=mongodb+srv://<username>:<password>@<cluster-url>/<database_name>?retryWrites=true&w=majority
    MONGODB_URI=sua_string_de_conexao_mongodb

    # Autenticação JWT
    JWT_SECRET=segredo_super_secreto_e_longo_para_producao # Troque por um segredo forte e aleatório
    JWT_EXPIRES_IN=1d # Tempo de expiração do token (ex: 1d, 12h, 90d)

    # Cloudinary (obtenha no seu painel Cloudinary)
    CLOUDINARY_CLOUD_NAME=seu_cloud_name
    CLOUDINARY_API_KEY=seu_api_key
    CLOUDINARY_API_SECRET=seu_api_secret

    # Mercado Pago (obtenha no painel de desenvolvedor do Mercado Pago)
    # Use credenciais de TESTE para desenvolvimento e produção inicial
    MP_ACCESS_TOKEN=TEST-seu_access_token_de_teste
    MP_PUBLIC_KEY=TEST-sua_public_key_de_teste
    # Crie um webhook no painel do MP apontando para sua URL + /api/webhooks/handler
    # e coloque o segredo gerado aqui (essencial para produção)
    MP_WEBHOOK_SECRET=seu_segredo_do_webhook_mp

    # CORS (Origens permitidas no frontend - separar por vírgula)
    # Exemplo: ALLOWED_ORIGINS=http://localhost:3000,https://seu-frontend.com
    ALLOWED_ORIGINS=http://localhost:3000

    # Rate Limiting (Opcional - valores padrão no código)
    # RATE_LIMIT_WINDOW_MS=900000 # 15 minutos
    # RATE_LIMIT_MAX_REQUESTS=100 # 100 requisições por janela por IP
```

---

IMPORTANTE: Adicione o arquivo .env ao seu .gitignore para evitar expor suas credenciais secretas no controle de versão!

---

## 🤝 Como Contribuir

    Abra uma Issue: Discuta a mudança ou bug que você quer abordar.

    Faça um Fork: Crie uma cópia do repositório na sua conta.

    Clone seu Fork: git clone url_do_seu_fork

    Crie uma Branch: git checkout -b minha-feature ou git checkout -b correcao-bug

    Implemente e Teste: Faça suas alterações e adicione/atualize os testes correspondentes (npm test).

    Faça Commit: git add . e git commit -m "feat: Descrição da feature". Siga convenções de commit (ex: Conventional Commits).

    Push para o Fork: git push origin minha-feature

    Abra um Pull Request: Vá para o repositório original e abra um Pull Request da sua branch para a branch principal (main ou master). Descreva suas alterações detalhadamente.

---

## 📄 Licença

MIT License
<p align="justify">
Copyright (c) 2024 Cláudio de Lima Tosta
</p>
<p align="justify">
A permissão é concedida, gratuitamente, a qualquer pessoa que obtenha uma cópia deste software e arquivos de documentação associados (o "Software"), para negociar o Software sem restrições, incluindo, sem limitação, os direitos de uso, cópia, modificação, fusão, publicação, distribuição, sublicenciamento e/ou venda de cópias do Software, e para permitir que as pessoas a quem o Software é fornecido o façam, sujeito às seguintes condições:
</p>
<p align="justify">
O aviso de direitos autorais acima e este aviso de permissão devem ser incluídos em todas as cópias ou partes substanciais do Software.
</p>
<p align="justify">
O SOFTWARE É FORNECIDO "COMO ESTÁ", SEM GARANTIA DE QUALQUER TIPO, EXPRESSA OU IMPLÍCITA, INCLUINDO, MAS NÃO SE LIMITANDO ÀS GARANTIAS DE COMERCIABILIDADE, ADEQUAÇÃO A UM DETERMINADO FIM E NÃO VIOLAÇÃO. EM NENHUMA CIRCUNSTÂNCIA OS AUTORES OU DETENTORES DOS DIREITOS AUTORAIS SERÃO RESPONSÁVEIS POR QUALQUER REIVINDICAÇÃO, DANOS OU OUTRA RESPONSABILIDADE, SEJA EM UMA AÇÃO DE CONTRATO, DELITO OU OUTRA FORMA, DECORRENTE DE, FORA DE OU EM CONEXÃO COM O SOFTWARE OU O USO OU OUTRAS NEGOCIAÇÕES NO SOFTWARE.
</p>
