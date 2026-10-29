/** Runs tasks with a bounded number of concurrent workers, preserving input order. */
export async function mapWithConcurrency<T, R>(
	items: readonly T[],
	limit: number,
	worker: (item: T, index: number) => Promise<R>
): Promise<R[]> {
	const results = new Array<R>(items.length);
	let cursor = 0;

	const workerCount = Math.max(1, Math.min(limit, items.length));
	const runners = Array.from({ length: workerCount }, async () => {
		for (;;) {
			const index = cursor++;
			if (index >= items.length) return;
			results[index] = await worker(items[index], index);
		}
	});

	await Promise.all(runners);
	return results;
}
