import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateField,
  formatCpf,
  cpfDigits,
  registrationPayload
} from '../src/services/authValidation.js';
import { aliasDestination } from '../src/routes/routeDefinitions.js';

test('registration messages exactly preserve legacy punctuation and CPF rules', () => {
  assert.equal(validateField('nome', ' ', { required: true }), 'Este campo é obrigatório');
  assert.equal(
    validateField('email', 'a@b', { type: 'email' }),
    'Por favor, insira um email válido'
  );
  assert.equal(validateField('senha', 'short'), 'A senha deve ter pelo menos 8 caracteres');
  assert.equal(
    validateField('confirmar_senha', 'different', { senha: 'password' }),
    'As senhas não coincidem'
  );
  assert.equal(validateField('cpf', ''), 'CPF é obrigatório');
  assert.equal(validateField('cpf', '123'), 'CPF deve ter 11 números');
  assert.equal(validateField('cpf', '11111111111'), 'CPF não pode ter todos os números iguais');
  // M-03: verification digits are checked (12345678900 has wrong digits; 123.456.789-09 is sequential).
  assert.equal(validateField('cpf', '12345678900'), 'CPF inválido');
  assert.equal(validateField('cpf', '123.456.789-09'), 'CPF inválido');
  assert.equal(validateField('cpf', '529.982.247-26'), 'CPF inválido');
  assert.equal(validateField('cpf', '529.982.247-25'), '');
  assert.equal(

    validateField('termos', false, { type: 'checkbox', required: true }),
    'Este campo é obrigatório'
  );
});
test('CPF mask matches partial input and limits eleven digits', () => {
  assert.deepEqual(['1', '1234', '1234567', '12345678901'].map(formatCpf), [
    '1',
    '123.4',
    '123.456.7',
    '123.456.789-01'
  ]);
  assert.equal(cpfDigits('123.456.789-0111'), '12345678901');
});
test('registration payload retains raw fields and official aliases, excludes consent/newsletter', () => {
  const form = new FormData();
  for (const [key, value] of Object.entries({
    nome: ' Nome ',
    email: ' E@mail.com ',
    senha: ' password ',
    confirmar_senha: ' password ',
    cpf: '123.456.789-00',
    telefone: '',
    tipo_conta: 'Contratante',
    area_atuacao: '',
    termos: 'on',
    newsletter: 'on'
  }))
    form.append(key, value);
  const data = registrationPayload(form);
  assert.equal(data.senha, ' password ');
  assert.equal(data.nome, ' Nome ');
  assert.equal(data.tipoConta, 'Contratante');
  assert.equal(data.cpf, '12345678900');
  assert.equal('newsletter' in data, false);
  assert.equal('termos' in data, false);
  assert.equal('area_atuacao' in data, false);
  form.set('tipo_conta', 'Freelancer');
  form.set('area_atuacao', 'Design');
  assert.equal(registrationPayload(form).areaAtuacao, 'Design');
});
test('auth URL aliases retain query/hash without intercepting unknown documents', () => {
  assert.equal(aliasDestination('/pages/login.html?q=a%2Fb#test'), '/login?q=a%2Fb#test');
  assert.equal(aliasDestination('/pages/cadastro.html'), '/cadastro');
  assert.equal(aliasDestination('/pages/perfil.html'), '/perfil');
  assert.equal(aliasDestination('/pages/login.html.extra'), null);
});
