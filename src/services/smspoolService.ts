import { getLogger } from '../utils/logger.js';

const logger = getLogger(import.meta.url);

interface SmsPoolOrder {
  orderid: string;
  phonenumber: string;
  code?: string;
  status: string;
  timestamp: string;
  completed_on?: string;
  expiry?: string;
  time_left?: string;
}

interface SmsPoolResponse {
  success: number;
  message?: string;
  data?: any;
}

export class SmsPoolService {
  private baseUrl = 'https://api.smspool.net';
  private apiKey: string;

  constructor() {
    this.apiKey = process.env.SMSPOOL_API_KEY || '';
    
    logger.info(`SMSPool API Key: ${this.apiKey ? 'SET' : 'NOT SET'}`);
    
    if (!this.apiKey) {
      throw new Error('SMSPOOL_API_KEY environment variable is required');
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
      
      logger.info(`SMSPool balance: ${balance}`);
      return balance;
    } catch (error) {
      logger.error('Error getting SMSPool balance:', error);
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
      // Use the known Upwork service ID
      const upworkServiceId = '962';
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
      // Use known country IDs
      const countryIdMap: { [key: string]: string } = {
        'US': '1',
        'GB': '2', 
        'UA': '25',
        'ID': '2' // Indonesia also uses ID 2
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
  async orderSms(countryCode: string, serviceId?: string): Promise<string> {
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
      
      if (data.success !== 1) {
        throw new Error(`SMS order failed: ${data.message || 'Unknown error'}`);
      }

      const orderId = data.orderid || data.order_id;
      if (!orderId) {
        throw new Error('No order ID returned from SMS order');
      }

      logger.info(`SMS ordered successfully, order ID: ${orderId}`);
      return orderId;
    } catch (error) {
      logger.error('Error ordering SMS:', error);
      throw error;
    }
  }

  /**
   * Check SMS status and get OTP
   */
  async checkSms(orderId: string): Promise<SmsPoolOrder | null> {
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
      
      if (data.success !== 1) {
        logger.warn(`SMS check failed: ${data.message || 'Unknown error'}`);
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

      const order: SmsPoolOrder = {
        orderid: data.orderid || orderId,
        phonenumber: data.phonenumber || '',
        code: otpCode || data.code || '',
        status: data.status || '',
        timestamp: data.timestamp || '',
        completed_on: data.completed_on,
        expiry: data.expiry,
        time_left: data.time_left
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
  async waitForOTP(userId: number, countryCode: string, timeoutSeconds: number = 180): Promise<string | null> {
    const interval = 5000; // 5 seconds
    const timeoutMs = timeoutSeconds * 1000;
    const startTime = Date.now();

    logger.info(`Starting SMSPool OTP wait for user ${userId} in country ${countryCode} (timeout: ${timeoutSeconds}s)`);

    try {
      // Get account balance first
      const balance = await this.getBalance();
      if (balance <= 0) {
        throw new Error('Insufficient SMSPool balance');
      }

      // Order SMS
      const orderId = await this.orderSms(countryCode);
      logger.info(`SMS ordered with order ID: ${orderId}`);

      // Poll for SMS
      while (true) {
        const order = await this.checkSms(orderId);
        
        if (order && order.code && order.status === 'completed') {
          logger.info(`✅ OTP received from SMSPool: ${order.code}`);
          logger.info(`Phone number: ${order.phonenumber}`);
          logger.info(`Completed on: ${order.completed_on}`);
          return order.code;
        } else if (order && order.code) {
          // If we have a code but status is not 'completed', still return it
          logger.info(`✅ OTP received from SMSPool (status: ${order.status}): ${order.code}`);
          logger.info(`Phone number: ${order.phonenumber}`);
          return order.code;
        }

        // Check timeout
        if (Date.now() - startTime >= timeoutMs) {
          logger.warn(`SMSPool OTP wait timed out after ${timeoutSeconds} seconds`);
          return null;
        }

        // Wait before next poll
        await new Promise(resolve => setTimeout(resolve, interval));
        logger.debug(`Polling SMSPool... (${Math.round((Date.now() - startTime) / 1000)}s elapsed)`);
      }
    } catch (error) {
      logger.error('Error waiting for SMSPool OTP:', error);
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
  async getActiveOrders(): Promise<SmsPoolOrder[]> {
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
}
