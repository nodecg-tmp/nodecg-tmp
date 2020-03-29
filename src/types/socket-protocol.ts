// Packages
import {
	ServerDefinition,
	SimpleNamespace,
	RootServer,
	ClientSideSocket,
	ServerSideClientSocket,
	ServerNamespace,
} from 'typed-socket.io';

// Ours
import { Code as UnAuthErrCode } from '../server/login/UnauthorizedError';
import { Operation as ReplicantOperation, Options as ReplicantOptions } from '../shared/replicants.shared';

type ProtocolError = {
	message: string;
	code: UnAuthErrCode;
	type: string;
};

export type GraphicRegRequest = {
	timestamp: number;
	pathName: string;
	bundleName: string;
	bundleVersion: string;
	bundleGit: NodeCG.Bundle.GitData;
};

export interface ProtocolDefinition extends ServerDefinition {
	namespaces: {
		'/': SimpleNamespace<{
			// messages the server may send to the clients
			ServerMessages: {
				error: ProtocolError;
				'graphic:bundleRefresh': string;
				'graphic:refreshAll': string;
				'graphic:refresh': string;
				'graphic:kill': string;
				'replicant:operations': {
					name: string;
					namespace: string;
					revision: number;
					operations: Array<ReplicantOperation<any>>;
				};
			};
			// messages clients can send to the server, with a typed response
			ClientRPCs: {
				regenerateToken: {
					request: void;
					response: void;
					error: string;
				};
				'graphic:registerSocket': {
					request: GraphicRegRequest;
					response: boolean;
					error: string;
				};
				'graphic:queryAvailability': {
					request: string;
					response: boolean;
					error: string;
				};
				'graphic:requestBundleRefresh': {
					request: string;
					response: void;
					error: string;
				};
				'graphic:requestRefreshAll': {
					request: string;
					response: void;
					error: string;
				};
				'graphic:requestRefresh': {
					request: string;
					response: void;
					error: string;
				};
				'graphic:requestKill': {
					request: string;
					response: void;
					error: string;
				};
				'replicant:declare': {
					request: {
						name: string;
						namespace: string;
						opts: ReplicantOptions<any>;
					};
					response:
						| {
								value: any;
								revision: number;
						  }
						| {
								value: any;
								revision: number;
								schema: { [k: string]: any };
								schemaSum: string;
						  };
					error: string;
				};
				'replicant:proposeOperations': {
					request:
						| {
								name: string;
								namespace: string;
								operations: Array<ReplicantOperation<any>>;
								opts: ReplicantOptions<any>;
								revision: number;
						  }
						| {
								name: string;
								namespace: string;
								operations: Array<ReplicantOperation<any>>;
								opts: ReplicantOptions<any>;
								revision: number;
								schema: { [k: string]: any };
								schemaSum: string;
						  };
					response: {
						value: any;
						revision: number;
						schema?: { [k: string]: any };
						schemaSum?: string;
					};
					error: string;
				};
				'replicant:read': {
					request: {
						name: string;
						namespace: string;
					};
					response: any;
					error: string;
				};
			};
			// messages clients can send to the server (without a response)
			ClientMessages: {
				// none yet
			};
		}>;
	};
}

export type TypedServer = RootServer<ProtocolDefinition>;
export type RootNS = ServerNamespace<ProtocolDefinition, '/'>;
export type TypedClient = ClientSideSocket<ProtocolDefinition, '/'>;
export type TypedServerSocket = ServerSideClientSocket<ProtocolDefinition, '/'>;
