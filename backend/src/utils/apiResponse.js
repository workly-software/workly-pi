function jsonBase(payload) {
  return {
    ...payload,
    message: payload.mensagem
  };
}

function sucesso(res, status, mensagem, dados = null, extras = {}) {
  return res.status(status).json(
    jsonBase({
      sucesso: true,
      mensagem,
      dados,
      ...extras
    })
  );
}

function erro(res, status, mensagem, extras = {}) {
  return res.status(status).json(
    jsonBase({
      sucesso: false,
      mensagem,
      ...extras
    })
  );
}

module.exports = { sucesso, erro };
