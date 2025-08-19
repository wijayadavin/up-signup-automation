import { getLogger } from '../utils/logger.js';

const logger = getLogger(import.meta.url);

interface SmsManOrder {
  orderid?: string;
  order_code?: string;
  phonenumber: string;
  code?: string;
  status: string;
  timestamp: string;
  completed_on?: string;
  expiry?: string;
  time_left?: string;
  active?: number;
  full_code?: string;
  short_name?: string;
  service?: string;
  pool_name?: string;
  pool?: number;
  cc?: string;
  number?: string;
}

interface SmsManResponse {
  success: number;
  message?: string;
  data?: any;
}

export class SmsManService {
  private baseUrl = 'https://api.sms-man.com';
  private apiKey: string;

  constructor() {
    this.apiKey = process.env.SMSMAN_API_KEY || '';
    
    logger.info(`SMS-Man API Key: ${this.apiKey ? 'SET' : 'NOT SET'}`);
    
    if (!this.apiKey) {
      throw new Error('SMSMAN_API_KEY environment variable is required');
    }
  }

  /**
   * Get account balance
   */
  async getBalance(): Promise<number> {
    try {
      const formData = new FormData();
      formData.append('key', this.apiKey);

      const response = await fetch(`${this.baseUrl}/request/balance`, {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        throw new Error(`HTTP error, status: ${response.status}`);
      }

      const data = await response.json();
      const balance = parseFloat(data.balance || '0');
      
      logger.info(`SMS-Man balance: ${balance}`);
      return balance;
    } catch (error) {
      logger.error('Error getting SMS-Man balance:', error);
      throw error;
    }
  }

  /**
   * Get country list
   */
  async getCountries(): Promise<any[]> {
    try {
      const response = await fetch(`${this.baseUrl}/country/retrieve_all`, {
        method: 'POST'
      });

      if (!response.ok) {
        throw new Error(`HTTP error, status: ${response.status}`);
      }

      const data = await response.json();
      logger.info(`Found ${data.length || 0} countries`);
      return data || [];
    } catch (error) {
      logger.error('Error getting countries:', error);
      throw error;
    }
  }

  /**
   * Get service list
   */
  async getServices(): Promise<any[]> {
    try {
      const response = await fetch(`${this.baseUrl}/service/retrieve_all`, {
        method: 'POST'
      });

      if (!response.ok) {
        throw new Error(`HTTP error, status: ${response.status}`);
      }

      const data = await response.json();
      logger.info(`Found ${data.length || 0} services`);
      return data || [];
    } catch (error) {
      logger.error('Error getting services:', error);
      throw error;
    }
  }

  /**
   * Find service ID for Upwork
   */
  async findUpworkService(): Promise<string | null> {
    try {
      // Use the known Upwork service ID for SMS-Man
      const upworkServiceId = 'upwork'; // This may need to be adjusted based on actual SMS-Man service IDs
      logger.info(`Using Upwork service ID: ${upworkServiceId}`);
      return upworkServiceId;
    } catch (error) {
      logger.error('Error finding Upwork service:', error);
      return null;
    }
  }

  /**
   * Find country ID by country code
   */
  async findCountryId(countryCode: string): Promise<string | null> {
    try {
      // Use known country IDs for SMS-Man
      const countryIdMap: { [key: string]: string } = {
        'US': '1',
        'CA': '2',
        'AU': '3',
        'DE': '4',
        'FR': '5',
        'IT': '6',
        'ES': '7',
        'NL': '8',
        'BE': '9',
        'AT': '10',
        'CH': '11'
      };
      
      const countryId = countryIdMap[countryCode.toUpperCase()];
      if (countryId) {
        logger.info(`Found country ${countryCode} with ID: ${countryId}`);
        return countryId;
      }

      logger.warn(`Country ${countryCode} not found in known mappings`);
      return null;
    } catch (error) {
      logger.error('Error finding country ID:', error);
      return null;
    }
  }

  /**
   * Order SMS for phone verification
   */
  async orderSms(countryCode: string, serviceId?: string): Promise<{ orderId: string; phoneNumber?: string }> {
    try {
      const countryId = await this.findCountryId(countryCode);
      if (!countryId) {
        throw new Error(`Country ${countryCode} not found`);
      }

      const finalServiceId = serviceId || await this.findUpworkService();
      if (!finalServiceId) {
        throw new Error('No suitable service found');
      }

      const formData = new FormData();
      formData.append('key', this.apiKey);
      formData.append('country', countryId);
      formData.append('service', finalServiceId);
      formData.append('quantity', '1');

      logger.info(`Ordering SMS for country ${countryCode} (ID: ${countryId}), service ${finalServiceId}`);

      const response = await fetch(`${this.baseUrl}/purchase/sms`, {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP error, status: ${response.status}, response: ${errorText}`);
      }

      const data = await response.json();
      
      // Log the raw response for debugging
      logger.info(`SMS-Man order response: ${JSON.stringify(data)}`);
      
      if (data.success !== 1) {
        throw new Error(`SMS order failed: ${data.message || 'Unknown error'}`);
      }

      const orderId = data.orderid || data.order_id;
      if (!orderId) {
        throw new Error('No order ID returned from SMS order');
      }

      const phoneNumber = data.phonenumber || data.phone_number;
      
      logger.info(`SMS ordered successfully, order ID: ${orderId}, phone: ${phoneNumber || 'not provided'}`);
      return { orderId, phoneNumber };
    } catch (error) {
      logger.error('Error ordering SMS:', error);
      throw error;
    }
  }

  /**
   * Check SMS status and get OTP
   */
  async checkSms(orderId: string): Promise<SmsManOrder | null> {
    try {
      const formData = new FormData();
      formData.append('key', this.apiKey);
      formData.append('orderid', orderId);

      const response = await fetch(`${this.baseUrl}/sms/check`, {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        throw new Error(`HTTP error, status: ${response.status}`);
      }

      const data = await response.json();
      
      // Log the raw response for debugging
      logger.info(`SMS-Man API response: ${JSON.stringify(data)}`);
      
      // Check if the response indicates success (status: 1 or 3 means success)
      // status: 1 = pending, status: 3 = SMS received with OTP
      if (data.status !== 1 && data.status !== 3) {
        logger.warn(`SMS check failed - status: ${data.status}, response: ${JSON.stringify(data)}`);
        return null;
      }

      // Parse OTP code from SMS message
      let otpCode = '';
      const smsMessage = data.sms || data.message || '';
      
      if (smsMessage) {
        // Extract numbers from SMS message like "Your Upwork verification code is 41592."
        const otpMatch = smsMessage.match(/\b\d{4,6}\b/);
        if (otpMatch) {
          otpCode = otpMatch[0];
          logger.info(`Extracted OTP code: ${otpCode} from message: "${smsMessage}"`);
        } else {
          logger.warn(`No OTP code found in SMS message: "${smsMessage}"`);
        }
      }

      const order: SmsManOrder = {
        orderid: data.orderid || orderId,
        phonenumber: data.phonenumber || '',
        code: otpCode || data.code || '',
        status: (data.status === 1 || data.status === 3) ? 'completed' : 'pending',
        timestamp: data.timestamp || new Date().toISOString(),
        completed_on: data.completed_on,
        expiry: data.expiration ? new Date(data.expiration * 1000).toISOString() : undefined,
        time_left: data.time_left ? data.time_left.toString() : undefined
      };

      logger.info(`SMS check result - Status: ${order.status}, Code: ${order.code || 'Not received yet'}`);
      return order;
    } catch (error) {
      logger.error('Error checking SMS:', error);
      throw error;
    }
  }

  /**
   * Wait for OTP with timeout
   */
  async waitForOTP(userId: number, countryCode: string, timeoutSeconds: number = 360): Promise<string | null> {
    const interval = 5000; // 5 seconds
    const timeoutMs = timeoutSeconds * 1000;
    const startTime = Date.now();

    logger.info(`Starting SMS-Man OTP wait for user ${userId} in country ${countryCode} (timeout: ${timeoutSeconds}s)`);

    try {
      // Check if user already has phone number and provider set
      const existingData = await this.getUserPhoneAndProvider(userId);
      if (existingData && existingData.phone && existingData.otp_provider === 'SMS_MAN') {
        logger.info(`User ${userId} already has phone ${existingData.phone} and provider ${existingData.otp_provider}, checking for existing OTP...`);
        
        // Try to get OTP from existing active orders
        const existingOtp = await this.checkExistingOrdersForOtp(existingData.phone, userId, countryCode);
        if (existingOtp) {
          logger.info(`✅ Found existing OTP from previous order: ${existingOtp}`);
          return existingOtp;
        }
        
        logger.warn(`No existing OTP found for phone ${existingData.phone}, but user already has this phone number. Will wait for existing order instead of creating new one.`);
        
        // Instead of creating a new order, we should wait for the existing order to receive an OTP
        // This prevents overwriting the phone number
        logger.info('Waiting for existing order to receive OTP...');
        
        // Get all active orders and check if any match our phone number
        const activeOrders = await this.getActiveOrders();
        const formattedPhone = this.formatPhoneWithCountryCode(existingData.phone!, countryCode);
        logger.info(`Looking for orders matching phone: ${existingData.phone} (formatted: ${formattedPhone})`);
        
        const matchingOrders = activeOrders.filter(order => {
          const orderPhone = order.phonenumber || '';
          const cleanOrderPhone = orderPhone.replace(/\D/g, '');
          const cleanFormattedPhone = formattedPhone.replace(/\D/g, '');
          const cleanOriginalPhone = existingData.phone!.replace(/\D/g, '');
          
          // Try multiple matching strategies
          return orderPhone === formattedPhone || 
                 orderPhone === existingData.phone ||
                 cleanOrderPhone === cleanFormattedPhone ||
                 cleanOrderPhone === cleanOriginalPhone ||
                 orderPhone.includes(cleanOriginalPhone) ||
                 cleanOrderPhone.includes(cleanOriginalPhone);
        });
        
        if (matchingOrders.length > 0) {
          logger.info(`Found ${matchingOrders.length} active order(s) for phone ${existingData.phone}, waiting for OTP...`);
          
          // Wait for any of these orders to receive an OTP
          while (true) {
            for (const order of matchingOrders) {
              const orderId = order.order_code || order.orderid || '';
              const orderDetails = await this.checkSms(orderId);
              if (orderDetails && orderDetails.code) {
                logger.info(`✅ Received OTP ${orderDetails.code} from existing order ${orderId}`);
                
                // Save OTP to user record
                await this.saveUserOTP(userId, orderDetails.code);
                
                return orderDetails.code;
              }
            }
            
            // Check timeout
            if (Date.now() - startTime >= timeoutMs) {
              logger.warn(`SMS-Man OTP wait timed out after ${timeoutSeconds} seconds for existing phone ${existingData.phone}`);
              return null;
            }
            
            // Wait before next poll
            await new Promise(resolve => setTimeout(resolve, interval));
            logger.debug(`Polling existing orders... (${Math.round((Date.now() - startTime) / 1000)}s elapsed)`);
          }
        } else {
          logger.warn(`No active orders found for phone ${existingData.phone}, but user has this phone number. This indicates a data inconsistency.`);
          // Fall through to create new order only if no active orders exist
        }
      }

      // Only create new order if user doesn't have a phone number or no active orders exist
      logger.info('Creating new SMS order...');
      
      // Get account balance first
      const balance = await this.getBalance();
      if (balance <= 0) {
        throw new Error('Insufficient SMS-Man balance');
      }

      // Order SMS
      const orderResult = await this.orderSms(countryCode);
      const orderId = orderResult.orderId;
      logger.info(`SMS ordered with order ID: ${orderId}`);
      
      // If we got the phone number from the order, save it immediately
      if (orderResult.phoneNumber) {
        await this.saveUserPhoneAndProvider(userId, orderResult.phoneNumber, 'SMS_MAN');
      }

      // Poll for SMS
      while (true) {
        const order = await this.checkSms(orderId);
        
        if (order && order.code && order.status === 'completed') {
          logger.info(`✅ OTP received from SMS-Man: ${order.code}`);
          logger.info(`Phone number: ${order.phonenumber}`);
          logger.info(`Completed on: ${order.completed_on}`);
          
          // Save phone number and OTP provider to user record
          await this.saveUserPhoneAndProvider(userId, order.phonenumber, 'SMS_MAN');
          
          // Save OTP code to user record
          await this.saveUserOTP(userId, order.code);
          
          return order.code;
        } else if (order && order.code) {
          // If we have a code but status is not 'completed', still return it
          logger.info(`✅ OTP received from SMS-Man (status: ${order.status}): ${order.code}`);
          logger.info(`Phone number: ${order.phonenumber}`);
          
          // Save phone number and OTP provider to user record
          await this.saveUserPhoneAndProvider(userId, order.phonenumber, 'SMS_MAN');
          
          // Save OTP code to user record
          await this.saveUserOTP(userId, order.code);
          
          return order.code;
        }

        // Check timeout
        if (Date.now() - startTime >= timeoutMs) {
          logger.warn(`SMS-Man OTP wait timed out after ${timeoutSeconds} seconds`);
          return null;
        }

        // Wait before next poll
        await new Promise(resolve => setTimeout(resolve, interval));
        logger.debug(`Polling SMS-Man... (${Math.round((Date.now() - startTime) / 1000)}s elapsed)`);
      }
    } catch (error) {
      logger.error('Error waiting for SMS-Man OTP:', error);
      throw error;
    }
  }

  /**
   * Cancel SMS order
   */
  async cancelSms(orderId: string): Promise<boolean> {
    try {
      const formData = new FormData();
      formData.append('key', this.apiKey);
      formData.append('orderid', orderId);

      const response = await fetch(`${this.baseUrl}/sms/cancel`, {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        throw new Error(`HTTP error, status: ${response.status}`);
      }

      const data = await response.json();
      const success = data.success === 1;
      
      if (success) {
        logger.info(`SMS order ${orderId} cancelled successfully`);
      } else {
        logger.warn(`Failed to cancel SMS order ${orderId}: ${data.message || 'Unknown error'}`);
      }

      return success;
    } catch (error) {
      logger.error('Error cancelling SMS:', error);
      return false;
    }
  }

  /**
   * Get active orders
   */
  async getActiveOrders(): Promise<SmsManOrder[]> {
    try {
      const formData = new FormData();
      formData.append('key', this.apiKey);

      const response = await fetch(`${this.baseUrl}/request/active`, {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        throw new Error(`HTTP error, status: ${response.status}`);
      }

      const data = await response.json();
      const orders = data || [];
      
      logger.info(`Found ${orders.length} active orders`);
      
      // Log the raw data structure for debugging
      if (orders.length > 0) {
        logger.info(`Raw order data structure:`, JSON.stringify(orders[0], null, 2));
        logger.info(`Available fields:`, Object.keys(orders[0]));
      }
      
      return orders;
    } catch (error) {
      logger.error('Error getting active orders:', error);
      throw error;
    }
  }

  /**
   * Get user phone number and OTP provider from database
   */
  private async getUserPhoneAndProvider(userId: number): Promise<{ phone?: string; otp_provider?: string } | null> {
    try {
      const { getDatabase } = await import('../database/connection.js');
      const db = getDatabase();
      
      const user = await db
        .selectFrom('users')
        .select(['phone', 'otp_provider'])
        .where('id', '=', userId)
        .executeTakeFirst();
      
      if (!user) {
        return null;
      }
      
      return {
        phone: user.phone || undefined,
        otp_provider: user.otp_provider || undefined
      };
    } catch (error) {
      logger.error('Failed to get user phone and provider:', error);
      return null;
    }
  }

  /**
   * Format phone number with country code for comparison
   */
  private formatPhoneWithCountryCode(phoneNumber: string, countryCode: string): string {
    // Remove any non-digit characters first
    let cleanNumber = phoneNumber.replace(/\D/g, '');
    
    // Add country code based on user's country
    const countryCodeMap: { [key: string]: string } = {
      'US': '+1',
      'GB': '+44', 
      'UA': '+380',
      'ID': '+62'
    };
    
    const prefix = countryCodeMap[countryCode.toUpperCase()];
    if (!prefix) {
      logger.warn(`Unknown country code: ${countryCode}, using original phone number`);
      return phoneNumber;
    }
    
    // If the clean number already starts with country code digits, don't add prefix
    const countryCodeDigits = prefix.replace('+', '');
    if (cleanNumber.startsWith(countryCodeDigits)) {
      return `+${cleanNumber}`;
    }
    
    // Format the number with country code
    return `${prefix}${cleanNumber}`;
  }

  /**
   * Check existing active orders for OTP
   */
  private async checkExistingOrdersForOtp(phoneNumber: string, userId?: number, countryCode?: string): Promise<string | null> {
    try {
      const orders = await this.getActiveOrders();
      
      // Format phone number with country code for comparison
      let formattedPhone = phoneNumber;
      if (countryCode) {
        formattedPhone = this.formatPhoneWithCountryCode(phoneNumber, countryCode);
        logger.info(`Formatted phone number for comparison: ${phoneNumber} -> ${formattedPhone} (country: ${countryCode})`);
      }
      
      // Find orders for this phone number (try both with and without country code)
      const matchingOrders = orders.filter(order => {
        const orderPhone = order.phonenumber || '';
        const cleanOrderPhone = orderPhone.replace(/\D/g, '');
        const cleanFormattedPhone = formattedPhone.replace(/\D/g, '');
        const cleanOriginalPhone = phoneNumber.replace(/\D/g, '');
        
        // Try multiple matching strategies
        return orderPhone === formattedPhone || 
               orderPhone === phoneNumber ||
               cleanOrderPhone === cleanFormattedPhone ||
               cleanOrderPhone === cleanOriginalPhone ||
               orderPhone.includes(cleanOriginalPhone) ||
               cleanOrderPhone.includes(cleanOriginalPhone);
      });
      
      if (matchingOrders.length === 0) {
        logger.info(`No active orders found for phone ${phoneNumber} (formatted: ${formattedPhone})`);
        logger.info(`Available order phones: ${orders.map(o => o.phonenumber).join(', ')}`);
        return null;
      }
      
      logger.info(`Found ${matchingOrders.length} active order(s) for phone ${phoneNumber} (formatted: ${formattedPhone})`);
      
      // Check each order for OTP
      for (const order of matchingOrders) {
        const orderId = order.order_code || order.orderid || '';
        logger.info(`Checking order ${orderId} for OTP...`);
        const orderDetails = await this.checkSms(orderId);
        
        if (orderDetails && orderDetails.code) {
          logger.info(`✅ Found OTP ${orderDetails.code} in order ${orderId}`);
          
          // Save OTP to user record if userId is provided
          if (userId) {
            await this.saveUserOTP(userId, orderDetails.code);
          }
          
          return orderDetails.code;
        }
      }
      
      logger.info('No OTP found in any active orders');
      return null;
    } catch (error) {
      logger.error('Error checking existing orders for OTP:', error);
      return null;
    }
  }

  /**
   * Save phone number and OTP provider to user record
   */
  private async saveUserPhoneAndProvider(userId: number, phoneNumber: string, provider: string): Promise<void> {
    try {
      const { getDatabase } = await import('../database/connection.js');
      const db = getDatabase();
      
      await db
        .updateTable('users')
        .set({ 
          phone: phoneNumber,
          otp_provider: provider 
        })
        .where('id', '=', userId)
        .execute();
      
      logger.info(`Updated user ${userId} with phone: ${phoneNumber}, provider: ${provider}`);
    } catch (error) {
      logger.error('Failed to save user phone and provider:', error);
    }
  }

  /**
   * Save OTP code to user record
   */
  private async saveUserOTP(userId: number, otpCode: string): Promise<void> {
    try {
      const { getDatabase } = await import('../database/connection.js');
      const db = getDatabase();
      
      await db
        .updateTable('users')
        .set({ 
          otp: parseInt(otpCode, 10)
        })
        .where('id', '=', userId)
        .execute();
      
      logger.info(`Saved OTP ${otpCode} to user ${userId}`);
    } catch (error) {
      logger.error('Failed to save OTP to user:', error);
    }
  }
}
