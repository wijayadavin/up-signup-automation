import { getDatabase } from '../database/connection.js';
import { getLogger } from '../utils/logger.js';
import type { Request, CreateRequestInput, UpdateRequestInput } from '../types/database.js';

const logger = getLogger(import.meta.url);

export class RequestService {
  private db = getDatabase();

  /**
   * Create a new request for a user
   */
  async createRequest(input: CreateRequestInput): Promise<Request> {
    try {
      const [request] = await this.db
        .insertInto('requests')
        .values({
          user_id: input.user_id,
          status: input.status || 'RUNNING',
          attempt_count: input.attempt_count || 1,
          error_code: input.error_code || null,
          error_message: input.error_message || null,
          options: input.options || null,
          country_code: input.country_code || null,
        })
        .returningAll()
        .execute();

      logger.info({ requestId: request.id, userId: input.user_id, status: request.status, countryCode: request.country_code }, 'Request created');
      return request;
    } catch (error) {
      logger.error(error, 'Failed to create request');
      throw error;
    }
  }

  /**
   * Update a request
   */
  async updateRequest(id: number, input: UpdateRequestInput): Promise<Request> {
    try {
      const [request] = await this.db
        .updateTable('requests')
        .set({
          ...(input.status && { status: input.status }),
          ...(input.attempt_count !== undefined && { attempt_count: input.attempt_count }),
          ...(input.completed_at && { completed_at: input.completed_at }),
          ...(input.error_code && { error_code: input.error_code }),
          ...(input.error_message && { error_message: input.error_message }),
          ...(input.country_code && { country_code: input.country_code }),
        })
        .where('id', '=', id)
        .returningAll()
        .execute();

      logger.info({ requestId: id, status: input.status, countryCode: input.country_code }, 'Request updated');
      return request;
    } catch (error) {
      logger.error(error, 'Failed to update request');
      throw error;
    }
  }

  /**
   * Get a request by ID
   */
  async getRequestById(id: number): Promise<Request | null> {
    try {
      const request = await this.db
        .selectFrom('requests')
        .selectAll()
        .where('id', '=', id)
        .executeTakeFirst();

      return request || null;
    } catch (error) {
      logger.error(error, 'Failed to get request by ID');
      throw error;
    }
  }

  /**
   * Get the latest request for a user
   */
  async getLatestRequestForUser(userId: number): Promise<Request | null> {
    try {
      const request = await this.db
        .selectFrom('requests')
        .selectAll()
        .where('user_id', '=', userId)
        .orderBy('started_at', 'desc')
        .limit(1)
        .executeTakeFirst();

      return request || null;
    } catch (error) {
      logger.error(error, 'Failed to get latest request for user');
      throw error;
    }
  }

  /**
   * Get all requests for a user
   */
  async getRequestsForUser(userId: number, limit: number = 10): Promise<Request[]> {
    try {
      const requests = await this.db
        .selectFrom('requests')
        .selectAll()
        .where('user_id', '=', userId)
        .orderBy('started_at', 'desc')
        .limit(limit)
        .execute();

      return requests;
    } catch (error) {
      logger.error(error, 'Failed to get requests for user');
      throw error;
    }
  }

  /**
   * Get all requests with a specific status
   */
  async getRequestsByStatus(status: string, limit: number = 10): Promise<Request[]> {
    try {
      const requests = await this.db
        .selectFrom('requests')
        .selectAll()
        .where('status', '=', status)
        .orderBy('started_at', 'desc')
        .limit(limit)
        .execute();

      return requests;
    } catch (error) {
      logger.error(error, 'Failed to get requests by status');
      throw error;
    }
  }

  /**
   * Get all requests with pagination
   */
  async getRequests(limit: number = 10, offset: number = 0): Promise<Request[]> {
    try {
      const requests = await this.db
        .selectFrom('requests')
        .selectAll()
        .orderBy('started_at', 'desc')
        .limit(limit)
        .offset(offset)
        .execute();

      return requests;
    } catch (error) {
      logger.error(error, 'Failed to get requests');
      throw error;
    }
  }

  /**
   * Get hanging requests (RUNNING, WAITING_FOR_RETRY, or QUEUED)
   */
  async getHangingRequests(): Promise<Request[]> {
    try {
      const requests = await this.db
        .selectFrom('requests')
        .selectAll()
        .where('status', 'in', ['RUNNING', 'WAITING_FOR_RETRY', 'QUEUED'])
        .orderBy('started_at', 'asc')
        .execute();

      return requests;
    } catch (error) {
      logger.error(error, 'Failed to get hanging requests');
      throw error;
    }
  }

  /**
   * Get request statistics
   */
  async getRequestStats(): Promise<{
    total_requests: number;
    running_requests: number;
    waiting_for_retry_requests: number;
    failed_requests: number;
    successful_requests: number;
    average_attempts: number;
  }> {
    try {
      const stats = await this.db
        .selectFrom('requests')
        .select((eb) => [
          eb.fn.count<number>('id').as('total_requests'),
          eb.fn.count<number>('id').filterWhere('status', '=', 'RUNNING').as('running_requests'),
          eb.fn.count<number>('id').filterWhere('status', '=', 'WAITING_FOR_RETRY').as('waiting_for_retry_requests'),
          eb.fn.count<number>('id').filterWhere('status', '=', 'FAILED').as('failed_requests'),
          eb.fn.count<number>('id').filterWhere('status', '=', 'SUCCESS').as('successful_requests'),
          eb.fn.avg<number>('attempt_count').as('avg_attempts'),
        ])
        .executeTakeFirst();

      return {
        total_requests: stats?.total_requests || 0,
        running_requests: stats?.running_requests || 0,
        waiting_for_retry_requests: stats?.waiting_for_retry_requests || 0,
        failed_requests: stats?.failed_requests || 0,
        successful_requests: stats?.successful_requests || 0,
        average_attempts: Math.round((stats?.avg_attempts || 0) * 100) / 100,
      };
    } catch (error) {
      logger.error(error, 'Failed to get request stats');
      throw error;
    }
  }

  /**
   * Get users that need retry (have requests with WAITING_FOR_RETRY status and attempt_count < 5)
   */
  async getUsersNeedingRetry(limit: number = 10): Promise<Request[]> {
    try {
      const requests = await this.db
        .selectFrom('requests')
        .selectAll()
        .where('status', '=', 'WAITING_FOR_RETRY')
        .where('attempt_count', '<', 5)
        .orderBy('attempt_count', 'desc') // Most attempts first
        .orderBy('started_at', 'asc') // Then oldest first
        .limit(limit)
        .execute();

      return requests;
    } catch (error) {
      logger.error(error, 'Failed to get users needing retry');
      throw error;
    }
  }

  /**
   * Get users that have exceeded max attempts (attempt_count >= 5)
   */
  async getUsersExceededMaxAttempts(limit: number = 10): Promise<Request[]> {
    try {
      const requests = await this.db
        .selectFrom('requests')
        .selectAll()
        .where('attempt_count', '>=', 5)
        .where('status', 'in', ['WAITING_FOR_RETRY', 'FAILED'])
        .orderBy('attempt_count', 'desc') // Most attempts first
        .orderBy('started_at', 'asc') // Then oldest first
        .limit(limit)
        .execute();

      return requests;
    } catch (error) {
      logger.error(error, 'Failed to get users exceeded max attempts');
      throw error;
    }
  }

  /**
   * Check if a user has exceeded max attempts
   */
  async hasUserExceededMaxAttempts(userId: number): Promise<boolean> {
    try {
      const request = await this.db
        .selectFrom('requests')
        .select('attempt_count')
        .where('user_id', '=', userId)
        .orderBy('attempt_count', 'desc')
        .limit(1)
        .executeTakeFirst();

      return request ? request.attempt_count >= 5 : false;
    } catch (error) {
      logger.error(error, 'Failed to check if user exceeded max attempts');
      return false;
    }
  }

  /**
   * Get the current attempt count for a user
   */
  async getCurrentAttemptCount(userId: number): Promise<number> {
    try {
      const request = await this.db
        .selectFrom('requests')
        .select('attempt_count')
        .where('user_id', '=', userId)
        .orderBy('attempt_count', 'desc')
        .limit(1)
        .executeTakeFirst();

      return request ? request.attempt_count : 0;
    } catch (error) {
      logger.error(error, 'Failed to get current attempt count for user');
      return 0;
    }
  }

  /**
   * Get requests summary with country and status breakdown
   */
  async getRequestsSummary(): Promise<{
    totalRequests: number;
    statusBreakdown: { status: string; count: number }[];
    countryBreakdown: { country_code: string | null; count: number }[];
    recentRequests: Request[];
  }> {
    try {
      // Get total count
      const totalResult = await this.db
        .selectFrom('requests')
        .select((eb) => eb.fn.count<number>('id').as('total'))
        .executeTakeFirst();

      // Get status breakdown
      const statusBreakdown = await this.db
        .selectFrom('requests')
        .select(['status'])
        .select((eb) => eb.fn.count<number>('id').as('count'))
        .groupBy('status')
        .orderBy('count', 'desc')
        .execute();

      // Get country breakdown
      const countryBreakdown = await this.db
        .selectFrom('requests')
        .select(['country_code'])
        .select((eb) => eb.fn.count<number>('id').as('count'))
        .groupBy('country_code')
        .orderBy('count', 'desc')
        .execute();

      // Get recent requests (last 10)
      const recentRequests = await this.db
        .selectFrom('requests')
        .selectAll()
        .orderBy('started_at', 'desc')
        .limit(10)
        .execute();

      return {
        totalRequests: totalResult?.total || 0,
        statusBreakdown: statusBreakdown.map(row => ({
          status: row.status,
          count: Number(row.count)
        })),
        countryBreakdown: countryBreakdown.map(row => ({
          country_code: row.country_code,
          count: Number(row.count)
        })),
        recentRequests
      };
    } catch (error) {
      logger.error(error, 'Failed to get requests summary');
      throw error;
    }
  }
}
