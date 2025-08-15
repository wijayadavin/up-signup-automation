import { Generated } from 'kysely';

export interface Database {
  users: UsersTable;
  migrations: MigrationsTable;
}

export interface MigrationsTable {
  id: Generated<number>;
  name: string;
  executed_at: Date;
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
