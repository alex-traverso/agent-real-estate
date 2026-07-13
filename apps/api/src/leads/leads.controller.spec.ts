import { LeadsController } from './leads.controller';
import type { LeadsService } from './leads.service';

function createController() {
  const listForAdmin = jest.fn();
  const getByIdForAdmin = jest.fn();
  const getConversationForLead = jest.fn();
  const updateStatus = jest.fn();
  const leads = {
    listForAdmin,
    getByIdForAdmin,
    getConversationForLead,
    updateStatus,
  } as unknown as LeadsService;

  return {
    controller: new LeadsController(leads),
    listForAdmin,
    getByIdForAdmin,
    getConversationForLead,
    updateStatus,
  };
}

describe('LeadsController', () => {
  it('list() delegates to listForAdmin with agency, pagination and status filter', async () => {
    const { controller, listForAdmin } = createController();
    listForAdmin.mockResolvedValue({ data: [], total: 0 });

    await controller.list('agency-1', {
      page: 2,
      limit: 10,
      status: 'contacted',
    });

    expect(listForAdmin).toHaveBeenCalledWith('agency-1', 2, 10, 'contacted');
  });

  it('list() defaults page/limit when the query DTO leaves them unset', async () => {
    const { controller, listForAdmin } = createController();
    listForAdmin.mockResolvedValue({ data: [], total: 0 });

    await controller.list('agency-1', {});

    expect(listForAdmin).toHaveBeenCalledWith('agency-1', 1, 20, undefined);
  });

  it('getById() delegates to getByIdForAdmin scoped by agency', async () => {
    const { controller, getByIdForAdmin } = createController();

    await controller.getById('agency-1', 'lead-1');

    expect(getByIdForAdmin).toHaveBeenCalledWith('agency-1', 'lead-1');
  });

  it('getConversation() delegates to getConversationForLead scoped by agency', async () => {
    const { controller, getConversationForLead } = createController();

    await controller.getConversation('agency-1', 'lead-1');

    expect(getConversationForLead).toHaveBeenCalledWith('agency-1', 'lead-1');
  });

  it('updateStatus() delegates with the status unwrapped from the DTO', async () => {
    const { controller, updateStatus } = createController();

    await controller.updateStatus('agency-1', 'lead-1', { status: 'closed' });

    expect(updateStatus).toHaveBeenCalledWith('agency-1', 'lead-1', 'closed');
  });
});
