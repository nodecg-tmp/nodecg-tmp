declare module 'sha1-file' {
	type ErrorCb = (error: Error) => void;
	type SumCb = (error: null, sum: string) => void
	type Callback = ErrorCb | SumCb;
	export = (filepath: string, callback: Callback): void
}
