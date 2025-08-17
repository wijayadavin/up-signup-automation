import { parseCsvFile } from '../utils/csv.js';
import { UserService } from '../services/userService.js';
import { getLogger } from '../utils/logger.js';

const logger = getLogger(import.meta.url);

export interface ImportCsvOptions {
	file: string;
	force?: boolean;
}

export async function importUsersFromCsv(opts: ImportCsvOptions): Promise<{ imported: number; skipped: number; }>{
	const records = await parseCsvFile(opts.file);
	const userService = new UserService();

	let imported = 0;
	let skipped = 0;

	for (const record of records) {
		// Enforce database-aligned headers
		const firstName = (record['first_name'] || '').toString().trim();
		const lastName = (record['last_name'] || '').toString().trim();
		const email = (record['email'] || '').toString().trim();
		const password = (record['password'] || '').toString();
		const countryCode = (record['country_code'] || 'US').toString().trim().toUpperCase();

		// Optional DB fields
		const attemptCountRaw = record['attempt_count'];
		const attemptCount = attemptCountRaw !== undefined && attemptCountRaw !== ''
			? Number(attemptCountRaw)
			: 0;
		const lastAttemptAtStr = record['last_attempt_at'];
		const successAtStr = record['success_at'];
		const lastErrorCode = record['last_error_code'] ?? null;
		const lastErrorMessage = record['last_error_message'] ?? null;
		
		// Location fields
		const locationStreetAddress = record['location_street_address'] ?? null;
		const locationCity = record['location_city'] ?? null;
		const locationState = record['location_state'] ?? null;
		const locationPostCode = record['location_post_code'] ?? null;
		
		// Birth date field
		const birthDateStr = record['birth_date'] ?? null;
		
		// Up created at field
		const upCreatedAtStr = record['up_created_at'] ?? null;

		if (!firstName || !lastName || !email || !password) {
			logger.warn({ email }, 'Skipping row: missing required fields');
			skipped++;
			continue;
		}

		const existing = await userService.getUserByEmail(email);
		if (existing) {
			if (opts.force) {
				logger.info({ email }, 'Force updating existing user');
				// Update existing user with new data
				await userService.updateUserLocation(existing.id, {
					location_street_address: locationStreetAddress,
					location_city: locationCity,
					location_state: locationState,
					location_post_code: locationPostCode,
				});
				
				// Update country code if provided
				if (countryCode) {
					await userService.updateUserCountryCode(existing.id, countryCode);
				}
				
				// Update birth date if provided
				if (birthDateStr) {
					const birthDate = new Date(birthDateStr);
					if (!isNaN(birthDate.getTime())) {
						await userService.updateUserBirthDate(existing.id, birthDate);
					}
				}
				
				// Update up_created_at if provided
				if (upCreatedAtStr) {
					const upCreatedAt = new Date(upCreatedAtStr);
					if (!isNaN(upCreatedAt.getTime())) {
						await userService.updateUserUpCreatedAt(existing.id, {
							up_created_at: upCreatedAt,
						});
					}
				}
				
				imported++;
				continue;
			} else {
				logger.info({ email }, 'Skipping existing user');
				skipped++;
				continue;
			}
		}

		// Create base user
		const created = await userService.createUser({
			first_name: firstName,
			last_name: lastName,
			email,
			password,
			country_code: countryCode,
		});

		// If optional fields provided, update attempt/success metadata
		const needsMetaUpdate = (attemptCount && attemptCount > 0) || lastAttemptAtStr || successAtStr || lastErrorCode || lastErrorMessage;
		if (needsMetaUpdate) {
			if (lastAttemptAtStr || attemptCount || lastErrorCode || lastErrorMessage) {
				await userService.updateUserAttempt(created.id, {
					last_attempt_at: lastAttemptAtStr ? new Date(lastAttemptAtStr) : new Date(),
					attempt_count: attemptCount,
					last_error_code: lastErrorCode ?? undefined,
					last_error_message: lastErrorMessage ?? undefined,
				});
			}
			if (successAtStr) {
				await userService.updateUserSuccess(created.id, {
					success_at: new Date(successAtStr),
				});
			}
		}

		// Update location fields if provided
		const hasLocationData = locationStreetAddress || locationCity || locationState || locationPostCode;
		if (hasLocationData) {
			await userService.updateUserLocation(created.id, {
				location_street_address: locationStreetAddress,
				location_city: locationCity,
				location_state: locationState,
				location_post_code: locationPostCode,
			});
		}

		// Update birth date if provided
		if (birthDateStr) {
			const birthDate = new Date(birthDateStr);
			if (!isNaN(birthDate.getTime())) {
				await userService.updateUserBirthDate(created.id, birthDate);
			}
		}

		// Update up_created_at if provided
		if (upCreatedAtStr) {
			const upCreatedAt = new Date(upCreatedAtStr);
			if (!isNaN(upCreatedAt.getTime())) {
				await userService.updateUserUpCreatedAt(created.id, {
					up_created_at: upCreatedAt,
				});
			}
		}
		imported++;
	}

	return { imported, skipped };
}
