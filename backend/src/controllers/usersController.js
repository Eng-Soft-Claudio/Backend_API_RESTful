// src/controllers/users.js
import User from '../models/User.js';
import { validationResult } from 'express-validator';
import AppError from '../utils/appError.js';
import { signToken } from '../utils/jwtUtils.js';
import { filterObj } from '../utils/filterObject.js'; 

// =============================================================================
// === AÇÕES DE ADMINISTRADOR ==================================================
// =============================================================================

/**
 * @swagger
 * /api/users:
 *   post:
 *     tags: [Users (Admin)]
 *     summary: Cria um novo usuário (Admin).
 *     description: Cria uma nova conta de usuário (incluindo CPF e data de nascimento), permitindo definir a role (user ou admin). Apenas administradores podem usar esta rota. Requer autenticação e privilégios de admin.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - email
 *               - password
 *               - cpf
 *               - birthDate
 *             properties:
 *               name:
 *                 type: string
 *                 example: "Novo Usuário Silva"
 *               email:
 *                 type: string
 *                 format: email
 *                 example: "novo.usuario@example.com"
 *               password:
 *                 type: string
 *                 format: password
 *                 minLength: 8
 *                 example: "senhaSegura123"
 *               cpf:
 *                 type: string
 *                 description: CPF do usuário (somente números ou formatado).
 *                 example: "12345678900"
 *               birthDate:
 *                 type: string
 *                 format: date
 *                 description: Data de nascimento no formato AAAA-MM-DD.
 *                 example: "1995-12-25"
 *               role:
 *                 type: string
 *                 enum: [user, admin]
 *                 description: "(Opcional) Define a role. Padrão 'user'."
 *                 example: user
 *     responses:
 *       '201':
 *         description: Usuário criado com sucesso. Retorna os dados do usuário (sem campos sensíveis).
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 data:
 *                   type: object
 *                   properties:
 *                     user:
 *                       $ref: '#/components/schemas/UserOutput'
 *       '400':
 *         description: Erro de validação (dados faltando, formato inválido, email/CPF duplicado detectado na validação da rota).
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorValidationResponse' # Estrutura { status: 'fail', errors: [...] }
 *       '401':
 *         description: Não autenticado.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       '403':
 *         description: Acesso proibido (usuário não é admin).
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       '500':
 *         description: Erro interno do servidor (ex: falha ao salvar no DB não pega pela validação).
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
export const createUser = async (req, res, next) => {
  // Validação de entrada pela rota (express-validator)
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    // Retorna erros de validação ANTES de tentar criar
    return res.status(400).json({ status: 'fail', errors: errors.array() });
  }

  try {
    const userData = {
      name: req.body.name,
      email: req.body.email,
      password: req.body.password,
      cpf: req.body.cpf, // Incluído
      birthDate: req.body.birthDate, // Incluído
      role:
        req.body.role && ['user', 'admin'].includes(req.body.role)
          ? req.body.role
          : 'user',
    };

    // Cria usuário no banco
    const newUser = await User.create(userData);

    // Remove campos sensíveis da resposta
    newUser.password = undefined;
    newUser.cpf = undefined;
    newUser.birthDate = undefined;

    // Envia resposta de sucesso
    res.status(201).json({
      status: 'success',
      data: {
        user: newUser,
      },
    });
  } catch (err) {
    next(err); 
  }
};

/**
 * @swagger
 * /api/users:
 *   get:
 *     tags: [Users (Admin)]
 *     summary: Lista todos os usuários (Admin).
 *     description: Retorna uma lista de todos os usuários registrados. Apenas administradores. Note que campos sensíveis como senha, CPF e data de nascimento são omitidos por padrão.
 *     security:
 *       - bearerAuth: []
 *     # Adicionar parâmetros de query para paginação, filtros, ordenação se implementado
 *     responses:
 *       '200':
 *         description: Lista de usuários obtida com sucesso.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 results:
 *                   type: integer
 *                   description: Número total de usuários encontrados.
 *                   example: 25
 *                 data:
 *                   type: object
 *                   properties:
 *                      users:
 *                          type: array
 *                          items:
 *                            $ref: '#/components/schemas/UserOutput'
 *       '401':
 *         description: Não autenticado.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       '403':
 *         description: Acesso proibido (usuário não é admin).
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       '500':
 *         description: Erro interno do servidor.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
export const getUsers = async (req, res, next) => {
  try {
    // Busca todos os usuários (campos sensíveis omitidos pelo Model)
    const users = await User.find();
    res.status(200).json({
      status: 'success',
      results: users.length,
      data: {
        users,
      },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * @swagger
 * /api/users/{id}:
 *   get:
 *     tags: [Users (Admin)]
 *     summary: Obtém um usuário específico por ID (Admin).
 *     description: Retorna os detalhes de um usuário específico, omitindo campos sensíveis. Apenas administradores.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/UserIdParam'
 *     responses:
 *       '200':
 *         description: Detalhes do usuário obtidos com sucesso.
 *         content:
 *           application/json:
 *             schema:
 *                type: object
 *                properties:
 *                  status: { type: string, example: success }
 *                  data:
 *                    type: object
 *                    properties:
 *                      user: { $ref: '#/components/schemas/UserOutput' }
 *       '400':
 *         description: ID fornecido na URL é inválido (não é um MongoID válido).
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorValidationResponse'
 *       '401':
 *         description: Não autenticado.
 *         content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } }
 *       '403':
 *         description: Acesso proibido (usuário não é admin).
 *         content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } }
 *       '404':
 *         description: Usuário com o ID fornecido não encontrado.
 *         content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } }
 *       '500':
 *         description: Erro interno do servidor.
 *         content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } }
 */
export const getUserById = async (req, res, next) => {
  // Validação do ID pela rota (isMongoId)
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ status: 'fail', errors: errors.array() });
  }

  try {
    // Busca usuário pelo ID (campos sensíveis omitidos pelo Model)
    const user = await User.findById(req.params.id);

    // Se não encontrar, erro 404
    if (!user) {
      return next(new AppError('Nenhum usuário encontrado com este ID.', 404));
    }

    // Retorna usuário encontrado
    res.status(200).json({
      status: 'success',
      data: {
        user,
      },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * @swagger
 * /api/users/{id}:
 *   patch:
 *     tags: [Users (Admin)]
 *     summary: Atualiza um usuário (Admin).
 *     description: Permite que um administrador atualize **nome**, **email** ou **role** de um usuário específico. Não use esta rota para alterar senha, CPF ou data de nascimento. É proibido rebaixar outros administradores por aqui.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/UserIdParam'
 *     requestBody:
 *       required: true
 *       description: Pelo menos um campo (name, email, role) deve ser fornecido para atualização.
 *       content:
 *          application/json:
 *              schema:
 *                  type: object
 *                  properties:
 *                      name: { type: string, example: "Nome Atualizado Admin" }
 *                      email: { type: string, format: email, example: "email.atualizado.admin@example.com" }
 *                      role: { type: string, enum: [user, admin], example: "admin" }
 *                  minProperties: 1 # Exige pelo menos uma propriedade
 *     responses:
 *       '200':
 *         description: Usuário atualizado com sucesso.
 *         content:
 *           application/json:
 *             schema:
 *                type: object
 *                properties:
 *                  status: { type: string, example: success }
 *                  data:
 *                    type: object
 *                    properties:
 *                      user: { $ref: '#/components/schemas/UserOutput' }
 *       '400':
 *         description: Erro de validação (ID inválido, dados inválidos como email duplicado, tentativa de rebaixar admin).
 *         content:
 *           application/json:
 *             schema:
 *                oneOf: # Pode ser erro de validação da rota ou AppError
 *                  - $ref: '#/components/schemas/ErrorValidationResponse'
 *                  - $ref: '#/components/schemas/ErrorResponse'
 *       '401': { description: Não autenticado, content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
 *       '403': { description: Acesso proibido (não é admin), content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
 *       '404': { description: Usuário não encontrado com o ID fornecido, content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
 *       '500': { description: Erro interno do servidor, content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
 */
export const updateUser = async (req, res, next) => {
  // Validação do ID e dos dados de entrada (pela rota)
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    // Busca o usuário que será atualizado para checar a role atual
    const userToUpdate = await User.findById(req.params.id);

    // Se não existe, 404
    if (!userToUpdate) {
      return next(new AppError('Nenhum usuário encontrado com este ID para atualizar.', 404));
    }

    // Filtra apenas os campos permitidos para esta rota
    const filteredBody = filterObj(req.body, 'name', 'email', 'role');

    // Regra de negócio: Admin não pode rebaixar outro admin aqui
    if (userToUpdate.role === 'admin' && filteredBody.role && filteredBody.role !== 'admin') {
       return next(new AppError('Não é permitido rebaixar um administrador por esta rota.', 400));
    }

    // Realiza a atualização no banco
    const updatedUser = await User.findByIdAndUpdate(req.params.id, filteredBody, {
        new: true,          
        runValidators: true 
    });

    // Checagem de segurança caso o usuário suma entre o findById e o findByIdAndUpdate
    if (!updatedUser) {
         return next(new AppError('Nenhum usuário encontrado com este ID durante a atualização (findByIdAndUpdate).', 404));
    }

    // Retorna o usuário atualizado
    res.status(200).json({
        status: 'success',
        data: {
            user: updatedUser,
        },
    });

  } catch (err) {
     next(err);
  }
};
/**
 * @swagger
 * /api/users/{id}:
 *   delete:
 *     tags: [Users (Admin)]
 *     summary: Deleta um usuário específico por ID (Admin).
 *     description: Remove permanentemente um usuário do sistema. Ação irreversível. Apenas administradores.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/UserIdParam'
 *     responses:
 *       '204':
 *         description: Usuário deletado com sucesso (Sem conteúdo na resposta).
 *       '400': { description: ID inválido (não é MongoID), content: { application/json: { schema: { $ref: '#/components/schemas/ErrorValidationResponse' } } } }
 *       '401': { description: Não autenticado, content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
 *       '403': { description: Acesso proibido (não é admin), content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
 *       '404': { description: Usuário não encontrado com o ID fornecido, content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
 *       '500': { description: Erro interno do servidor, content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
 */
export const deleteUser = async (req, res, next) => {
  // Validação do ID pela rota (isMongoId)
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ status: 'fail', errors: errors.array() });
  }

  try {
    // Tenta deletar o usuário
    const user = await User.findByIdAndDelete(req.params.id);

    // Se findByIdAndDelete retorna null, o usuário não existia
    if (!user) {
      return next(new AppError('Nenhum usuário encontrado com este ID.', 404));
    }

    res.status(204).send();

  } catch (err) {
    next(err);
  }
};


// =============================================================================
// === AÇÕES DO USUÁRIO LOGADO =================================================
// =============================================================================

/**
 * @swagger
 * /api/users/me:
 *   get:
 *     tags: [Users (Self)]
 *     summary: Obtém o perfil do usuário logado.
 *     description: Retorna os detalhes do usuário que está autenticado através do token JWT (omitindo campos sensíveis). Requer autenticação.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       '200':
 *         description: Perfil do usuário obtido com sucesso.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 data:
 *                   type: object
 *                   properties:
 *                     user:
 *                       $ref: '#/components/schemas/UserOutput'
 *       '401':
 *         description: Não autenticado (token inválido, ausente, expirado ou usuário do token não existe mais).
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       '500':
 *         description: Erro interno do servidor.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
export const getMe = async (req, res, next) => {
  try {
    res.status(200).json({
      status: 'success',
      data: {
        user: req.user, 
      },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * @swagger
 * /api/users/me:
 *   patch:
 *     tags: [Users (Self)]
 *     summary: Atualiza o perfil do usuário logado.
 *     description: Permite que o usuário autenticado atualize seu próprio **nome** e/ou **email**. Não permite alterar senha, role, CPF ou data de nascimento por esta rota.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UserInputUpdateMe' # Apenas name e email
 *     responses:
 *       '200':
 *         description: Perfil atualizado com sucesso.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 data:
 *                   type: object
 *                   properties:
 *                     user:
 *                       $ref: '#/components/schemas/UserOutput'
 *       '400':
 *         description: Erro de validação (ex: email inválido, nome vazio, email duplicado detectado na validação ou no save).
 *         content:
 *           application/json:
 *             schema:
 *               oneOf:
 *                  - $ref: '#/components/schemas/ErrorValidationResponse' # Vindo da rota
 *                  - $ref: '#/components/schemas/ErrorResponse' # Vindo do errorHandler (ex: 11000)
 *       '401':
 *         description: Não autenticado.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       '500':
 *         description: Erro interno do servidor.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
export const updateMe = async (req, res, next) => {
  // Validação de name e email (pela rota)
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ status: 'fail', errors: errors.array() });
  }
  try {
    // Filtra APENAS campos permitidos para auto-atualização
    const filteredBody = filterObj(req.body, 'name', 'email');

    // Atualiza o usuário logado (req.user.id)
    const updatedUser = await User.findByIdAndUpdate(
      req.user.id,
      filteredBody,
      {
        new: true,          
        runValidators: true 
      }
    );

    // Retorna o usuário atualizado
    res.status(200).json({
      status: 'success',
      data: {
        user: updatedUser,
      },
    });
  } catch (err) {
    next(err);
  }
};


/**
 * @swagger
 * /api/users/me:
 *   delete:
 *     tags: [Users (Self)]
 *     summary: Deleta a conta do usuário logado.
 *     description: Remove permanentemente a conta do usuário autenticado do sistema. Esta ação é irreversível.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       '204':
 *         description: Conta deletada com sucesso (Sem conteúdo).
 *       '401':
 *         description: Não autenticado.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       '404':
 *          description: Usuário não encontrado (caso raro se o usuário for deletado entre a autenticação e esta chamada).
 *          content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       '500':
 *         description: Erro interno do servidor.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
export const deleteMe = async (req, res, next) => {
  try {
    // Deleta o usuário logado usando o ID de req.user
    const deletedUser = await User.findByIdAndDelete(req.user.id);

    // Checagem de segurança para caso raro de concorrência
    if (!deletedUser) {
      return next(new AppError('Usuário autenticado não encontrado para deletar.', 404));
    }

    // Sucesso, retorna 204 No Content
    res.status(204).send();

  } catch (err) {
    next(err);
  }
};


/**
 * @swagger
 * /api/users/updateMyPassword:
 *   patch:
 *     tags: [Users (Self)]
 *     summary: Atualiza a senha do usuário logado.
 *     description: Permite que o usuário autenticado altere sua própria senha, fornecendo a senha atual (`currentPassword`), a nova senha (`password`) e a confirmação da nova senha (`passwordConfirm`). Retorna um novo token JWT válido.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UserUpdatePasswordInput'
 *     responses:
 *       '200':
 *         description: Senha atualizada com sucesso. Retorna um novo token.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                  status:
 *                      type: string
 *                      example: success
 *                  token:
 *                      type: string
 *                      description: Um NOVO token JWT válido após a mudança de senha.
 *                      example: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...new
 *                  message:
 *                      type: string
 *                      example: Senha atualizada com sucesso!
 *       '400':
 *         description: Erro de validação (senhas não coincidem, senha nova muito curta, campo faltando).
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorValidationResponse'
 *       '401':
 *         description: Não autenticado ou a senha atual (currentPassword) está incorreta.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       '500':
 *         description: Erro interno do servidor.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
export const updateMyPassword = async (req, res, next) => {
  // Validação dos campos de senha (pela rota)
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ status: 'fail', errors: errors.array() });
  }

  try {
    // 1. Buscar usuário logado (req.user.id) + sua senha atual
    const user = await User.findById(req.user.id).select('+password');

    // 2. Verificar se a senha atual fornecida está correta
    if (
      !(await user.correctPassword(req.body.currentPassword, user.password))
    ) {
      return next(new AppError('Sua senha atual está incorreta.', 401));
    }

    // 3. Atualizar a senha no documento do usuário
    user.password = req.body.password;

    // 4. Salvar o usuário com a nova senha (aciona o pre-save)
    await user.save();

    // 5. Gerar um novo token (importante após mudança de senha)
    const token = signToken(user._id, user.role);

    // 6. Enviar resposta de sucesso com o novo token
    res.status(200).json({
      status: 'success',
      token,
      message: 'Senha atualizada com sucesso!',
    });
  } catch (err) {
    next(err);
  }
};