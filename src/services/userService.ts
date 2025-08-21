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
      // Assign a unique proxy port for the new user
      const proxyPort = await this.assignUniqueProxyPortForNewUser();
      if (!proxyPort) {
        throw new Error('Failed to assign unique proxy port for new user');
      }

      const [user] = await this.db
        .insertInto('users')
        .values({
          first_name: input.first_name,
          last_name: input.last_name,
          email: input.email,
          password: input.password,
          country_code: input.country_code,
          attempt_count: 0,
          last_proxy_port: proxyPort,
        })
        .returningAll()
        .execute();

      logger.info({ userId: user.id, email: user.email, proxyPort }, 'User created successfully with proxy port');
      return user;
    } catch (error) {
      logger.error(error, 'Failed to create user');
      throw error;
    }
  }

  /**
   * Assign a unique proxy port for a new user
   */
  private async assignUniqueProxyPortForNewUser(): Promise<number | null> {
    const basePort = 10001;
    const maxPort = 10100;
    
    // Try to find an available port
    for (let port = basePort; port <= maxPort; port++) {
      const isAvailable = await this.isProxyPortUnique(port);
      if (isAvailable) {
        return port;
      }
    }
    
    // No available ports found
    return null;
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
        .where('attempt_count', '<', 5) // Maximum 5 attempts per user
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
        .where('attempt_count', '<', 5) // Maximum 5 attempts per user
        .orderBy('last_attempt_at', 'asc') // Process oldest failures first
        .limit(limit)
        .execute();

      return users;
    } catch (error) {
      logger.error(error, 'Failed to get failed users');
      throw error;
    }
  }

  /**
   * Get users that need retry (failed users with less than 5 attempts)
   */
  async getUsersForRetry(limit: number = 10): Promise<User[]> {
    try {
      const users = await this.db
        .selectFrom('users')
        .selectAll()
        .where('success_at', 'is', null) // No success yet
        .where('up_created_at', 'is not', null) // Has up_created_at (normally allowed to run)
        .where('attempt_count', '<', 5) // Maximum 5 attempts per user
        .where('attempt_count', '>', 0) // Has at least one attempt (failed before)
        .orderBy('attempt_count', 'desc') // Process users with most attempts first
        .orderBy('last_attempt_at', 'asc') // Then by oldest attempt
        .limit(limit)
        .execute();

      return users;
    } catch (error) {
      logger.error(error, 'Failed to get users for retry');
      throw error;
    }
  }

  /**
   * Get users that have exceeded the maximum retry attempts
   */
  async getUsersExceededMaxRetries(limit: number = 10): Promise<User[]> {
    try {
      const users = await this.db
        .selectFrom('users')
        .selectAll()
        .where('success_at', 'is', null) // No success yet
        .where('up_created_at', 'is not', null) // Has up_created_at (normally allowed to run)
        .where('attempt_count', '>=', 5) // Exceeded maximum attempts
        .orderBy('attempt_count', 'desc') // Process users with most attempts first
        .orderBy('last_attempt_at', 'asc') // Then by oldest attempt
        .limit(limit)
        .execute();

      return users;
    } catch (error) {
      logger.error(error, 'Failed to get users exceeded max retries');
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
      // First check if the proxy port is unique (excluding the current user)
      const isUnique = await this.isProxyPortUnique(proxyPort, id);
      if (!isUnique) {
        throw new Error(`Proxy port ${proxyPort} is already in use by another user`);
      }

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

  /**
   * Check if a proxy port is unique (not used by any other user)
   */
  async isProxyPortUnique(proxyPort: number, excludeUserId?: number): Promise<boolean> {
    try {
      let query = this.db
        .selectFrom('users')
        .select('id')
        .where('last_proxy_port', '=', proxyPort);

      // Exclude the current user if specified
      if (excludeUserId) {
        query = query.where('id', '!=', excludeUserId);
      }

      const existingUser = await query.executeTakeFirst();
      
      // Port is unique if no user is found using it
      const isUnique = !existingUser;
      
      if (!isUnique) {
        logger.warn({ proxyPort, existingUserId: existingUser?.id, excludeUserId }, 'Proxy port is not unique');
      }
      
      return isUnique;
    } catch (error) {
      logger.error(error, 'Failed to check proxy port uniqueness');
      throw error;
    }
  }

  /**
   * Get all users with their proxy ports for debugging
   */
  async getUsersWithProxyPorts(): Promise<{ id: number; email: string; last_proxy_port: number | null }[]> {
    try {
      const users = await this.db
        .selectFrom('users')
        .select(['id', 'email', 'last_proxy_port'])
        .orderBy('last_proxy_port', 'asc')
        .execute();

      return users;
    } catch (error) {
      logger.error(error, 'Failed to get users with proxy ports');
      throw error;
    }
  }

  /**
   * Get all used proxy ports for debugging and management
   */
  async getUsedProxyPorts(): Promise<number[]> {
    try {
      const users = await this.db
        .selectFrom('users')
        .select('last_proxy_port')
        .where('last_proxy_port', 'is not', null)
        .execute();

      return users.map(user => user.last_proxy_port!).sort((a, b) => a - b);
    } catch (error) {
      logger.error(error, 'Failed to get used proxy ports');
      throw error;
    }
  }

  /**
   * Get proxy port statistics
   */
  async getProxyPortStats(): Promise<{
    totalUsers: number;
    usersWithProxyPorts: number;
    usedPorts: number[];
    availablePorts: number;
    portRange: { min: number; max: number };
  }> {
    try {
      const totalUsers = await this.db
        .selectFrom('users')
        .select((eb) => eb.fn.countAll().as('count'))
        .executeTakeFirst();

      const usersWithProxyPorts = await this.db
        .selectFrom('users')
        .select((eb) => eb.fn.countAll().as('count'))
        .where('last_proxy_port', 'is not', null)
        .executeTakeFirst();

      const usedPorts = await this.getUsedProxyPorts();
      
      const portRange = { min: 10001, max: 10100 };
      const availablePorts = (portRange.max - portRange.min + 1) - usedPorts.length;

      return {
        totalUsers: Number(totalUsers?.count || 0),
        usersWithProxyPorts: Number(usersWithProxyPorts?.count || 0),
        usedPorts,
        availablePorts,
        portRange
      };
    } catch (error) {
      logger.error(error, 'Failed to get proxy port stats');
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
    retryable: number;
    exceeded_max_retries: number;
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

      const [retryable] = await this.db
        .selectFrom('users')
        .select((eb) => eb.fn.countAll().as('count'))
        .where('success_at', 'is', null)
        .where('up_created_at', 'is not', null)
        .where('attempt_count', '>', 0)
        .where('attempt_count', '<', 5)
        .execute();

      const [exceededMaxRetries] = await this.db
        .selectFrom('users')
        .select((eb) => eb.fn.countAll().as('count'))
        .where('success_at', 'is', null)
        .where('up_created_at', 'is not', null)
        .where('attempt_count', '>=', 5)
        .execute();

      return {
        total: Number(total.count),
        successful: Number(successful.count),
        pending: Number(pending.count),
        failed: Number(failed.count),
        retryable: Number(retryable.count),
        exceeded_max_retries: Number(exceededMaxRetries.count),
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
