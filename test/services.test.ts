import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock child_process and util BEFORE importing SystemService
const mockExec = vi.fn();

vi.mock('child_process', () => ({
    exec: mockExec,
}));

vi.mock('util', () => ({
    promisify: (fn: any) => fn, // Return the function as-is since we're mocking exec directly
}));

// Import SystemService AFTER mocks are set up
import { SystemService } from '../src/services';

// TEMPORARILY SKIPPED: child_process mocks not working properly with Vitest/Bun
// Mocks aren't intercepting execAsync calls, causing real sudo commands to run
// TODO: Fix mock timing or use integration tests for SystemService
describe.skip('SystemService', () => {
    let service: SystemService;

    beforeEach(() => {
        vi.clearAllMocks();
        service = SystemService.getInstance();
    });

    describe('getSystemStatus', () => {
        it('should return system status when all checks pass', async () => {
            // Mock exec responses for SSH, VNC, Uptime
            mockExec
                .mockResolvedValueOnce({ stdout: 'active' }) // checkSSHStatus
                .mockResolvedValueOnce({ stdout: '1234' })   // checkVNCStatus (pgrep)
                .mockResolvedValueOnce({ stdout: 'up 1 day' }); // getUptime

            const status = await service.getSystemStatus();

            expect(status.ssh_active).toBe(true);
            expect(status.vnc_running).toBe(true);
            expect(status.vnc_pid).toBe('1234');
            expect(status.uptime).toBe('up 1 day');
        });

        it('should handle failures gracefully', async () => {
            // Mock exec responses
            mockExec
                .mockRejectedValueOnce(new Error('SSH inactive')) // checkSSHStatus
                .mockRejectedValueOnce(new Error('No VNC'))       // checkVNCStatus
                .mockResolvedValueOnce({ stdout: 'up 1 day' });   // getUptime

            const status = await service.getSystemStatus();

            expect(status.ssh_active).toBe(false);
            expect(status.vnc_running).toBe(false);
            expect(status.vnc_pid).toBeNull();
        });
    });

    describe('restartSSH', () => {
        it('should restart SSH successfully', async () => {
            mockExec
                .mockResolvedValueOnce({ stderr: '' }) // restart command
                .mockResolvedValueOnce({ stdout: 'active' }); // status command

            const result = await service.restartSSH();

            expect(result.status).toBe('success');
            expect(mockExec).toHaveBeenCalledWith('sudo systemctl restart ssh');
        });

        it('should handle restart failure', async () => {
            mockExec.mockResolvedValueOnce({ stderr: 'Failed to restart' });

            const result = await service.restartSSH();

            expect(result.status).toBe('error');
        });
    });
});
