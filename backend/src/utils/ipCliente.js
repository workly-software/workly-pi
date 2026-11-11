const net = require('net');

function lerConfiancaProxy(bruto) {
  const texto = typeof bruto === 'string' ? bruto.trim() : '';
  if (!texto || texto.toLowerCase() === 'false') return false;
  if (texto.toLowerCase() === 'true' || /^\d+$/.test(texto)) {
    throw new Error(
      'TRUST_PROXY deve listar os endereços ou sub-redes do proxy (ex.: loopback, uniquelocal, 10.0.0.5); "true" e contagem de saltos não são aceitos.'
    );
  }
  return texto
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function chaveIpCliente(ip) {
  const endereco = String(ip || '').split('%')[0];
  if (net.isIPv4(endereco)) return endereco;
  const mapeado = endereco.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
  if (mapeado && net.isIPv4(mapeado[1])) return mapeado[1];
  if (!net.isIPv6(endereco) || endereco.includes('.')) return endereco || 'desconhecido';

  const [inicio, fim = ''] = endereco.toLowerCase().split('::');
  const grupos = inicio ? inicio.split(':') : [];
  const finais = endereco.includes('::') && fim ? fim.split(':') : [];
  const completos = [...grupos, ...Array(8 - grupos.length - finais.length).fill('0'), ...finais];
  return `${completos.slice(0, 4).map((g) => g.replace(/^0+(?=.)/, '')).join(':')}::/64`;
}

module.exports = { lerConfiancaProxy, chaveIpCliente };
