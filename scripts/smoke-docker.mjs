import assert from 'node:assert/strict';

const base = process.env.WORKLY_URL || 'http://localhost:8080';
async function obter(rota, status = 200) {
  const resposta = await fetch(new URL(rota, base), { signal: AbortSignal.timeout(15000) });
  assert.equal(resposta.status, status, `${rota}: status inesperado`);
  return resposta;
}
const html = await (await obter('/')).text();
assert.match(html, /<title>Workly<\/title>/);
assert.equal(await (await obter('/login')).text(), html, 'Rota React deve servir a SPA');
const scripts = [...html.matchAll(/src="([^"]+\.js)"/g)];
assert.ok(scripts.length, 'Bundle JavaScript deve existir');
for (const [, url] of scripts) {
  assert.match((await obter(url)).headers.get('content-type'), /javascript/);
}
for (const rota of ['/assets/img/logo.png', '/vendor/poppins.css', '/uploads/perfis/perfil_padrao.svg']) {
  await obter(rota);
}
const catalogo = await (await obter('/api/servicos?limit=1')).json();
assert.equal(catalogo.sucesso, true, 'Nginx deve alcançar a API e o MongoDB');
await obter('/react-assets/inexistente.js', 404);
await obter('/api/rota-inexistente', 404);
console.log('Smoke Docker aprovado: SPA, JavaScript, imagens, uploads, proxy, API e banco.');
