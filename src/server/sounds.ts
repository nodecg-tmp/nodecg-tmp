// Native
import path from 'path';

// Packages
import clone from 'clone';
import express from 'express';
import sha1File from 'sha1-file';
import appRootPath from 'app-root-path';

// Ours
import * as bundles from './bundle-manager';
import { Replicator } from './replicant';
import createLogger from './logger';
import ServerReplicant from './replicant/server-replicant';

const log = createLogger('sounds');

type CueFile = {
	sum: string;
	base: string;
	ext: string;
	name: string;
	url: string;
	default: boolean;
} | null;

type SoundCue = {
	name: string;
	volume: number;
	file: CueFile;
	assignable: boolean;
	channels?: number;
	bundleName?: TemplateStringsArray;
	defaultVolume?: number | null;
	defaultFile?: CueFile;
};

export default class SoundsLib {
	app = express();

	private readonly _cueRepsByBundle = new Map<string, ServerReplicant<SoundCue[]>>();

	constructor(replicator: Replicator) {
		// Create the replicant for the "Master Fader"
		replicator.declare('volume:master', '_sounds', { defaultValue: 100 });

		bundles.all().forEach(bundle => {
			// If this bundle has sounds
			if (bundle.soundCues.length > 0) {
				// Create an array replicant that will hold all this bundle's sound cues.
				const defaultCuesRepValue = _makeCuesRepDefaultValue(bundle);

				const cuesRep = replicator.declare<SoundCue[]>('soundCues', bundle.name, {
					schemaPath: path.resolve(appRootPath.path, 'schemas/soundCues.json'),
					defaultValue: [],
				});

				this._cueRepsByBundle.set(bundle.name, cuesRep);

				if (cuesRep.value!.length > 0) {
					// Remove any persisted cues that are no longer in the bundle manifest.
					cuesRep.value = cuesRep.value!.filter(persistedCue => {
						return defaultCuesRepValue.find(defaultCue => {
							return defaultCue.name === persistedCue.name;
						});
					});

					// Add/update any cues in the bundle manifest that aren't in the persisted replicant.
					defaultCuesRepValue.forEach(defaultCue => {
						const existingIndex = cuesRep.value!.findIndex(persistedCue => {
							return persistedCue.name === defaultCue.name;
						});

						// We need to just update a few key properties in the persisted cue.
						// We leave things like volume as-is.
						if (existingIndex >= 0) {
							cuesRep.value![existingIndex].assignable = defaultCue.assignable;
							cuesRep.value![existingIndex].defaultFile = defaultCue.defaultFile;

							// If we're updating the cue to not be assignable, then we have to
							// set the `defaultFile` as the selected `file`.
							if (!defaultCue.assignable && defaultCue.defaultFile) {
								const foo = {
									...clone(defaultCue.defaultFile),
									assignable: Boolean(defaultCue.assignable),
								};
								cuesRep.value![existingIndex].file = foo;
							}
						} else {
							cuesRep.value!.push(defaultCue);
						}
					});
				} else {
					// There's no persisted value, so just assign the default.
					cuesRep.value = defaultCuesRepValue;
				}

				// Create this bundle's "Bundle Fader"
				replicator.declare(`volume:${bundle.name}`, '_sounds', {
					defaultValue: 100,
				});
			}
		});

		this.app.get('/sound/:bundleName/:cueName/default.mp3', _serveDefault);
		this.app.get('/sound/:bundleName/:cueName/default.ogg', _serveDefault);
	}
}

function _serveDefault(req: express.Request, res: express.Response): void {
	const bundle = bundles.find(req.params.bundleName);
	if (!bundle) {
		res.status(404).send(`File not found: ${req.path}`);
		return;
	}

	const cue = bundle.soundCues.find(cue => cue.name === req.params.cueName);
	if (!cue) {
		res.status(404).send(`File not found: ${req.path}`);
		return;
	}

	if (!cue.defaultFile) {
		res.status(404).send(`Cue "${cue.name}" had no default file`);
		return;
	}

	const fullPath = path.join(bundle.dir, cue.defaultFile);
	res.sendFile(fullPath, (err: NodeJS.ErrnoException) => {
		if (err) {
			if (err.code === 'ENOENT') {
				return res.sendStatus(404);
			}

			log.error(`Unexpected error sending file ${fullPath}`, err);
			res.sendStatus(500);
		}

		return undefined;
	});
}

function _makeCuesRepDefaultValue(bundle: NodeCG.Bundle): SoundCue[] {
	const formattedCues: SoundCue[] = [];
	for (const rawCue of bundle.soundCues) {
		let file: CueFile | null = null;
		if (rawCue.defaultFile) {
			const filepath = path.join(bundle.dir, rawCue.defaultFile);
			const parsedPath = path.parse(filepath);
			file = {
				sum: sha1File(filepath),
				base: parsedPath.base,
				ext: parsedPath.ext,
				name: parsedPath.name,
				url: `/sound/${bundle.name}/${rawCue.name}/default${parsedPath.ext}`,
				default: true,
			};
		}

		formattedCues.push({
			...clone(rawCue),
			assignable: Boolean(rawCue.assignable),
			volume: rawCue.defaultVolume === undefined ? 30 : rawCue.defaultVolume,
			file,
			defaultFile: clone(file),
		});
	}

	return formattedCues;
}
