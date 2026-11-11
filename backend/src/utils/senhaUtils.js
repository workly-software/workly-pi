function motivoNovaSenhaInvalida(senha) {
  if (typeof senha !== 'string' || !senha) return 'Informe a nova senha.';
  if (senha.length < 8) return 'A senha deve ter pelo menos 8 caracteres.';
  if (senha.length > 128) return 'A senha deve ter no máximo 128 caracteres.';
  if (Buffer.byteLength(senha, 'utf8') > 72) return 'A senha deve ter no máximo 72 bytes (acentos e emojis podem ocupar mais de um byte).';
  return null;
}
module.exports = { motivoNovaSenhaInvalida };
