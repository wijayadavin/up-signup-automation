import { getLogger } from '../utils/logger.js';

const logger = getLogger(import.meta.url);

interface TokenCache {
  token: string;
  expiresAt: string;
}

interface VerificationData {
  href: string;
  state: string;
  data: {
    phoneNumber?: string;
    verificationCode?: string;
    [key: string]: any;
  };
}

export class TextVerifiedService {
  private baseUrl = 'https://www.textverified.com';
  private apiKey: string;
  private email: string;
  private tokenCache: TokenCache | null = null;

  constructor() {
    this.apiKey = process.env.TEXTVERIFIED_API_KEY || '';
    this.email = process.env.TEXTVERIFIED_EMAIL || '';
    
    logger.info(`TextVerified API Key: ${this.apiKey ? 'SET' : 'NOT SET'}`);
    logger.info(`TextVerified Email: ${this.email ? 'SET' : 'NOT SET'}`);
    
    if (!this.apiKey || !this.email) {
      throw new Error('TEXTVERIFIED_API_KEY and TEXTVERIFIED_EMAIL environment variables are required');
    }
  }

  private isBearerTokenExpired(): boolean {
    if (!this.tokenCache) {
      return true;
    }
    
    const expirationStr = this.tokenCache.expiresAt;
    if (expirationStr) {
      const expiration = new Date(expirationStr);
      const currentTime = new Date();
      return currentTime >= expiration;
    }
    
    return true;
  }

  private getTokenFromCache(): string | null {
    if (!this.tokenCache) {
      return null;
    }
    return this.tokenCache.token;
  }

  async generateBearerToken(): Promise<string> {
    const isExpired = this.isBearerTokenExpired();
    if (!isExpired) {
      const token = this.getTokenFromCache();
      if (token) {
        return token;
      }
    }

    try {
      logger.info('Generating new bearer token from TextVerified API');
      logger.info(`API URL: ${this.baseUrl}/api/pub/v2/auth`);
      logger.info(`API Key: ${this.apiKey.substring(0, 10)}...`);
      logger.info(`Email: ${this.email}`);
      
      const response = await fetch(`${this.baseUrl}/api/pub/v2/auth`, {
        method: 'POST',
        headers: {
          'X-API-KEY': this.apiKey,
          'X-API-USERNAME': this.email
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.error(`HTTP ${response.status} error response: ${errorText}`);
        throw new Error(`HTTP error, status: ${response.status}, response: ${errorText}`);
      }

      const data = await response.json();
      logger.info('Bearer token generated successfully');
      
      this.tokenCache = data; // Set token in cache
      return data.token;
    } catch (error) {
      logger.error('Error generating bearer token:', error);
      throw error;
    }
  }

  async getAccountDetails(): Promise<any> {
    try {
      const bearerToken = await this.generateBearerToken();
      
      const response = await fetch(`${this.baseUrl}/api/pub/v2/account/me`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${bearerToken}`,
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP error, status: ${response.status}`);
      }

      const data = await response.json();
      logger.info(`Current balance: ${data.currentBalance}`);
      return data;
    } catch (error) {
      logger.error('Error getting account details:', error);
      throw error;
    }
  }

  async getNonRenewableRentals(): Promise<any> {
    try {
      const bearerToken = await this.generateBearerToken();
      
      const response = await fetch(`${this.baseUrl}/api/pub/v2/reservations/rental/nonrenewable`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${bearerToken}`,
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.error(`HTTP ${response.status} error response: ${errorText}`);
        throw new Error(`HTTP error, status: ${response.status}, response: ${errorText}`);
      }

      const data = await response.json();
      logger.info(`Found ${data.data?.length || 0} non-renewable rentals`);
      
      if (data.data && data.data.length > 0) {
        data.data.forEach((rental: any, index: number) => {
          logger.info(`Rental ${index + 1}: ID=${rental.id}, Number=${rental.number}, Service=${rental.serviceName}, State=${rental.state}, AlwaysOn=${rental.alwaysOn}`);
        });
      }
      
      return data;
    } catch (error) {
      logger.error('Error getting non-renewable rentals:', error);
      throw error;
    }
  }

  async createWakeRequest(reservationId: string): Promise<string> {
    try {
      const bearerToken = await this.generateBearerToken();
      
      const jsonData = {
        reservationId: reservationId
      };

      logger.info(`Creating wake request for reservation: ${reservationId}`);
      logger.info(`Request payload: ${JSON.stringify(jsonData)}`);
      
      const response = await fetch(`${this.baseUrl}/api/pub/v2/wake-requests`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${bearerToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(jsonData),
      });

      // Log the response status and headers
      logger.info(`Wake request response status: ${response.status}`);
      logger.info(`Wake request response headers: ${JSON.stringify(Object.fromEntries(response.headers.entries()))}`);

      // Check specifically for 201 status code
      if (response.status !== 201) {
        const errorText = await response.text();
        logger.error(`Expected HTTP 201, got ${response.status}. Error response: ${errorText}`);
        throw new Error(`Expected HTTP 201, got ${response.status}. Response: ${errorText}`);
      }

      // Log successful 201 response
      logger.info(`✅ Wake request created successfully with HTTP 201`);

      // Get the location header for the wake request
      const location = response.headers.get('location');
      if (!location) {
        logger.error('No location header returned from wake request');
        throw new Error('No location header returned from wake request');
      }

      logger.info(`Wake request location: ${location}`);
      return location;
    } catch (error) {
      logger.error('Error creating wake request:', error);
      throw error;
    }
  }

  async getWakeRequest(location: string): Promise<any> {
    try {
      const bearerToken = await this.generateBearerToken();
      
      logger.info(`Getting wake request status from: ${location}`);
      
      const response = await fetch(location, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${bearerToken}`,
        }
      });

      logger.info(`Wake request status response: ${response.status}`);

      if (!response.ok) {
        const errorText = await response.text();
        logger.error(`HTTP ${response.status} error response: ${errorText}`);
        throw new Error(`HTTP error, status: ${response.status}, response: ${errorText}`);
      }

      const data = await response.json();
      logger.info(`Wake request response data: ${JSON.stringify(data, null, 2)}`);
      logger.info(`Wake request status: ${data.state || 'unknown'}`);
      return data;
    } catch (error) {
      logger.error('Error getting wake request:', error);
      throw error;
    }
  }

  async getSmsList(reservationType: string = 'verification', phoneNumber?: string): Promise<any> {
    try {
      const bearerToken = await this.generateBearerToken();
      
      const params: any = {
        reservationType: reservationType
      };
      
      // Add phone number filter if provided
      if (phoneNumber) {
        params.to = phoneNumber;
      }
      
      const response = await fetch(`${this.baseUrl}/api/pub/v2/sms?${new URLSearchParams(params)}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${bearerToken}`,
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.error(`HTTP ${response.status} error response: ${errorText}`);
        throw new Error(`HTTP error, status: ${response.status}, response: ${errorText}`);
      }

      const data = await response.json();
      logger.info(`Found ${data.data?.length || 0} SMS messages`);
      
      // Log full SMS data structure for debugging
      if (data.data && data.data.length > 0) {
        const firstSms = data.data[0];
        logger.info(`Latest SMS - To: ${firstSms.to || 'N/A'}, From: ${firstSms.from || 'N/A'}, Message: ${firstSms.message?.substring(0, 50) || 'N/A'}...`);
        logger.info(`Full SMS data:`, JSON.stringify(firstSms, null, 2));
      } else {
        logger.info(`No SMS messages found. Full response:`, JSON.stringify(data, null, 2));
      }
      
      return data;
    } catch (error) {
      logger.error('Error getting SMS list:', error);
      throw error;
    }
  }

  async checkSmsWithStatus(phoneNumber?: string, reservationType?: string): Promise<{
    statusCode: number;
    smsCount: number;
    response: any;
  }> {
    try {
      const bearerToken = await this.generateBearerToken();
      
      const params: any = {};
      
      // Add reservation type filter if provided
      if (reservationType) {
        params.reservationType = reservationType;
      }
      
      // Add phone number filter if provided
      if (phoneNumber) {
        params.to = phoneNumber;
      }
      
      const response = await fetch(`${this.baseUrl}/api/pub/v2/sms?${new URLSearchParams(params)}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${bearerToken}`,
        }
      });

      const statusCode = response.status;
      let responseData: any;

      if (response.ok) {
        responseData = await response.json();
        const smsCount = responseData.data?.length || 0;
        
        logger.info(`HTTP ${statusCode} - Found ${smsCount} SMS messages`);
        
        return {
          statusCode,
          smsCount,
          response: responseData
        };
      } else {
        const errorText = await response.text();
        logger.error(`HTTP ${statusCode} error response: ${errorText}`);
        
        return {
          statusCode,
          smsCount: 0,
          response: { error: errorText }
        };
      }
    } catch (error) {
      logger.error('Error checking SMS with status:', error);
      throw error;
    }
  }

  async createVerification(serviceName: string = 'upwork'): Promise<string> {
    try {
      const bearerToken = await this.generateBearerToken();
      
      const jsonData = {
        serviceName: serviceName,
        capability: 'sms'
      };

      logger.info(`Creating verification for service: ${serviceName}`);
      
      const response = await fetch(`${this.baseUrl}/api/pub/v2/verifications`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${bearerToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(jsonData),
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.error(`HTTP ${response.status} error response: ${errorText}`);
        throw new Error(`HTTP error, status: ${response.status}, response: ${errorText}`);
      }

      const data = await response.json();
      logger.info('Verification created successfully');
      logger.info(`Phone number: ${data.data?.phoneNumber || 'Not available yet'}`);
      
      return data.href;
    } catch (error) {
      logger.error('Error creating verification:', error);
      throw error;
    }
  }

  async getVerificationDetails(href: string): Promise<VerificationData> {
    try {
      const bearerToken = await this.generateBearerToken();
      
      const response = await fetch(href, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${bearerToken}`
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error, status: ${response.status}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      logger.error('Error getting verification details:', error);
      throw error;
    }
  }

  private checkVerificationIsCompleted(data: VerificationData): boolean {
    const verificationState = data.state;
    
    if (verificationState === 'verificationPending') {
      logger.info('Verification pending...');
      return false;
    } else if (verificationState === 'verificationCompleted') {
      logger.info('Verification completed!');
      if (data.data?.verificationCode) {
        logger.info(`OTP Code: ${data.data.verificationCode}`);
      }
      return true;
    }
    
    return false;
  }

  async waitForOTP(userId: number, timeoutSeconds: number = 50): Promise<string | null> {
    const interval = 5000; // 5 seconds
    const timeoutMs = timeoutSeconds * 1000;
    const startTime = Date.now();

    logger.info(`Starting OTP wait for user ${userId} (timeout: ${timeoutSeconds}s)`);
    
    try {
      // Get user details to determine country code
      const userService = new (await import('../services/userService.js')).UserService();
      const user = await userService.getUserById(userId);
      if (!user) {
        throw new Error(`User with ID ${userId} not found`);
      }
      
      // Check if we should use SMSPool for non-US countries
      const supportedSmsPoolCountries = ['GB', 'UA', 'ID'];
      if (supportedSmsPoolCountries.includes(user.country_code.toUpperCase())) {
        logger.info(`User country ${user.country_code} is supported by SMSPool, using SMSPool service`);
        try {
          const { SmsPoolService } = await import('./smspoolService.js');
          const smsPoolService = new SmsPoolService();
          return await smsPoolService.waitForOTP(userId, user.country_code, timeoutSeconds);
        } catch (error) {
          logger.error('SMSPool service failed, falling back to TextVerified:', error);
          // Continue with TextVerified as fallback
        }
      }
      
      // Log user's phone number from database
      if (user.phone) {
        logger.info(`📱 Raw phone number from database: "${user.phone}"`);
        const formattedUserPhone = this.formatPhoneNumberWithCountryCode(user.phone, user.country_code);
        logger.info(`📱 User's phone number: ${formattedUserPhone} (cleaned)`);
      } else {
        logger.info(`📱 User's phone number: Not set in database`);
      }
      
      // Format user phone number for API calls
      const userPhoneNumber = this.formatPhoneNumberWithCountryCode(user.phone || '', user.country_code);
      
      // Try to get non-renewable rentals and wake up if needed (optional)
      try {
        logger.info('Getting non-renewable rentals...');
        const rentalsData = await this.getNonRenewableRentals();
        
        let wakeRequestLocation: string | null = null;
        
        if (rentalsData.data && rentalsData.data.length > 0) {
          // Find rental by phone number
          const matchingRental = rentalsData.data.find((rental: any) => 
            rental.number === userPhoneNumber && !rental.alwaysOn
          );
          
          if (matchingRental) {
            logger.info(`Found matching rental: ID=${matchingRental.id}, Number=${matchingRental.number}, AlwaysOn=${matchingRental.alwaysOn}`);
            
            if (!matchingRental.alwaysOn) {
              logger.info('Creating wake request for rental...');
              wakeRequestLocation = await this.createWakeRequest(matchingRental.id);
              
              // Wait a bit for the wake request to process
              logger.info('Waiting for wake request to process...');
              await new Promise(resolve => setTimeout(resolve, 3000));
            } else {
              logger.info('Rental is always on, no wake request needed');
            }
          } else {
            logger.info(`No matching rental found for phone number: ${userPhoneNumber}`);
          }
        } else {
          logger.info('No non-renewable rentals found');
        }
      } catch (error) {
        logger.warn('Could not get non-renewable rentals (endpoint may not be available), continuing with SMS polling...');
      }
      
      // Poll for SMS messages
      logger.info('Polling for SMS messages...');
      
      while (true) {
        // Get latest SMS messages filtered by phone number only
        const smsData = await this.getSmsList('', userPhoneNumber);
        
        if (smsData.data && smsData.data.length > 0) {
          logger.info(`Found ${smsData.data.length} SMS messages for ${userPhoneNumber}`);
          
          // Look through all SMS messages to find the most recent OTP
          let mostRecentOtp: string | null = null;
          let mostRecentSms: any = null;
          
          for (const sms of smsData.data) {
            // Use smsContent instead of message (API field name)
            const smsContent = sms.smsContent || sms.message;
            
            if (smsContent) {
              // Log phone number information for the first SMS
              if (sms === smsData.data[0] && sms.to) {
                const formattedPhoneNumber = this.formatPhoneNumberWithCountryCode(
                  sms.to, 
                  user.country_code
                );
                logger.info(`📱 SMS Phone number: ${formattedPhoneNumber} (raw: ${sms.to})`);
              }
              
              // Extract OTP code from SMS content
              const otpMatch = smsContent.match(/\b\d{4,6}\b/);
              if (otpMatch) {
                const otp = otpMatch[0];
                logger.info(`Found OTP ${otp} in SMS from ${sms.createdAt}`);
                
                // Keep track of the most recent OTP found
                if (!mostRecentOtp || !mostRecentSms || 
                    new Date(sms.createdAt) > new Date(mostRecentSms.createdAt)) {
                  mostRecentOtp = otp;
                  mostRecentSms = sms;
                }
              }
            }
          }
          
          // If we found an OTP, return the most recent one
          if (mostRecentOtp && mostRecentSms) {
            logger.info(`✅ Returning most recent OTP: ${mostRecentOtp}`);
            const smsContent = mostRecentSms.smsContent || mostRecentSms.message;
            logger.info(`SMS Message: ${smsContent}`);
            logger.info(`SMS Timestamp: ${mostRecentSms.createdAt}`);
            return mostRecentOtp;
          }
        }
        
        // Check timeout
        if (Date.now() - startTime >= timeoutMs) {
          logger.warn(`OTP wait timed out after ${timeoutSeconds} seconds`);
          return null;
        }
        
        // Wait before next poll
        await new Promise(resolve => setTimeout(resolve, interval));
        logger.debug(`Polling... (${Math.round((Date.now() - startTime) / 1000)}s elapsed)`);
      }
    } catch (error) {
      logger.error('Error waiting for OTP:', error);
      throw error;
    }
  }

  private formatPhoneNumberWithCountryCode(phoneNumber: string, countryCode: string): string {
    logger.debug(`Formatting phone number: "${phoneNumber}" with country code: "${countryCode}"`);
    
    // Just clean the number by removing any non-digit characters, no country code prefix
    let cleanNumber = phoneNumber.replace(/\D/g, '');
    logger.debug(`After cleaning non-digits: "${cleanNumber}"`);
    
    // Return the clean number without country code prefix
    const result = cleanNumber;
    logger.debug(`Final formatted number: "${result}"`);
    return result;
  }
}
