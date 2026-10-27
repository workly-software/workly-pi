// Executado pela imagem oficial apenas quando o volume do MongoDB está vazio.
// O Workly completa as sete categorias ao conectar; não criamos contas sem senha.
db = db.getSiblingDB('workly');
db.categorias.updateOne(
  { legacyId: 1 },
  { $setOnInsert: { legacyId: 1, nome: 'Design', slug: 'design' } },
  { upsert: true }
);
