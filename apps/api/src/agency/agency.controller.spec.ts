import { AgencyController } from './agency.controller';
import type { AgencyService } from './agency.service';
import type { CreateAgencyDto } from './dto/create-agency.dto';

function createController() {
  const findByUserId = jest.fn();
  const createForUser = jest.fn();
  const agency = { findByUserId, createForUser } as unknown as AgencyService;

  return {
    controller: new AgencyController(agency),
    findByUserId,
    createForUser,
  };
}

describe('AgencyController', () => {
  describe('getMine', () => {
    it('wraps the resolved agency in { agency }', async () => {
      const { controller, findByUserId } = createController();
      findByUserId.mockResolvedValue({ id: 'agency-1' });

      const result = await controller.getMine('user-1');

      expect(result).toEqual({ agency: { id: 'agency-1' } });
      expect(findByUserId).toHaveBeenCalledWith('user-1');
    });

    it('returns { agency: null } for a user with no agency, not an error', async () => {
      const { controller, findByUserId } = createController();
      findByUserId.mockResolvedValue(null);

      expect(await controller.getMine('user-1')).toEqual({ agency: null });
    });
  });

  describe('create', () => {
    it('delegates to AgencyService.createForUser with the caller userId', async () => {
      const dto: CreateAgencyDto = {
        name: 'Inmobiliaria Test',
        email: 'test@agency.com',
      };
      const { controller, createForUser } = createController();
      createForUser.mockResolvedValue({ id: 'agency-1' });

      const result = await controller.create('user-1', dto);

      expect(result).toEqual({ id: 'agency-1' });
      expect(createForUser).toHaveBeenCalledWith('user-1', dto);
    });
  });
});
