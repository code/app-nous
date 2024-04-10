import crypto from 'crypto';
import { existsSync, writeFileSync } from 'fs';
import * as path from 'path';
import * as fs from 'fs/promises';
import { FunctionCacheService } from './cache';

/**
 * Temporary file based cache. Need to get a database cache working, ideally with implementation in Postgres and Datastore initially
 */
export class FileCacheService implements FunctionCacheService {
	private baseFolderPath: string;

	constructor(baseFolderPath: string) {
		this.baseFolderPath = baseFolderPath;
	}

	toStringArg(arg: any): string {
		if (arg === undefined) return 'undefined';
		if (arg === null) return 'null';
		if (typeof arg === 'string') {
			if (arg.length <= 20) return arg;
			return `${arg.slice(0, 2)}_${hashMd5(arg)}`;
		}
		if (typeof arg === 'number' || typeof arg === 'boolean') return arg.toString();
		if (Array.isArray(arg)) {
			return `[${arg.map((item) => this.toStringArg(item)).join('__')}]`;
		}
		if (typeof arg === 'object') {
			return `{${(Object.values(arg) as any[]).map(([key, value]) => `${key}_${this.toStringArg(value)}`).join('__')}}`;
		}
		return;
	}

	getFunctionCacheDir(holder: string, method: string): string {
		return `${this.baseFolderPath}/${holder}/${method}/`;
	}

	getFunctionCacheFilename(params: any[]): string {
		try {
			// return this.toStringArg(params).replace(/[<>:"\/\\|?*]+/g, '');
			return hashMd5(JSON.stringify(params)).replace(/[<>:"\/\\|?*]+/g, '');
		} catch (e) {
			console.error("Couldn't create cache key for");
			console.error(params);
			throw e;
		}
	}

	async get(holder: string, method: string, params: any[]): Promise<any> {
		const filePath = this.getFunctionCacheDir(holder, method) + this.getFunctionCacheFilename(params);
		try {
			if (!existsSync(filePath)) return undefined;

			const data = await fs.readFile(filePath, 'utf8');
			return data.startsWith('{') || data.startsWith('[') ? JSON.parse(data) : data;
		} catch (error) {
			console.error(`Error getting cached value for ${filePath}`);
			console.error(error);
		}
	}

	async set(holder: string, method: string, params: any[], value: string): Promise<void> {
		// console.log(`Saving cached result for ${holder}.${method}`)
		// console.log(value)
		const dir = this.getFunctionCacheDir(holder, method);
		await fs.mkdir(dir, { recursive: true });

		writeFileSync(dir + this.getFunctionCacheFilename(params), JSON.stringify(value), 'utf-8');
	}

	// async get(cacheKey: string): Promise<any | undefined> {
	//   const filePath = await this.getCacheFilePath(cacheKey);
	//   try {
	//     const data = await fs.readFile(filePath, 'utf8');
	//     return JSON.parse(data);
	//   } catch (error) {
	//     return undefined; // Cache miss
	//   }
	// }
	//
	// async set(cacheKey: string, value: any, ttlSeconds: number): Promise<void> {
	//   const filePath = await this.getCacheFilePath(cacheKey);
	//   const data = JSON.stringify(value);
	//   await fs.mkdir(filePath, { recursive: true }); // Create folder if needed
	//   await fs.writeFile(filePath, data, 'utf8');
	//
	//   // Optional: Implement TTL cleanup logic here
	// }

	private async getCacheFilePath(cacheKey: string): Promise<string> {
		const [className, methodName, ...params] = cacheKey.split('_');
		const sanitizedParams = params.join('_').replace(/[^a-zA-Z0-9_\-]/g, '');
		const folderPath = path.join(this.baseFolderPath, `${className}_${methodName}`);
		await fs.mkdir(folderPath, { recursive: true }); // Create folder if needed
		return path.join(folderPath, sanitizedParams);
	}
}

function hashMd5(data: string): string {
	return crypto.createHash('md5').update(data).digest('hex');
}
