import axios from 'axios';
import { describe, expect, test } from 'vitest';
import { TranscriptionJobSchema } from '../src/lib/schemas';

describe('API Contract Tests', () => {
  // Use the URL from env or default to local Palantir instance
  // Note: Palantir runs on 9003 in prod, 3001 in dev usually
  const PALANTIR_URL = process.env.TRANSCRIPTION_API_URL || 'http://localhost:3001/api/v1';

  test('GET /jobs returns valid TranscriptionJob objects', async () => {
    try {
      const response = await axios.get(`${PALANTIR_URL}/jobs?limit=1`);

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);

      if (response.data.data.length > 0) {
        const job = response.data.data[0];
        // Validate against our Zod schema
        const result = TranscriptionJobSchema.safeParse(job);
        if (!result.success) {
          console.error('Schema validation failed:', result.error);
        }
        expect(result.success).toBe(true);
      } else {
        console.warn('No jobs found to validate schema against');
      }
    } catch (error: any) {
      const transientCodes = ['ECONNREFUSED', 'EPERM'];
      if (transientCodes.includes(error.code)) {
        console.warn(`Skipping contract test: Palantir service not reachable at ${PALANTIR_URL}`);
        return;
      }
      throw error;
    }
  });
});
