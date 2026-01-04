/**
 * Zod validation schemas for API responses and request parameters
 */
import { z } from 'zod';

// Transcription Job Schema
export const TranscriptionJobSchema = z.object({
  id: z.string(),
  name: z.string(),
  status: z.enum(['pending', 'processing', 'completed', 'failed']),
  progress: z.number().min(0).max(100).optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  completedAt: z.string().optional(),
  error: z.string().optional(),
  metadata: z.record(z.string(), z.any()).optional(),
});

// API Response Schemas
export const JobsResponseSchema = z.object({
  status: z.enum(['success', 'error']),
  data: z.array(TranscriptionJobSchema),
  total: z.number().optional(),
  message: z.string().optional(),
});

export const JobResponseSchema = z.object({
  status: z.enum(['success', 'error']),
  data: TranscriptionJobSchema.optional(),
  message: z.string().optional(),
});

// Query Parameter Schemas
export const ListJobsQuerySchema = z.object({
  limit: z
    .string()
    .optional()
    .transform((val) => {
      if (!val) return 10;
      const num = parseInt(val, 10);
      if (Number.isNaN(num) || num < 1 || num > 100) {
        throw new Error('limit must be between 1 and 100');
      }
      return num;
    }),
});

export const DaysQuerySchema = z.object({
  days: z
    .string()
    .optional()
    .transform((val) => {
      if (!val) return 7;
      const num = parseInt(val, 10);
      if (Number.isNaN(num) || num < 1 || num > 365) {
        throw new Error('days must be between 1 and 365');
      }
      return num;
    }),
});

// Type exports
export type TranscriptionJob = z.infer<typeof TranscriptionJobSchema>;
export type JobsResponse = z.infer<typeof JobsResponseSchema>;
export type JobResponse = z.infer<typeof JobResponseSchema>;
