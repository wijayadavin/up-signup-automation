import { parse } from 'csv-parse/sync';
import fs from 'fs';

export async function parseCsvFile(filePath: string): Promise<Array<Record<string, string>>> {
	const content = await fs.promises.readFile(filePath, 'utf8');
	const delimiter = detectDelimiter(content);
	const records = parse(content, {
		columns: true,
		delimiter,
		trim: true,
		skip_empty_lines: true,
		relax_column_count: true, // Allow inconsistent column counts
		relax_quotes: true, // Be more lenient with quotes
	});
	return records as Array<Record<string, string>>;
}

function detectDelimiter(content: string): string {
	const firstLine = content.split(/\r?\n/)[0] || '';
	const commaCount = (firstLine.match(/,/g) || []).length;
	const tabCount = (firstLine.match(/\t/g) || []).length;
	return tabCount > commaCount ? '\t' : ',';
}
