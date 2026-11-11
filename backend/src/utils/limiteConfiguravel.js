function lerLimitePositivo(bruto, padrao) {
  const texto = typeof bruto === 'string' ? bruto.trim() : '';
  if (!/^\d+$/.test(texto)) return padrao;
  const valor = Number(texto);
  return Number.isSafeInteger(valor) && valor > 0 ? valor : padrao;
}

module.exports = { lerLimitePositivo };
