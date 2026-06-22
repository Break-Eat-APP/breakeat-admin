import { ExpoPushService } from './expo-push.service';

describe('ExpoPushService', () => {
  describe('isExpoPushToken', () => {
    it('accepts valid ExponentPushToken format', () => {
      expect(ExpoPushService.isExpoPushToken('ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]')).toBe(true);
    });
    it('accepts valid ExpoPushToken format', () => {
      expect(ExpoPushService.isExpoPushToken('ExpoPushToken[abc123]')).toBe(true);
    });
    it('rejects garbage', () => {
      expect(ExpoPushService.isExpoPushToken('not-a-token')).toBe(false);
      expect(ExpoPushService.isExpoPushToken('')).toBe(false);
      expect(ExpoPushService.isExpoPushToken('ExponentPushToken[]')).toBe(false);
    });
  });

  describe('send', () => {
    it('counts invalid tokens as failed without calling Expo', async () => {
      const svc = new ExpoPushService();
      const fetchSpy = jest.spyOn(global, 'fetch');
      const res = await svc.send([{ to: 'bad', title: 'Hi' }]);
      expect(res.sent).toBe(0);
      expect(res.failed).toBe(1);
      expect(res.invalidTokens).toEqual(['bad']);
      expect(fetchSpy).not.toHaveBeenCalled();
      fetchSpy.mockRestore();
    });
  });
});
