import { PropertiesController } from './properties.controller';
import type { PropertiesService } from './properties.service';

function createController() {
  const listForAdmin = jest.fn();
  const listAvailableZones = jest.fn();
  const getByIdForAdmin = jest.fn();
  const create = jest.fn();
  const update = jest.fn();
  const setAvailability = jest.fn();
  const properties = {
    listForAdmin,
    listAvailableZones,
    getByIdForAdmin,
    create,
    update,
    setAvailability,
  } as unknown as PropertiesService;

  return {
    controller: new PropertiesController(properties),
    listForAdmin,
    listAvailableZones,
    getByIdForAdmin,
    create,
    update,
    setAvailability,
  };
}

describe('PropertiesController', () => {
  it('list() forwards pagination and every filter to listForAdmin', async () => {
    const { controller, listForAdmin } = createController();
    listForAdmin.mockResolvedValue({ data: [], total: 0 });

    await controller.list('agency-1', {
      page: 2,
      limit: 10,
      search: 'Santa Fe',
      zone: 'Palermo',
      operation: 'rent',
      type: 'apartment',
      available: true,
      sort: 'price',
      order: 'asc',
    });

    expect(listForAdmin).toHaveBeenCalledWith('agency-1', {
      page: 2,
      limit: 10,
      search: 'Santa Fe',
      zone: 'Palermo',
      operation: 'rent',
      type: 'apartment',
      available: true,
      sort: 'price',
      order: 'asc',
    });
  });

  it('list() defaults pagination and sorting when the query DTO leaves them unset', async () => {
    const { controller, listForAdmin } = createController();
    listForAdmin.mockResolvedValue({ data: [], total: 0 });

    await controller.list('agency-1', {});

    expect(listForAdmin).toHaveBeenCalledWith('agency-1', {
      page: 1,
      limit: 20,
      search: undefined,
      zone: undefined,
      operation: undefined,
      type: undefined,
      available: undefined,
      sort: 'created_at',
      order: 'desc',
    });
  });

  it('listZones() includes unavailable properties, unlike the agent path', async () => {
    const { controller, listAvailableZones } = createController();
    listAvailableZones.mockResolvedValue(['Nordelta', 'Palermo']);

    await expect(controller.listZones('agency-1')).resolves.toEqual([
      'Nordelta',
      'Palermo',
    ]);
    expect(listAvailableZones).toHaveBeenCalledWith('agency-1', false);
  });

  it('getById() delegates to getByIdForAdmin scoped by agency', async () => {
    const { controller, getByIdForAdmin } = createController();

    await controller.getById('agency-1', 'prop-1');

    expect(getByIdForAdmin).toHaveBeenCalledWith('agency-1', 'prop-1');
  });

  it('create() delegates to create() with the caller agency', async () => {
    const { controller, create } = createController();
    const dto = { title: 'Depto' } as never;

    await controller.create('agency-1', dto);

    expect(create).toHaveBeenCalledWith('agency-1', dto);
  });

  it('update() delegates to update() with agency, id and patch', async () => {
    const { controller, update } = createController();
    const dto = { price: 1000 } as never;

    await controller.update('agency-1', 'prop-1', dto);

    expect(update).toHaveBeenCalledWith('agency-1', 'prop-1', dto);
  });

  it('setAvailability() delegates with the boolean unwrapped from the DTO', async () => {
    const { controller, setAvailability } = createController();

    await controller.setAvailability('agency-1', 'prop-1', {
      available: false,
    });

    expect(setAvailability).toHaveBeenCalledWith('agency-1', 'prop-1', false);
  });
});
