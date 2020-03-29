type Person =
	| {
			name: string;
			email?: string;
			url?: string;
	  }
	| string;

interface SocketIOConnectionEvents {
	connect: void;
	connect_error: (error: Error) => void;
	connect_timeout: void;
	error: (error: Error) => void;
	disconnect: (reason: string) => void;
	reconnect: (attemptNumber: number) => void;
	reconnect_attempt: (attemptNumber: number) => void;
	reconnecting: (attemptNumber: number) => void;
	reconnect_error: (error: Error) => void;
	reconnect_failed: void;
}

declare namespace NodeCG {
	namespace Manifest {
		export type UnparsedAssetCategory = {
			name: string;
			title: string;
			allowedTypes?: string[];
		};

		export type UnparsedPanel = {
			name: string;
			title: string;
			file: string;
			headerColor?: string;
			fullbleed?: boolean;
			workspace?: string;
			dialog?: boolean;
			width?: number;
		};

		export type UnparsedGraphic = {
			file: string;
			width: number;
			height: number;
			singleInstance?: boolean;
		};

		export type UnparsedMount = {
			directory: string;
			endpoint: string;
		};

		export type UnparsedSoundCue = {
			name: string;
			assignable?: boolean;
			defaultVolume?: number;
			defaultFile?: string;
		};

		export type UnparsedBundleDependencies = { [k: string]: string };

		export type UnparsedManifest = {
			compatibleRange: string;
			transformBareModuleSpecifiers?: boolean;
			dashboardPanels?: UnparsedPanel[];
			graphics?: UnparsedGraphic[];
			assetCategories?: UnparsedAssetCategory[];
			mount?: UnparsedMount[];
			soundCues?: UnparsedSoundCue[];
			bundleDependencies?: UnparsedBundleDependencies;
		};
	}

	export type PackageJSON = {
		name: string;
		version: string;
		license?: string;
		description?: string;
		homepage?: string;
		author?: Person;
		contributors?: Person[];
		nodecg: Manifest.UnparsedManifest;
	};

	export type Manifest = Omit<PackageJSON, 'nodecg'> &
		Manifest.UnparsedManifest & { transformBareModuleSpecifiers: boolean };

	namespace Bundle {
		export type GitData =
			| null
			| {
					branch: string;
					hash: string;
					shortHash: string;
			  }
			| {
					branch: string;
					hash: string;
					shortHash: string;
					date: Date;
					message: string;
			  };

		export type Graphic = {
			url: string;
		} & Required<Manifest.UnparsedGraphic>;

		export type Panel = Manifest.UnparsedPanel & {
			path: string;
			headerColor: string;
			bundleName: string;
			html: string;
		} & (
				| {
						dialog: false;
						workspace: string;
				  }
				| {
						dialog: true;
				  }
			) &
			(
				| {
						fullbleed: false;
						width: number;
				  }
				| {
						fullbleed: true;
				  }
			);

		export type Mount = Manifest.UnparsedMount;

		export type SoundCue = Manifest.UnparsedSoundCue;

		export type AssetCategory = Manifest.UnparsedAssetCategory;

		export type BundleDependencies = Manifest.UnparsedBundleDependencies;

		export type DashboardPanel = { html: string } & Manifest.UnparsedPanel;
	}

	export type Bundle = {
		name: string;
		version: string;
		license?: string;
		description?: string;
		homepage?: string;
		author?: Person;
		contributors?: Person[];
		dir: string;
		git: Bundle.GitData;
		transformBareModuleSpecifiers: boolean;
		hasAssignableSoundCues: boolean;
		hasExtension: boolean;
		config: { [k: string]: any };
		dashboard: {
			dir: string;
			panels: Bundle.Panel[];
		};
		graphics: Bundle.Graphic[];
		assetCategories: Bundle.AssetCategory[];
		mount: Bundle.Mount[];
		soundCues: Bundle.SoundCue[];
		compatibleRange: string;
		bundleDependencies?: Bundle.BundleDependencies;
		dashboardPanels: Bundle.DashboardPanel[];
	};

	export interface SocketEvents extends SocketIOConnectionEvents {
		foo: (bar: number) => void;
	}
}
