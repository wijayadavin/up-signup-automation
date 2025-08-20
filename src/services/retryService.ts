import { getDatabase } from '../database/connection.js';
import { UserService } from './userService.js';
import { UpworkService } from './upworkService.js';
import { ProxyTestService } from './proxyTestService.js';
import { RequestService } from './requestService.js';
import { BrowserManager } from '../browser/browserManager.js';
import { getLogger } from '../utils/logger.js';

const logger = getLogger(import.meta.url);

export class RetryService {
  private userService: UserService;
  private browserManager: BrowserManager;
  private upworkService: UpworkService;
  private proxyTestService: ProxyTestService;
  private requestService: RequestService;

  constructor() {
    this.userService = new UserService();
    this.browserManager = new BrowserManager({ headless: true });
    this.upworkService = new UpworkService(this.browserManager, this.userService);
    this.proxyTestService = new ProxyTestService(this.browserManager);
    this.requestService = new RequestService();
  }

  /**
   * Retry processing for a specific user ID
   */
  async retrySpecificUser(userId: number): Promise<void> {
    try {
      logger.info(`🔄 Starting retry for specific user ID: ${userId}`);

      // Get the specific user
      const user = await this.userService.getUserById(userId);
      if (!user) {
        logger.error(`❌ User with ID ${userId} not found`);
        return;
      }

      logger.info(`📋 Retrying user: ${user.email} (ID: ${user.id}, Country: ${user.country_code})`);

      // Test proxy connection first
      logger.info('🔍 Testing proxy connection before retry...');
      const proxyTestResult = await this.proxyTestService.testProxyWithRetry(3, 15000);
      
      if (!proxyTestResult.success) {
        logger.error(`❌ Proxy test failed: ${proxyTestResult.error}`);
        logger.info(`⏳ User ${userId} will be retried in next run when proxy is working`);
        return;
      }

      logger.info('✅ Proxy test passed, proceeding with retry...');

      // Process the specific user
      const result = await this.upworkService.processSingleUser(user);
      
      if (result.success) {
        logger.info(`✅ Retry successful for user ${userId}: ${user.email}`);
      } else {
        logger.error(`❌ Retry failed for user ${userId}: ${result.error}`);
      }

    } catch (error) {
      logger.error(`❌ Error during retry for user ${userId}:`, error);
    }
  }

  /**
   * Retry processing for multiple specific user IDs
   */
  async retryMultipleUsers(userIds: number[]): Promise<void> {
    try {
      logger.info(`🔄 Starting retry for ${userIds.length} specific users: [${userIds.join(', ')}]`);

      // Test proxy connection first
      logger.info('🔍 Testing proxy connection before retry...');
      const proxyTestResult = await this.proxyTestService.testProxyWithRetry(3, 15000);
      
      if (!proxyTestResult.success) {
        logger.error(`❌ Proxy test failed: ${proxyTestResult.error}`);
        logger.info(`⏳ Users will be retried in next run when proxy is working`);
        return;
      }

      logger.info('✅ Proxy test passed, proceeding with retries...');

      let successCount = 0;
      let failureCount = 0;

      for (const userId of userIds) {
        try {
          const user = await this.userService.getUserById(userId);
          if (!user) {
            logger.error(`❌ User with ID ${userId} not found`);
            failureCount++;
            continue;
          }

          logger.info(`📋 Processing user: ${user.email} (ID: ${user.id}, Country: ${user.country_code})`);
          
          const result = await this.upworkService.processSingleUser(user);
          
          if (result.success) {
            logger.info(`✅ Retry successful for user ${userId}: ${user.email}`);
            successCount++;
          } else {
            logger.error(`❌ Retry failed for user ${userId}: ${result.error}`);
            failureCount++;
          }

        } catch (error) {
          logger.error(`❌ Error during retry for user ${userId}:`, error);
          failureCount++;
        }
      }

      logger.info(`📊 Retry summary: ${successCount} successful, ${failureCount} failed`);

    } catch (error) {
      logger.error('❌ Error during multiple user retry:', error);
    }
  }

  /**
   * Retry processing for all failed users with robust retry logic
   */
  async retryAllFailedUsers(): Promise<void> {
    let processRun: any = null;
    
    try {
      logger.info('🔄 Starting robust retry for all failed users...');

      // Create a request to track this retry session
      processRun = await this.requestService.createRequest({
        user_id: 0, // Special case for retry session tracking
        status: 'RUNNING',
        options: { retry_mode: true }
      });

      // Get all users that need retry (failed users with less than 5 attempts)
      const retryableUsers = await this.userService.getUsersForRetry();
      
      if (retryableUsers.length === 0) {
        logger.info('✅ No users need retry (all users either succeeded or exceeded max attempts)');
        await this.requestService.updateRequest(processRun.id, {
          status: 'SUCCESS',
          completed_at: new Date()
        });
        return;
      }

      logger.info(`📋 Found ${retryableUsers.length} users that need retry (attempts < 5)`);

      // Test proxy connection first
      logger.info('🔍 Testing proxy connection before retry...');
      const proxyTestResult = await this.proxyTestService.testProxyWithRetry(3, 15000);
      
      if (!proxyTestResult.success) {
        logger.error(`❌ Proxy test failed: ${proxyTestResult.error}`);
        await this.requestService.updateRequest(processRun.id, {
          status: 'FAILED',
          completed_at: new Date(),
          error_message: `Proxy test failed: ${proxyTestResult.error}`
        });
        logger.info(`⏳ Failed users will be retried in next run when proxy is working`);
        return;
      }

      logger.info('✅ Proxy test passed, proceeding with retries...');

      let successCount = 0;
      let failureCount = 0;
      let roundNumber = 1;
      const maxRounds = 10; // Maximum retry rounds to prevent infinite loops

      while (retryableUsers.length > 0 && roundNumber <= maxRounds) {
        logger.info(`🔄 Starting retry round ${roundNumber}/${maxRounds} with ${retryableUsers.length} users`);

        const roundUsers = [...retryableUsers]; // Copy the array for this round
        retryableUsers.length = 0; // Clear for next round

        for (const user of roundUsers) {
          try {
            logger.info(`📋 Processing user: ${user.email} (ID: ${user.id}, Country: ${user.country_code}, Attempts: ${user.attempt_count}/5)`);
            
            const result = await this.upworkService.processSingleUser(user);
            
            if (result.success) {
              logger.info(`✅ Retry successful for user ${user.id}: ${user.email}`);
              successCount++;
            } else {
              logger.error(`❌ Retry failed for user ${user.id}: ${result.error}`);
              failureCount++;

              // Check if user should be retried again (attempts < 5)
              const updatedUser = await this.userService.getUserById(user.id);
              if (updatedUser && updatedUser.attempt_count < 5 && !updatedUser.success_at) {
                retryableUsers.push(updatedUser);
                logger.info(`🔄 User ${user.id} will be retried again (attempts: ${updatedUser.attempt_count}/5)`);
              } else {
                logger.info(`⏹️ User ${user.id} has exceeded max attempts or succeeded, won't retry again`);
              }
            }

            // Add delay between users to avoid rate limiting
            await this.delay(3000);

          } catch (error) {
            logger.error(`❌ Error during retry for user ${user.id}:`, error);
            failureCount++;

            // Check if user should be retried again
            const updatedUser = await this.userService.getUserById(user.id);
            if (updatedUser && updatedUser.attempt_count < 5 && !updatedUser.success_at) {
              retryableUsers.push(updatedUser);
            }
          }
        }

        // Update request with current progress
        await this.requestService.updateRequest(processRun.id, {
          status: 'RUNNING'
        });

        if (retryableUsers.length > 0) {
          logger.info(`📊 Round ${roundNumber} complete - ${successCount} successful, ${failureCount} failed, ${retryableUsers.length} users need another retry`);
          
          // Add delay between rounds
          await this.delay(5000);
        } else {
          logger.info(`📊 Round ${roundNumber} complete - All users processed successfully!`);
        }

        roundNumber++;
      }

      if (roundNumber > maxRounds) {
        logger.warn(`⚠️ Reached maximum retry rounds (${maxRounds}), stopping retry process`);
        await this.requestService.updateRequest(processRun.id, {
          status: 'FAILED',
          completed_at: new Date(),
          error_message: `Reached maximum retry rounds (${maxRounds})`
        });
      } else {
        logger.info(`🎉 Retry process completed successfully!`);
        await this.requestService.updateRequest(processRun.id, {
          status: 'SUCCESS',
          completed_at: new Date()
        });
      }

      logger.info(`📊 Final retry summary: ${successCount} successful, ${failureCount} failed`);

    } catch (error) {
      logger.error('❌ Error during robust retry process:', error);
      
      if (processRun) {
        await this.requestService.updateRequest(processRun.id, {
          status: 'FAILED',
          completed_at: new Date(),
          error_message: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
  }

  /**
   * Get retry statistics with enhanced information
   */
  async getRetryStats(): Promise<{
    totalUsers: number;
    successfulUsers: number;
    failedUsers: number;
    pendingUsers: number;
    retryableUsers: number;
    exceededMaxRetries: number;
    requestStats: {
      total_requests: number;
      running_requests: number;
      waiting_for_retry_requests: number;
      failed_requests: number;
      successful_requests: number;
      average_attempts: number;
    };
  }> {
    try {
      const userStats = await this.userService.getStats();
      const requestStats = await this.requestService.getRequestStats();

      return {
        totalUsers: userStats.total,
        successfulUsers: userStats.successful,
        failedUsers: userStats.failed,
        pendingUsers: userStats.pending,
        retryableUsers: userStats.retryable,
        exceededMaxRetries: userStats.exceeded_max_retries,
        requestStats
      };

    } catch (error) {
      logger.error('Error getting retry stats:', error);
      return {
        totalUsers: 0,
        successfulUsers: 0,
        failedUsers: 0,
        pendingUsers: 0,
        retryableUsers: 0,
        exceededMaxRetries: 0,
        requestStats: {
          total_requests: 0,
          running_requests: 0,
          waiting_for_retry_requests: 0,
          failed_requests: 0,
          successful_requests: 0,
          average_attempts: 0
        }
      };
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
