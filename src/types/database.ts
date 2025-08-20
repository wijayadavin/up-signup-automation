import { Generated } from 'kysely';

export interface Database {
  users: UsersTable;
  migrations: MigrationsTable;
  requests: RequestsTable;
}

export interface MigrationsTable {
  id: Generated<number>;
  name: string;
  executed_at: Date;
}

export interface RequestsTable {
  id: Generated<number>;
  user_id: number;
  status: string;
  attempt_count: number;
  started_at: Generated<Date>;
  completed_at: Date | null;
  error_code: string | null;
  error_message: string | null;
  options: any | null; // JSONB field for storing command options
  country_code: string | null;
}

export interface UsersTable {
  id: Generated<number>;
  first_name: string;
  last_name: string;
  email: string;
  password: string;
  country_code: string;
  last_attempt_at: Date | null;
  attempt_count: number;
  last_error_code: string | null;
  last_error_message: string | null;
  success_at: Date | null;
  captcha_flagged_at: Date | null;
  location_street_address: string | null;
  location_city: string | null;
  location_state: string | null;
  location_post_code: string | null;
  birth_date: Date | null;
  phone: string | null;
  onboarding_completed_at: Date | null;
  last_session_state: string | null;
  last_proxy_port: number;
  otp: number | null;
  otp_provider: string | null;
  rate_step_completed_at: Date | null;
  up_created_at: Date | null;
  avatar_uploaded_at: Date | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface User {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
  password: string;
  country_code: string;
  last_attempt_at: Date | null;
  attempt_count: number;
  last_error_code: string | null;
  last_error_message: string | null;
  success_at: Date | null;
  captcha_flagged_at: Date | null;
  location_street_address: string | null;
  location_city: string | null;
  location_state: string | null;
  location_post_code: string | null;
  birth_date: Date | null;
  phone: string | null;
  onboarding_completed_at: Date | null;
  last_session_state: string | null;
  last_proxy_port: number;
  otp: number | null;
  otp_provider: string | null;
  rate_step_completed_at: Date | null;
  up_created_at: Date | null;
  avatar_uploaded_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface CreateUserInput {
  first_name: string;
  last_name: string;
  email: string;
  password: string;
  country_code: string;
}

export interface UpdateUserAttemptInput {
  last_attempt_at: Date;
  attempt_count: number;
  last_error_code?: string;
  last_error_message?: string;
}

export interface UpdateUserSuccessInput {
  success_at: Date;
}

export interface UpdateUserCaptchaFlagInput {
  captcha_flagged_at: Date;
}

export interface UpdateUserUpCreatedAtInput {
  up_created_at: Date;
}

export interface Request {
  id: number;
  user_id: number;
  status: string;
  attempt_count: number;
  started_at: Date;
  completed_at: Date | null;
  error_code: string | null;
  error_message: string | null;
  options: any | null;
  country_code: string | null;
}

export interface CreateRequestInput {
  user_id: number;
  status?: string;
  attempt_count?: number;
  error_code?: string;
  error_message?: string;
  options?: any;
  country_code?: string;
}

export interface UpdateRequestInput {
  status?: string;
  attempt_count?: number;
  completed_at?: Date;
  error_code?: string;
  error_message?: string;
  country_code?: string;
}
