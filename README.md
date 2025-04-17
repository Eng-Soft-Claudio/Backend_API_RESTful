# 🛒 API E-commerce

---

## 📌 Índice

    Descrição

    Estrutura do Projeto

    Tecnologias Utilizadas

    Instalação

    Licença

---

## 📝 Descrição

<p align="justify">
Este é um projeto de crud desenvolvido com Node.js, Express e MongoDB. O objetivo é fornecer uma plataforma robusta para gerenciar produtos, usuários e pedidos, com foco em escalabilidade e segurança.
</p>

---

## 📂 Estrutura do Projeto
```bash
E-commerce/
├── backend/
│   ├── app.js
│   ├── config/
│   │   ├── db.js
│   │   └── security.js
│   ├── controllers/
│   │   ├── auth.js
│   │   ├── products.js
│   │   ├── users.js
│   │   └── webhooks.js
│   ├── middleware/
│   │   ├── auth.js
│   │   ├── roles.js
│   │   └── upload.js
│   ├── models/
│   │   ├── Product.js
│   │   ├── User.js
│   │   └── Webhook.js
│   ├── routes/
│   │   ├── auth.js
│   │   ├── products.js
│   │   └── users.js
│   ├── tests/
│   │   └── auth.test.js
│   └── utils/
│       └── cloudinary.js
├── package.json
└── README.md
```
---

## ⚙️ Tecnologias Utilizadas


![Node.js](https://img.shields.io/badge/node.js-6DA55F?style=for-the-badge&logo=node.js&logoColor=white)
![Express.js](https://img.shields.io/badge/express.js-%23404d59.svg?style=for-the-badge&logo=express&logoColor=%2361DAFB)
![MongoDB](https://img.shields.io/badge/MongoDB-4ea94b?style=for-the-badge&logo=mongodb&logoColor=white)
![Mongoose](https://img.shields.io/badge/Mongoose-880e4f?style=for-the-badge&logo=mongoose&logoColor=white)
![JWT](https://img.shields.io/badge/JWT-000000?style=for-the-badge&logo=json-web-tokens&logoColor=white)
![Multer](https://img.shields.io/badge/Multer-ff5722?style=for-the-badge&logo=multer&logoColor=white)
![dotenv](https://img.shields.io/badge/dotenv-3e2723?style=for-the-badge&logo=dotenv&logoColor=white)
![JS](https://img.shields.io/badge/-323330?style=for-the-badge&logo=javascript&logoColor=F7DF1E)


---

## 🚀 Instalação

Clone o repositório:
```bash
git clone https://github.com/Eng-Soft-Claudio/E-commerce.git
cd E-commerce
```
Instale as dependências:
```bash
npm install
```
Crie um arquivo .env na raiz do projeto e adicione suas variáveis de ambiente:
```bash
DB_URI=mongodb://localhost:27017/ecommerce
JWT_SECRET=seu_segredo
CLOUDINARY_URL=sua_url_do_cloudinary
```
Inicie o servidor:
```bash
npm start
```
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
Copyright (c) 2025 Cláudio de Lima Tosta
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
