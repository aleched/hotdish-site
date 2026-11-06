export type ConnectionState = 'live' | 'syncing' | 'offline';

/** Syncing wins, so a retry shows progress; otherwise data is live only when the forge was reachable. */
export function connectionState(pending: number, browserOnline: boolean, reachable: boolean): ConnectionState {
	if (pending > 0) return 'syncing';
	return browserOnline && reachable ? 'live' : 'offline';
}
