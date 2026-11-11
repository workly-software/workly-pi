// só remove a pontuação. Não corta em 11 dígitos: um CPF longo demais é recusado, não truncado.
function normalizarCpf(cpf = '') {
  return String(cpf).replace(/\D/g, '');
}

function formatarCpf(cpf = '') {
  const digits = normalizarCpf(cpf).slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9, 11)}`;
}

function cpfRepetido(cpf = '') {
  const digits = normalizarCpf(cpf);
  return /^(\d)\1{10}$/.test(digits);
}

function cpfSequencial(cpf = '') {
  const digits = normalizarCpf(cpf);
  if (digits.length !== 11) return false;

  // Bloqueia bases como 123.456.789-09, 987.654.321-00, 012.345.678-90 etc.
  // A checagem usa os 9 primeiros dígitos porque os 2 últimos são dígitos verificadores.
  const base = digits.slice(0, 9);
  const crescente = '01234567890123456789';
  const decrescente = '98765432109876543210';

  return crescente.includes(base) || decrescente.includes(base);
}

function calcularDigito(cpfParcial, fatorInicial) {
  let soma = 0;
  for (let i = 0; i < cpfParcial.length; i += 1) {
    soma += Number(cpfParcial[i]) * (fatorInicial - i);
  }

  const resto = (soma * 10) % 11;
  return resto === 10 || resto === 11 ? 0 : resto;
}

function digitosVerificadoresValidos(digits) {
  return (
    calcularDigito(digits.slice(0, 9), 10) === Number(digits[9]) &&
    calcularDigito(digits.slice(0, 10), 11) === Number(digits[10])
  );
}

// CPF válido: 11 números, dígitos verificadores corretos e base que não seja repetida (111.111.111-11)
// nem sequencial (123.456.789-09), combinações que têm dígitos certos mas não são de ninguém.
function validarCpf(cpf = '') {
  const digits = normalizarCpf(cpf);
  if (digits.length !== 11) return false;
  if (cpfRepetido(digits) || cpfSequencial(digits)) return false;
  return digitosVerificadoresValidos(digits);
}

// recebe o valor como veio na requisição: além dos números, só aceita a pontuação usual (ponto, hífen, espaço).
function motivoCpfInvalido(cpf = '') {
  const texto = typeof cpf === 'string' || typeof cpf === 'number' ? String(cpf).trim() : '';
  const digits = normalizarCpf(texto);

  if (!digits) return 'CPF é obrigatório.';
  if (!/^[\d.\-\s]+$/.test(texto)) return 'CPF inválido.';
  if (digits.length !== 11) return 'CPF deve ter 11 números.';
  if (cpfRepetido(digits)) return 'CPF não pode ter todos os números iguais.';
  if (!validarCpf(digits)) return 'CPF inválido.';

  return '';
}

function gerarCpfValido(baseNumerica = 1) {
  let tentativa = Math.max(1, Number(baseNumerica) || 1);

  while (tentativa < 999999999) {
    const base = String(tentativa).padStart(9, '0').slice(-9);
    const primeiroDigito = calcularDigito(base, 10);
    const segundoDigito = calcularDigito(`${base}${primeiroDigito}`, 11);
    const cpf = `${base}${primeiroDigito}${segundoDigito}`;

    if (validarCpf(cpf)) return cpf;
    tentativa += 37;
  }

  throw new Error('Não foi possível gerar CPF válido para o seed.');
}

module.exports = {
  normalizarCpf,
  formatarCpf,
  cpfRepetido,
  cpfSequencial,
  validarCpf,
  motivoCpfInvalido,
  gerarCpfValido
};
