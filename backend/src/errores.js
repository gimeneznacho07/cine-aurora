'use strict';

/** Error previsto del negocio: se traduce a una respuesta HTTP con código y mensaje claros. */
class ErrorNegocio extends Error {
  constructor(codigo, mensaje, status = 400) {
    super(mensaje);
    this.name = 'ErrorNegocio';
    this.codigo = codigo;
    this.status = status;
  }
}

module.exports = { ErrorNegocio };
