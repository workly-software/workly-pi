const STATUS_DEPOIS_DO_ACEITE = ['proposta_aceita', 'em_andamento', 'entregue', 'concluido', 'encerrado'];
const VALOR_MAXIMO = 1000000;

function valorValido(valor) {
  return typeof valor === 'number' && Number.isFinite(valor) && valor > 0;
}

function estadoAcordo(contrato) {
  const preco = valorValido(contrato.preco) ? contrato.preco : null;
  const precoProposto = valorValido(contrato.precoProposto) ? contrato.precoProposto : null;

  if (contrato.tipoContratacao !== 'combinar') {
    return preco
      ? { estado: 'fechado', valorAcordado: preco, valorEmNegociacao: null }
      : { estado: 'pendente_acordo', valorAcordado: null, valorEmNegociacao: null };
  }

  const persistido = contrato.negociacao?.estado;
  if (persistido === 'fechado') {
    return { estado: 'fechado', valorAcordado: preco, valorEmNegociacao: null };
  }
  if (persistido) {
    return { estado: persistido, valorAcordado: null, valorEmNegociacao: precoProposto };
  }

  if (contrato.status === 'proposta_pendente') {
    return { estado: 'aguardando_freelancer', valorAcordado: null, valorEmNegociacao: precoProposto ?? preco };
  }
  const valorAntigo = precoProposto ?? preco;
  if (STATUS_DEPOIS_DO_ACEITE.includes(contrato.status) && valorAntigo) {
    return { estado: 'fechado', valorAcordado: valorAntigo, valorEmNegociacao: null };
  }
  return { estado: 'pendente_acordo', valorAcordado: null, valorEmNegociacao: null };
}

function vezNaNegociacao(contrato, acordo = estadoAcordo(contrato)) {
  if (contrato.tipoContratacao !== 'combinar') return null;
  if (acordo.estado === 'aguardando_freelancer') return 'freelancer';
  if (acordo.estado === 'aguardando_cliente') return 'cliente';
  if (acordo.estado === 'pendente_acordo') return 'ambos';
  return null;
}

function validarValor(bruto) {
  if (typeof bruto !== 'number' && typeof bruto !== 'string') {
    return { erro: 'Informe o valor em reais.' };
  }
  if (typeof bruto === 'string' && !/^\s*\d+(\.\d{1,2})?\s*$/.test(bruto)) {
    return { erro: 'O valor deve ser um número maior que zero, com até dois decimais.' };
  }
  const valor = Number(bruto);
  if (!Number.isFinite(valor) || valor <= 0) {
    return { erro: 'O valor deve ser um número maior que zero, com até dois decimais.' };
  }
  if (Math.abs(Math.round(valor * 100) - valor * 100) > 1e-6) {
    return { erro: 'O valor deve ter no máximo dois decimais.' };
  }
  if (valor > VALOR_MAXIMO) {
    return { erro: 'O valor informado é maior que o permitido.' };
  }
  return { valor };
}

function validarJustificativa(bruta) {
  const texto = typeof bruta === 'string' ? bruta.trim() : '';
  if (texto.length < 10) return { erro: 'Explique o ajuste necessário (mínimo de 10 caracteres).' };
  if (texto.length > 1000) return { erro: 'A justificativa deve ter no máximo 1000 caracteres.' };
  return { texto };
}

module.exports = { estadoAcordo, vezNaNegociacao, validarValor, validarJustificativa, valorValido };
