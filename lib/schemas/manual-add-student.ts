import { z } from 'zod';

const optionalShortText = (max: number) =>
  z.string().trim().max(max).optional();

export const ManualAddStudentSchema = z.object({
  student_number: z
    .string()
    .trim()
    .min(1, 'Student number is required'),
  last_name: z.string().trim().min(1, 'Last name is required'),
  first_name: z.string().trim().min(1, 'First name is required'),
  middle_name: z.string().trim().optional(),
  late_enrollee: z.boolean(),
  bus_no: optionalShortText(40),
  classroom_officer_role: optionalShortText(80),
});

export type ManualAddStudentInput = z.infer<typeof ManualAddStudentSchema>;
