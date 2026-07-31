import { EscalationService } from './escalation.service';
import type { LeadsService } from '../leads/leads.service';
import type { AgencyService } from '../agency/agency.service';
import type { NotificationsService } from '../notifications/notifications.service';
import type { SaveLeadInput } from '../leads/types/lead-input.type';

const INPUT: SaveLeadInput = {
  phone: '5491122334455',
  name: 'Juan',
  notes: 'quiere hablar con una persona',
};

function makeService(opts: { advisorEmail?: string | null } = {}) {
  const saveLead = jest.fn().mockResolvedValue({ id: 'lead-1' });
  const getContactEmail = jest
    .fn()
    .mockResolvedValue(
      opts.advisorEmail === undefined
        ? 'advisor@agency.com'
        : opts.advisorEmail,
    );
  const notifyAdvisor = jest.fn().mockResolvedValue(undefined);

  const leads = { saveLead } as unknown as LeadsService;
  const agency = { getContactEmail } as unknown as AgencyService;
  const notifications = { notifyAdvisor } as unknown as NotificationsService;

  return {
    service: new EscalationService(leads, agency, notifications),
    saveLead,
    getContactEmail,
    notifyAdvisor,
  };
}

describe('EscalationService', () => {
  it('saves the lead, links the conversation, and notifies the advisor', async () => {
    const { service, saveLead, getContactEmail, notifyAdvisor } = makeService();

    const lead = await service.escalate('agency-1', INPUT, 'conv-1');

    expect(lead).toEqual({ id: 'lead-1' });
    expect(saveLead).toHaveBeenCalledWith('agency-1', INPUT, 'conv-1');
    expect(getContactEmail).toHaveBeenCalledWith('agency-1');
    expect(notifyAdvisor).toHaveBeenCalledWith('advisor@agency.com', {
      id: 'lead-1',
    });
  });

  it('works without a conversationId to link', async () => {
    const { service, saveLead } = makeService();

    await service.escalate('agency-1', INPUT);

    expect(saveLead).toHaveBeenCalledWith('agency-1', INPUT, undefined);
  });

  it('logs and skips notification when the agency has no advisor email', async () => {
    const { service, notifyAdvisor } = makeService({ advisorEmail: null });

    const lead = await service.escalate('agency-1', INPUT, 'conv-1');

    expect(lead).toEqual({ id: 'lead-1' });
    expect(notifyAdvisor).not.toHaveBeenCalled();
  });

  it('propagates a failed lead save (the caller must handle it)', async () => {
    const { service, saveLead } = makeService();
    saveLead.mockRejectedValueOnce(new Error('db down'));

    await expect(service.escalate('agency-1', INPUT)).rejects.toThrow(
      'db down',
    );
  });
});
