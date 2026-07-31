import { StatsController } from './stats.controller';
import type { StatsService } from './stats.service';

describe('StatsController', () => {
  it('getStats() delegates to the service with the caller agency', async () => {
    const getAgencyStats = jest.fn().mockResolvedValue({ ok: true });
    const controller = new StatsController({
      getAgencyStats,
    } as unknown as StatsService);

    await expect(controller.getStats('agency-1')).resolves.toEqual({
      ok: true,
    });
    expect(getAgencyStats).toHaveBeenCalledWith('agency-1');
  });
});
