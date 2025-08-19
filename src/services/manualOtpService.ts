import { getDatabase } from '../database/connection.js';
import { getLogger } from '../utils/logger.js';

const logger = getLogger(import.meta.url);

export class ManualOtpService {
  private db = getDatabase();

  /**
   * Wait for manual OTP to be set in the database
   * @param userId - The user ID to check for OTP
   * @param timeoutMinutes - Maximum time to wait in minutes (default: 5)
   * @param checkIntervalSeconds - Interval between checks in seconds (default: 5)
   * @returns The OTP code if found, null if timeout
   */
  async waitForManualOtp(
    userId: number, 
    timeoutMinutes: number = 5, 
    checkIntervalSeconds: number = 5
  ): Promise<string | null> {
    const timeoutMs = timeoutMinutes * 60 * 1000;
    const checkIntervalMs = checkIntervalSeconds * 1000;
    const startTime = Date.now();
    
    logger.info(`Starting manual OTP wait for user ${userId} (timeout: ${timeoutMinutes} minutes, check interval: ${checkIntervalSeconds} seconds)`);
    
    while (Date.now() - startTime < timeoutMs) {
      try {
        // Check for manual OTP in database
        const user = await this.db
          .selectFrom('users')
          .select(['otp'])
          .where('id', '=', userId)
          .executeTakeFirst();
        
        if (user && user.otp !== null) {
          const otpCode = user.otp.toString();
          logger.info(`✅ Manual OTP found for user ${userId}: ${otpCode}`);
          
          // Clear the OTP after retrieving it
          await this.clearManualOtp(userId);
          
          return otpCode;
        }
        
        // Wait before next check
        await new Promise(resolve => setTimeout(resolve, checkIntervalMs));
        
      } catch (error) {
        logger.warn(`Error checking manual OTP for user ${userId}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        await new Promise(resolve => setTimeout(resolve, checkIntervalMs));
      }
    }
    
    logger.warn(`Manual OTP timeout for user ${userId} after ${timeoutMinutes} minutes`);
    return null;
  }

  /**
   * Set manual OTP for a user
   * @param userId - The user ID
   * @param otpCode - The OTP code to set
   */
  async setManualOtp(userId: number, otpCode: number): Promise<void> {
    try {
      await this.db
        .updateTable('users')
        .set({ otp: otpCode })
        .where('id', '=', userId)
        .execute();
      
      logger.info(`Manual OTP set for user ${userId}: ${otpCode}`);
    } catch (error) {
      logger.error(`Failed to set manual OTP for user ${userId}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error;
    }
  }

  /**
   * Clear manual OTP for a user
   * @param userId - The user ID
   */
  async clearManualOtp(userId: number): Promise<void> {
    try {
      await this.db
        .updateTable('users')
        .set({ otp: null })
        .where('id', '=', userId)
        .execute();
      
      logger.info(`Manual OTP cleared for user ${userId}`);
    } catch (error) {
      logger.error(`Failed to clear manual OTP for user ${userId}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error;
    }
  }

  /**
   * Get current manual OTP for a user (without clearing it)
   * @param userId - The user ID
   * @returns The OTP code if set, null otherwise
   */
  async getManualOtp(userId: number): Promise<number | null> {
    try {
      const user = await this.db
        .selectFrom('users')
        .select(['otp'])
        .where('id', '=', userId)
        .executeTakeFirst();
      
      return user?.otp || null;
    } catch (error) {
      logger.error(`Failed to get manual OTP for user ${userId}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return null;
    }
  }
}
