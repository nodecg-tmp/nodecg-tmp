import path from 'path';
import webpack from 'webpack';

const isDev = process.env.NODE_ENV !== 'production';

const config: webpack.Configuration = {
	mode: isDev ? 'development' : 'production',
	resolve: {
		extensions: ['.ts', '.js', '.json'],
	},
	entry: {
		dashboard: './src/client/dashboard/elements/ncg-dashboard.js',
		socket: './src/client/socket.ts',
		api: './src/client/api/api.client.ts',
	},
	output: {
		path: path.resolve(__dirname, 'build/client'),
		filename: '[name].js',
	},
	module: {
		rules: [
			{
				test: /\.ts$/,
				loaders: [
					{
						loader: 'ts-loader',
						options: {
							transpileOnly: true,
							configFile: 'src/client/tsconfig.json',
						},
					},
				],
			},
			{ test: /\.js$/, loader: 'babel-loader' },
		],
	},
	plugins: [new webpack.EnvironmentPlugin(['BROWSER'])],
};

export default config;
