import { buildPropertyEmbeddingInput } from './embedding-input';

describe('buildPropertyEmbeddingInput', () => {
  it('composes the full template from all fields', () => {
    const text = buildPropertyEmbeddingInput({
      title: 'Depto luminoso',
      description: 'Muy lindo',
      zone: 'Palermo',
      type: 'apartment',
      operation: 'sale',
      rooms: 3,
      bedrooms: 2,
      parking: true,
    });

    expect(text).toBe(
      'Depto luminoso Muy lindo Zona: Palermo. Tipo: apartment. ' +
        'Operación: sale. 3 ambientes. 2 dormitorios. Con cochera.',
    );
  });

  it('drops empty and absent optional parts', () => {
    const text = buildPropertyEmbeddingInput({
      title: 'Lote',
      zone: 'Pilar',
      type: 'land',
      operation: 'sale',
    });

    expect(text).toBe('Lote Zona: Pilar. Tipo: land. Operación: sale.');
  });

  it('omits "Con cochera." when parking is false', () => {
    const text = buildPropertyEmbeddingInput({
      title: 'PH',
      zone: 'Villa Crespo',
      type: 'ph',
      operation: 'rent',
      parking: false,
    });

    expect(text).not.toContain('Con cochera.');
  });
});
