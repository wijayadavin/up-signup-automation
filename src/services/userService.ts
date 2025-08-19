import { getDatabase } from '../database/connection.js';
import { getLogger } from '../utils/logger.js';
import type { 
  User, 
  CreateUserInput, 
  UpdateUserAttemptInput, 
  UpdateUserSuccessInput,
  UpdateUserCaptchaFlagInput,
  UpdateUserUpCreatedAtInput
} from '../types/database.js';

const logger = getLogger(import.meta.url);

export class UserService {
  private db = getDatabase();

  async createUser(input: CreateUserInput): Promise<User> {
    try {
      const [user] = await this.db
        .insertInto('users')
        .values({
          first_name: input.first_name,
          last_name: input.last_name,
          email: input.email,
          password: input.password,
          country_code: input.country_code,
          attempt_count: 0,
        })
        .returningAll()
        .execute();

      logger.info({ userId: user.id, email: user.email }, 'User created successfully');
      return user;
    } catch (error) {
      logger.error(error, 'Failed to create user');
      throw error;
    }
  }

  async getUserById(id: number): Promise<User | null> {
    try {
      const user = await this.db
        .selectFrom('users')
        .selectAll()
        .where('id', '=', id)
        .executeTakeFirst();

      return user || null;
    } catch (error) {
      logger.error(error, 'Failed to get user by ID');
      throw error;
    }
  }

  async getUserByEmail(email: string): Promise<User | null> {
    try {
      const user = await this.db
        .selectFrom('users')
        .selectAll()
        .where('email', '=', email)
        .executeTakeFirst();

      return user || null;
    } catch (error) {
      logger.error(error, 'Failed to get user by email');
      throw error;
    }
  }

  async getPendingUsers(limit: number = 10): Promise<User[]> {
    try {
      const users = await this.db
        .selectFrom('users')
        .selectAll()
        .where('success_at', 'is', null)
        .where('up_created_at', 'is not', null)
        .where('captcha_flagged_at', 'is', null) // Exclude captcha-flagged users from normal processing
        .orderBy('attempt_count', 'asc')
        .orderBy('created_at', 'asc')
        .limit(limit)
        .execute();

      return users;
    } catch (error) {
      logger.error(error, 'Failed to get pending users');
      throw error;
    }
  }

  async getCaptchaFlaggedUsers(limit: number = 10): Promise<User[]> {
    try {
      const users = await this.db
        .selectFrom('users')
        .selectAll()
        .where('success_at', 'is', null) // No success yet
        .where('up_created_at', 'is not', null) // Has up_created_at (normally allowed to run)
        .where('captcha_flagged_at', 'is not', null) // Only captcha-flagged users
        .orderBy('captcha_flagged_at', 'asc') // Process oldest captcha flags first
        .limit(limit)
        .execute();

      return users;
    } catch (error) {
      logger.error(error, 'Failed to get captcha-flagged users');
      throw error;
    }
  }

  async getFailedUsers(limit: number = 10): Promise<User[]> {
    try {
      const users = await this.db
        .selectFrom('users')
        .selectAll()
        .where('success_at', 'is', null) // No success yet
        .where('up_created_at', 'is not', null) // Has up_created_at (normally allowed to run)
        .where('captcha_flagged_at', 'is', null) // Exclude captcha-flagged users (handled separately)
        .where('rate_step_completed_at', 'is', null) // Include only users who haven't completed rate step yet
        .orderBy('last_attempt_at', 'asc') // Process oldest failures first
        .limit(limit)
        .execute();

      return users;
    } catch (error) {
      logger.error(error, 'Failed to get failed users');
      throw error;
    }
  }

  async updateUserAttempt(id: number, input: UpdateUserAttemptInput): Promise<User> {
    try {
      const [user] = await this.db
        .updateTable('users')
        .set({
          last_attempt_at: input.last_attempt_at,
          attempt_count: input.attempt_count,
          last_error_code: input.last_error_code || null,
          last_error_message: input.last_error_message || null,
          updated_at: new Date(),
        })
        .where('id', '=', id)
        .returningAll()
        .execute();

      logger.info({ userId: id, attemptCount: input.attempt_count }, 'User attempt updated');
      return user;
    } catch (error) {
      logger.error(error, 'Failed to update user attempt');
      throw error;
    }
  }

  async updateUserSuccess(id: number, input: UpdateUserSuccessInput): Promise<User> {
    try {
      const [user] = await this.db
        .updateTable('users')
        .set({
          success_at: input.success_at,
          updated_at: new Date(),
        })
        .where('id', '=', id)
        .returningAll()
        .execute();

      logger.info({ userId: id }, 'User marked as successful');
      return user;
    } catch (error) {
      logger.error(error, 'Failed to update user success');
      throw error;
    }
  }

  async updateUserCaptchaFlag(id: number, input: UpdateUserCaptchaFlagInput): Promise<User> {
    try {
      const [user] = await this.db
        .updateTable('users')
        .set({
          captcha_flagged_at: input.captcha_flagged_at,
          updated_at: new Date(),
        })
        .where('id', '=', id)
        .returningAll()
        .execute();

      logger.info({ userId: id }, 'User flagged for captcha');
      return user;
    } catch (error) {
      logger.error(error, 'Failed to update user captcha flag');
      throw error;
    }
  }

  async clearUserCaptchaFlag(id: number): Promise<User> {
    try {
      const [user] = await this.db
        .updateTable('users')
        .set({
          captcha_flagged_at: null,
          updated_at: new Date(),
        })
        .where('id', '=', id)
        .returningAll()
        .execute();

      logger.info({ userId: id }, 'User captcha flag cleared');
      return user;
    } catch (error) {
      logger.error(error, 'Failed to clear user captcha flag');
      throw error;
    }
  }

  async updateUserLocation(id: number, input: {
    location_street_address?: string | null;
    location_city?: string | null;
    location_state?: string | null;
    location_post_code?: string | null;
  }): Promise<User> {
    try {
      const [user] = await this.db
        .updateTable('users')
        .set({
          location_street_address: input.location_street_address,
          location_city: input.location_city,
          location_state: input.location_state,
          location_post_code: input.location_post_code,
          updated_at: new Date(),
        })
        .where('id', '=', id)
        .returningAll()
        .execute();

      logger.info({ userId: id }, 'User location updated');
      return user;
    } catch (error) {
      logger.error(error, 'Failed to update user location');
      throw error;
    }
  }

  async updateUserBirthDate(id: number, birthDate: Date): Promise<User> {
    try {
      const [user] = await this.db
        .updateTable('users')
        .set({
          birth_date: birthDate,
          updated_at: new Date(),
        })
        .where('id', '=', id)
        .returningAll()
        .execute();

      logger.info({ userId: id, birthDate }, 'User birth date updated');
      return user;
    } catch (error) {
      logger.error(error, 'Failed to update user birth date');
      throw error;
    }
  }

  async updateUserCountryCode(id: number, countryCode: string): Promise<User> {
    try {
      const [user] = await this.db
        .updateTable('users')
        .set({
          country_code: countryCode,
          updated_at: new Date(),
        })
        .where('id', '=', id)
        .returningAll()
        .execute();

      logger.info({ userId: id, countryCode }, 'User country code updated');
      return user;
    } catch (error) {
      logger.error(error, 'Failed to update user country code');
      throw error;
    }
  }

  async updateUserUpCreatedAt(id: number, input: UpdateUserUpCreatedAtInput): Promise<User> {
    try {
      const [user] = await this.db
        .updateTable('users')
        .set({
          up_created_at: input.up_created_at,
          updated_at: new Date(),
        })
        .where('id', '=', id)
        .returningAll()
        .execute();

      logger.info({ userId: id, upCreatedAt: input.up_created_at }, 'User up_created_at updated');
      return user;
    } catch (error) {
      logger.error(error, 'Failed to update user up_created_at');
      throw error;
    }
  }

  async updateUserLastProxyPort(id: number, proxyPort: number): Promise<User> {
    try {
      const [user] = await this.db
        .updateTable('users')
        .set({
          last_proxy_port: proxyPort,
          updated_at: new Date(),
        })
        .where('id', '=', id)
        .returningAll()
        .execute();

      logger.info({ userId: id, proxyPort }, 'User last_proxy_port updated');
      return user;
    } catch (error) {
      logger.error(error, 'Failed to update user last_proxy_port');
      throw error;
    }
  }

  async getAllUsers(): Promise<User[]> {
    try {
      const users = await this.db
        .selectFrom('users')
        .selectAll()
        .orderBy('created_at', 'desc')
        .execute();

      return users;
    } catch (error) {
      logger.error(error, 'Failed to get all users');
      throw error;
    }
  }

  async getStats(): Promise<{
    total: number;
    successful: number;
    pending: number;
    failed: number;
  }> {
    try {
      const [total] = await this.db
        .selectFrom('users')
        .select((eb) => eb.fn.countAll().as('count'))
        .execute();

      const [successful] = await this.db
        .selectFrom('users')
        .select((eb) => eb.fn.countAll().as('count'))
        .where('success_at', 'is not', null)
        .execute();

      const [pending] = await this.db
        .selectFrom('users')
        .select((eb) => eb.fn.countAll().as('count'))
        .where('success_at', 'is', null)
        .where('up_created_at', 'is not', null)
        .where('attempt_count', '=', 0)
        .execute();

      const [failed] = await this.db
        .selectFrom('users')
        .select((eb) => eb.fn.countAll().as('count'))
        .where('success_at', 'is', null)
        .where('attempt_count', '>', 0)
        .execute();

      return {
        total: Number(total.count),
        successful: Number(successful.count),
        pending: Number(pending.count),
        failed: Number(failed.count),
      };
    } catch (error) {
      logger.error(error, 'Failed to get stats');
      throw error;
    }
  }

  /**
   * Validates that a user can be marked as successful
   * @param user The user to validate
   * @throws Error if user cannot be marked as successful
   */
  validateUserForSuccess(user: User): void {
    // Model validation: ensure user has a phone number
    if (!user.phone || user.phone.trim() === '') {
      throw new Error(`User ${user.id} must have a phone number to be marked as successful`);
    }

    // Check if user is already marked as successful
    if (user.success_at) {
      throw new Error(`User ${user.id} is already marked as successful at ${user.success_at}`);
    }
  }

  /**
   * Marks a user as successful with validation
   * @param userId The user ID to mark as successful
   * @param user The user object for validation
   * @throws Error if validation fails
   */
  async markUserAsSuccessful(userId: number, user: User): Promise<void> {
    // Validate user can be marked as successful
    this.validateUserForSuccess(user);

    try {
      await this.db
        .updateTable('users')
        .set({ success_at: new Date() })
        .where('id', '=', userId)
        .execute();

      logger.info({ userId }, 'User marked as successful');
    } catch (error) {
      logger.error(error, 'Failed to mark user as successful');
      throw error;
    }
  }
}
