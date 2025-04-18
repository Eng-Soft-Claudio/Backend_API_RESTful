      
# 🛒 API Base para E-commerce

---

## 📌 Índice

1.  [Descrição](#-descrição)
2.  [Funcionalidades Principais](#-funcionalidades-principais)
3.  [Estrutura do Projeto (Backend)](#-estrutura-do-projeto-backend)
4.  [Tecnologias Utilizadas](#-tecnologias-utilizadas)
5.  [Instalação e Configuração](#-instalação-e-configuração)
6.  [Executando a Aplicação](#-executando-a-aplicação)
7.  [Executando os Testes](#-executando-os-testes)
8.  [Documentação da API (Swagger)](#-documentação-da-api-swagger)
9.  [Como Contribuir](#-como-contribuir)
10. [Licença](#-licença)

---

## 📝 Descrição

<p align="justify">
Este projeto fornece uma API RESTful robusta e escalável desenvolvida com Node.js, Express e MongoDB, servindo como uma base sólida para a construção de plataformas de e-commerce. Ele inclui funcionalidades essenciais como gerenciamento de produtos, categorias dinâmicas e usuários com controle de acesso baseado em roles (usuário/admin), utilizando autenticação segura via JWT. Foco em boas práticas, validação de entrada, tratamento de erros padronizado, testes automatizados e documentação interativa com Swagger.
</p>

---

## ✨ Funcionalidades Principais

*   **Autenticação:** Registro e Login de usuários com JWT (Json Web Tokens). Invalidação de token ao alterar senha.
*   **Gerenciamento de Usuários:**
    *   CRUD completo para administradores gerenciarem usuários (criar, listar, ver, atualizar role/dados, deletar).
    *   Rotas para o usuário logado gerenciar seu próprio perfil (ver, atualizar dados, atualizar senha, deletar conta).
*   **Controle de Acesso:** Sistema de Roles ('user', 'admin') com middlewares de autorização (`isAdmin`, `checkRole`).
*   **Gerenciamento de Categorias:** CRUD completo para categorias de produtos (Admin). Geração automática de Slug.
*   **Gerenciamento de Produtos:** CRUD completo para produtos (Admin), com associação a categorias dinâmicas e upload de imagens para Cloudinary.
*   **Listagem de Produtos:** Endpoint público com filtros (categoria, busca textual), ordenação e paginação completa.
*   **Validação de Entrada:** Validação robusta de dados de requisição usando `express-validator`.
*   **Tratamento de Erros:** Middleware centralizado para tratamento padronizado de erros operacionais e de programação.
*   **Segurança:** Configurações de CORS, rate limiting e hashing seguro de senhas com `bcrypt`.
*   **Upload de Imagens:** Integração com Multer e Cloudinary para armazenamento de imagens de produtos.
*   **Webhooks:** Estrutura básica para recebimento de webhooks externos.
*   **Testes Automatizados:** Configuração com Jest, Supertest e MongoDB-in-Memory para testes de integração.
*   **Documentação Interativa:** Documentação completa da API com Swagger/OpenAPI acessível via `/api-docs`.

---

## 📂 Estrutura do Projeto (Backend)

```bash
backend/
├── coverage/             # Relatórios de cobertura de testes (gerado)
├── jest.config.js        # Configuração do Jest
├── jest-environment-mongodb-config.js # Config do Mongo para Jest
├── package.json
├── package-lock.json
├── .env                  # Arquivo de variáveis de ambiente (NÃO versionado)
├── .env.example          # Arquivo de exemplo para variáveis de ambiente
├── src/
│   ├── app.js            # Configuração principal do Express (sem listen)
│   ├── server.js         # Ponto de entrada: conecta DB e inicia o servidor (listen)
│   ├── config/
│   │   ├── db.js         # Conexão com MongoDB (ignora em teste)
│   │   └── security.js   # Configs de CORS, Rate Limit
│   ├── controllers/
│   │   ├── auth.js       # Lógica de Login, Registro
│   │   ├── category.js   # Lógica CRUD Categorias
│   │   ├── products.js   # Lógica CRUD Produtos
│   │   ├── users.js      # Lógica CRUD Usuários (Admin e self)
│   │   └── webhooks.js   # Lógica Webhooks
│   ├── middleware/
│   │   ├── auth.js       # Middlewares authenticate, isAdmin
│   │   ├── errorHandler.js # Middleware de tratamento global de erros
│   │   ├── roles.js      # Middleware checkRole (se usado)
│   │   └── upload.js     # Middleware Multer para upload (DiskStorage ou Cloudinary)
│   ├── models/
│   │   ├── Category.js   # Schema/Model Mongoose para Categoria
│   │   ├── Product.js    # Schema/Model Mongoose para Produto
│   │   ├── User.js       # Schema/Model Mongoose para Usuário (com hooks/métodos)
│   │   └── Webhook.js    # Schema/Model Mongoose para Webhook (se necessário)
│   ├── routes/
│   │   ├── auth.js       # Rotas /api/auth (com anotações Swagger)
│   │   ├── category.js   # Rotas /api/categories (com anotações Swagger)
│   │   ├── products.js   # Rotas /api/products (com anotações Swagger)
│   │   ├── users.js      # Rotas /api/users (com anotações Swagger)
│   │   └── webhooks.js   # Rotas /api/webhooks (com anotações Swagger)
│   ├── tests/            # Testes automatizados
│   │   ├── auth.test.js
│   │   ├── products.test.js
│   │   ├── users.test.js
│   │   └── ...(outros arquivos .test.js)
│   └── utils/
│       ├── appError.js   # Classe de erro customizada
│       └── cloudinary.js # Configuração e helpers Cloudinary
└── README.md             # Este arquivo
```

---


## ⚙️ Tecnologias Utilizadas

    
    Backend: Node.js, Express.js  
    Banco de Dados: MongoDB com Mongoose (ODM)  
    Autenticação: JSON Web Token (JWT), Bcrypt  
    Uploads: Multer, Cloudinary  
    Validação: Express-validator  
    Documentação: Swagger UI Express, Swagger-JSDoc  
    Testes: Jest, Supertest, MongoDB Memory Server  
    Variáveis de Ambiente: Dotenv  
    Segurança: CORS, Express Rate Limit  
    Linguagem: JavaScript (ES Modules)  
    
    

---


## 🚀 Instalação e Configuração

Clone o repositório:

        
    git clone https://github.com/Eng-Soft-Claudio/E-commerce.git
    cd E-commerce
    

Navegue até a pasta do backend:

    cd backend

Instale as dependências:
  
    npm install

Configure as Variáveis de Ambiente:
    
Crie um arquivo chamado .env dentro da pasta backend/.

Copie o conteúdo do arquivo .env.example (se existir) ou adicione as seguintes variáveis, substituindo pelos seus valores:

    # Ambiente (development, production, test)
    NODE_ENV=development

    # Configuração do Servidor
    PORT=5000

    # Banco de Dados MongoDB
    MONGODB_URI=mongodb://localhost:27017/ecommerce_dev # Ou sua string de conexão Atlas/outro

    # Autenticação JWT
    JWT_SECRET=este-eh-um-segredo-muito-forte-mas-troque-depois
    JWT_EXPIRES_IN=1d # Ex: 1d, 12h, 90d

    # Cloudinary (obtenha no seu painel Cloudinary)
    CLOUDINARY_CLOUD_NAME=seu_cloud_name
    CLOUDINARY_API_KEY=seu_api_key
    CLOUDINARY_API_SECRET=seu_api_secret

    # CORS (Origens permitidas - separar por vírgula se mais de uma)
    ALLOWED_ORIGINS=http://localhost:3000,http://127.0.0.1:5500

 Recomendação: Crie um arquivo .env.example com as chaves (sem os valores secretos) e adicione-o ao Git para que outros saibam quais variáveis são necessárias. Adicione .env ao seu .gitignore.

---

## ▶️ Executando a Aplicação

Após a instalação e configuração:  
Para desenvolvimento (com Nodemon, se instalado):
    
    # Dentro da pasta backend/
    npm run dev
    
(O Nodemon reiniciará o servidor automaticamente ao detectar alterações nos arquivos)


Para produção ou execução simples:

    # Dentro da pasta backend/
    npm start
    
O servidor estará rodando em http://localhost:5000 (ou a porta definida no seu .env).

---

## ✅ Executando os Testes

Para rodar os testes de integração configurados com Jest:

    
    # Dentro da pasta backend/
    npm test
    
Isso executará todos os arquivos .test.js dentro da pasta src/tests/ usando um banco de dados MongoDB em memória.

---

## 📖 Documentação da API (Swagger)

Com o servidor rodando (via npm start ou npm run dev), acesse a documentação interativa da API no seu navegador:

    http://localhost:5000/api-docs

A documentação permite visualizar todos os endpoints, seus parâmetros, schemas de requisição/resposta e até mesmo testar as rotas diretamente pela interface.

---

## 🤝 Como Contribuir

      
Abra uma issue: Antes de começar, crie uma issue para discutir a ideia ou problema.​

Faça um fork: Crie um fork do repositório e clone-o para sua máquina.​

Crie uma branch: Trabalhe em uma branch separada para suas alterações.​

Implemente as mudanças: Realize as modificações necessárias no código.​

Faça commit: Adicione e faça commit das suas alterações com mensagens claras.​

Envie um pull request: Submeta um pull request com uma descrição detalhada da alteração.​

Se precisar de ajuda adicional ou tiver dúvidas, estou à disposição para ajudar!

---


## 📄 Licença

**MIT License**
<p align="justify">
Copyright (c) 2024 Cláudio de Lima Tosta
</p>
<p align="justify">
Por meio deste, é concedida permissão, gratuita e sem restrições, a qualquer pessoa que obtenha uma cópia deste software e dos arquivos de documentação associados (o "Software"), para lidar no Software sem restrições, incluindo, sem limitação, os direitos de usar, copiar, modificar, fundir, publicar, distribuir, sublicenciar e/ou vender cópias do Software, e para permitir que as pessoas a quem o Software é fornecido o façam, sujeitas às seguintes condições:
</p>
<p align="justify">
A nota de copyright acima e esta permissão deverão ser incluídas em todas as cópias ou partes substanciais do Software.
</p>
<p align="justify">
O SOFTWARE É FORNECIDO "COMO ESTÁ", SEM GARANTIA DE QUALQUER TIPO, EXPRESSA OU IMPLÍCITA, INCLUINDO, MAS NÃO SE LIMITANDO ÀS GARANTIAS DE COMERCIABILIDADE, ADEQUAÇÃO A UM FIM ESPECÍFICO E NÃO INFRAÇÃO. EM NENHUM CASO OS AUTORES OU TITULARES DOS DIREITOS AUTORAIS SERÃO RESPONSÁVEIS POR QUALQUER RECLAMAÇÃO, DANO OU OUTRA RESPONSABILIDADE, SEJA EM UMA AÇÃO DE CONTRATO, TORTO OU OUTRO, DECORRENTE DE, FORA DE OU EM CONEXÃO COM O SOFTWARE OU O USO OU OUTRAS NEGOCIAÇÕES NO SOFTWARE.
</p>

