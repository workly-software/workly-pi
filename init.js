db = db.getSiblingDB('workly');
db.categorias.updateOne(
  { legacyId: 1 },
  { $setOnInsert: { legacyId: 1, nome: 'Design', slug: 'design' } },
  { upsert: true }
);
